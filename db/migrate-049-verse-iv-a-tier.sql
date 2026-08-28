-- ============================================================
-- 049 · Verse IV [EXH] Lv17 을 A 등급에 놓는다 (투표 재설정)
--
-- ─── 무엇을 하는가 ───────────────────────────────────────
-- 이 채보의 기존 투표 5건을 지우고, A 의 anchor 값(0.50) 그대로 3표만 넣습니다.
--
--   전:  5표 · 평균 0.000 · 수렴도 0.842 → C
--   후:  3표 · 평균 0.500 · 수렴도 1.000 → A
--
-- 047 이 읽은 출처 표에서 이 곡은 B+ 밴드이고, 요청한 변환 규칙(B+ → A)에
-- 따르면 A 입니다. 047 은 투표를 넣지 않아 이 채보만 시드 투표 때문에 C 에
-- 남아 있었습니다.
--
-- ─── 왜 0.50 · 3표인가 ───────────────────────────────────
-- tier_settings(machine_id=3): min_votes 3 · min_convergence 0.20 · tier_step 0.50
--   · 3표 = min_votes 를 정확히 채워 '미정' 을 벗어나는 최소값
--   · 세 표가 모두 0.50 이라 표준편차 0 → 수렴도 1 - 0/0.50 = 1.00
--     → min_convergence(0.20)를 넘어 '개인차' 로 새지 않는다
--   · 평균 0.50 은 A 의 anchor 와 정확히 같아 가장 가까운 등급이 A 다
--     (인접: A+ 0.70 · B 0.20 — 각각 0.20 · 0.30 떨어져 있다)
--   · 0.50 은 vote_step(0.10) 눈금 위에 있어 화면 슬라이더로도 낼 수 있는 값이다
--
-- ⚠ **anchor 에서 끌어온 값입니다.** tier_grades 의 A anchor 가 바뀌면 이 3표는
--   근거 없는 숫자가 되고 등급도 따라 움직입니다 — migrate-014 가 같은 이유로
--   012 의 가상 투표를 지운 전례가 있습니다. 실제 투표가 쌓이면 이 3표는
--   지우는 편이 낫습니다.
--
-- ─── 클리어 기록은 그대로 둡니다 ─────────────────────────
-- difficulty_votes 는 (player_id, chart_id) 로 clear_records 를 참조하므로
-- 투표하려면 클리어 기록이 있어야 합니다. 5명(스텝퍼·발바닥·트월·하프더블·
-- 브렉온) 모두 기록이 있어, 그중 셋이 투표하고 둘은 '클리어했지만 투표 안 함'
-- 상태가 됩니다 — 이 스키마가 정상으로 다루는 상태입니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 지우고 다시 넣으므로 몇 번을 돌려도 3표 · 0.50 입니다.
--
-- 되돌리려면: 지워진 원래 5표(0.10 · 0.05 · 0.00 · -0.05 · -0.10)는 복구되지
--   않습니다. 값은 seed-community.sql 이 만든 시드입니다.
-- ============================================================

-- 대상 채보 하나 (사볼 · Lv17 · Verse IV)
CREATE TEMP TABLE tgt AS
SELECT c.id
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 3 AND s.title = 'Verse IV' AND c.level = 17;

-- ─── 1) 기존 투표 삭제 ────────────────────────────────────
DELETE FROM difficulty_votes WHERE chart_id IN (SELECT id FROM tgt);

-- ─── 2) A 의 anchor 로 3표 ────────────────────────────────
-- 값을 0.50 으로 박지 않고 tier_grades 에서 읽어 옵니다. 등급표와 투표가
-- 어긋나지 않게 하려는 것입니다 (숫자를 박으면 anchor 를 고칠 때 여기가 남습니다).
INSERT INTO difficulty_votes (player_id, chart_id, value)
SELECT r.player_id, t.id, g.anchor
FROM tgt t
JOIN tier_grades g ON g.machine_id = 3 AND g.code = 'a'
JOIN LATERAL (
  SELECT player_id FROM clear_records WHERE chart_id = t.id ORDER BY player_id LIMIT 3
) r ON true
ON CONFLICT (player_id, chart_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ─── 3) 집계 캐시 갱신 ────────────────────────────────────
SELECT recalc_chart_stats(id) FROM tgt;

DROP TABLE tgt;
