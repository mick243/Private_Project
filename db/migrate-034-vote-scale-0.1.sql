-- ============================================================
-- 034 · 투표 스케일을 등급 스케일과 맞추고 눈금을 0.1 로
--
-- ─── 왜 ──────────────────────────────────────────────────
-- 014 가 등급 anchor 를 좌우 대칭(최상 1.0 … 최하 -1.0)으로 바꿀 때
-- **vote_min/vote_max 는 그대로 뒀습니다.** 그래서 슬라이더는
-- -1.25 ~ 1.75(펌프) · -1.25 ~ 1.25(사볼) 인데 등급은 -1.0 ~ 1.0 이라,
-- 양 끝 구간은 어떤 등급에도 닿지 못하는 죽은 영역이었습니다.
-- 투표 범위를 등급 범위와 같게 맞춥니다.
--
-- 눈금도 0.25(= tier_step/2) 에서 **0.1** 로 잘게 합니다. 화면 입력 단위라
-- tier_step 과는 별개 컬럼(vote_step)으로 뺐습니다 — tier_step 은 수렴도
-- 계산 기준이므로 등급 간격 0.50 그대로여야 합니다.
--
-- ⚠ **난이도 판정 구간은 건드리지 않습니다.** 등급은 "평균에 가장 가까운
--   anchor" 로 정해지고(schema-tier.sql recalc_chart_stats), anchor ·
--   tier_step · min_votes · min_convergence 를 모두 그대로 둡니다.
--   눈금이 0.25 → 0.1 이 되어도 같은 평균이면 같은 등급이 나옵니다.
--
-- ─── 두 게임 모두 적용합니다 ─────────────────────────────
-- 펌프(1)와 사볼(3) 둘 다 anchor 가 정확히 -1.0 ~ 1.0 이라 같은 어긋남을
-- 갖고 있었습니다. 한쪽만 고치면 기종 간 스케일이 또 달라집니다.
--
-- ─── ⚠ 범위를 벗어난 기존 투표 7건을 끌어당깁니다 ────────
-- 사볼 시드 투표 중 7건이 새 범위를 벗어납니다 (-1.20 · -1.08 · -1.02 ·
-- 1.03 · 1.05 · 1.10 · 1.25). 그대로 두면 (a) 집계 평균이 이제는 낼 수 없는
-- 값을 품고, (b) 그 사람이 자기 투표를 열면 슬라이더가 끝으로 잘린 채 보여
-- 저장만 눌러도 값이 몰래 바뀝니다. 경계로 clamp 합니다.
-- 전부 seed-community.sql 이 만든 가상 투표라 실제 사용자 데이터가 아닙니다.
-- 눈금(0.1)에 안 맞는 값은 그대로 둡니다 — 평균은 연속값이고 등급은 anchor
-- 최근접이라 문제가 없으며, 남의 투표를 반올림할 이유가 없습니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- ADD COLUMN IF NOT EXISTS · 고정값 UPDATE · GREATEST/LEAST clamp.
--
-- 되돌리려면:
--   UPDATE tier_settings SET vote_min=-1.25, vote_max= 1.75 WHERE machine_id=1;
--   UPDATE tier_settings SET vote_min=-1.25, vote_max= 1.25 WHERE machine_id=3;
--   ALTER TABLE tier_settings DROP COLUMN vote_step;
--   (clamp 된 투표 7건은 되돌아오지 않습니다)
-- ============================================================

-- ─── 1) 눈금 컬럼 ──────────────────────────────────────────
ALTER TABLE tier_settings
  ADD COLUMN IF NOT EXISTS vote_step NUMERIC(4,2) NOT NULL DEFAULT 0.10;

UPDATE tier_settings SET vote_step = 0.10;

-- ─── 2) 투표 범위 = 등급 범위 ──────────────────────────────
-- 값을 박아 넣지 않고 그 기종의 anchor 최소·최대에서 끌어옵니다 —
-- 나중에 등급 스케일이 또 바뀌어도 같은 관계가 유지됩니다.
UPDATE tier_settings ts SET
  vote_min = g.lo,
  vote_max = g.hi
FROM (
  SELECT machine_id, MIN(anchor) AS lo, MAX(anchor) AS hi
  FROM tier_grades GROUP BY machine_id
) g
WHERE g.machine_id = ts.machine_id;

-- ─── 3) 범위를 벗어난 기존 투표 clamp ──────────────────────
UPDATE difficulty_votes v SET
  value = GREATEST(ts.vote_min, LEAST(ts.vote_max, v.value)),
  updated_at = now()
FROM charts c
JOIN songs s        ON s.id = c.song_id
JOIN tier_settings ts ON ts.machine_id = s.machine_id
WHERE c.id = v.chart_id
  AND (v.value < ts.vote_min OR v.value > ts.vote_max);

-- ─── 4) 집계 ───────────────────────────────────────────────
-- clamp 된 채보의 평균이 바뀌므로 다시 계산합니다. anchor 는 그대로라
-- 판정 규칙은 같고, 평균이 움직인 채보만 등급이 달라질 수 있습니다.
SELECT recalc_chart_stats(NULL);
