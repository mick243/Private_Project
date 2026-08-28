-- ============================================================
-- 041 · 특수 패턴을 인원 합의로 (3명 이상) + 투표 등급 병기
--
-- ─── 왜 바꾸나 ───────────────────────────────────────────
-- 040 은 charts.is_special 불리언 하나였습니다. 한 사람이 켜면 모두에게 그렇게
-- 보이는 구조라 040 헤더에 남용 우려를 적어 뒀는데, 그 지적대로 **표시한 사람을
-- 기록해 인원으로 판정**하도록 바꿉니다. 투표의 min_votes 와 같은 방식입니다.
--
--   special_marks (player_id, chart_id)  ← 누가 표시했는지
--   charts.special_count                 ← 그 개수 캐시 (recalc_chart_stats 가 갱신)
--   tier_settings.special_min = 3        ← 이 수 이상이면 '특수패턴' 칸
--
-- ─── ⚠ tier_code 는 여전히 덮지 않습니다 ─────────────────
-- 등급은 투표대로 계산돼 tier_code 에 그대로 남고, 특수패턴 칸으로 보내는 것은
-- **읽을 때** 입니다 (lib/tier-types.ts tierCodeOf). 그래서
--   · 표시가 3명 아래로 내려가면 원래 등급이 재계산 없이 돌아옵니다
--   · 채보 상세의 '현재 등급' 을 **'특수패턴 / 중상'** 처럼 둘 다 보여줄 수 있습니다
--     (한쪽만 쓰면 투표로 쌓은 등급이 화면에서 사라집니다)
--
-- ─── special_min 을 min_votes 와 따로 두는 이유 ──────────
-- 둘 다 지금은 3 이지만 성격이 다릅니다 — min_votes 는 "평균을 믿을 만한 표본",
-- special_min 은 "기믹 채보라는 데 대한 합의". 한쪽을 올릴 때 다른 쪽이 끌려가면
-- 안 되므로 컬럼을 나눕니다 (임계값을 DB 에 두는 이유는 schema-tier.sql 주석 참고).
--
-- ─── 040 의 표시는 옮길 것이 없습니다 ────────────────────
-- is_special 이 켜진 채보가 0건인 상태에서 이 파일을 만들었습니다. 혹시 켜진 것이
-- 있으면 **누가 켰는지 알 수 없어** 마크로 옮길 수 없으므로, 컬럼과 함께 사라집니다
-- (그 채보는 다시 3명이 표시해야 특수패턴이 됩니다). 아래 SELECT 로 몇 건인지
-- 로그에 남깁니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- CREATE TABLE/INDEX IF NOT EXISTS · ADD/DROP COLUMN IF (NOT) EXISTS ·
-- CREATE OR REPLACE FUNCTION · 마지막에 전체 재계산.
--
-- 되돌리려면: DROP TABLE special_marks; charts.special_count 와
--   tier_settings.special_min 을 DROP 하고 040 의 is_special 을 다시 ADD 하세요.
-- ============================================================

-- ─── 0) 040 에서 켜져 있던 표시 (있으면 로그에만 남고 사라집니다) ───
SELECT COUNT(*) AS dropped_is_special_flags
FROM charts c
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'charts' AND column_name = 'is_special'
);

-- ─── 1) 표시 테이블 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS special_marks (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chart_id   INTEGER NOT NULL REFERENCES charts(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, chart_id)
);

CREATE INDEX IF NOT EXISTS special_marks_chart_idx ON special_marks (chart_id);

-- ─── 2) 컬럼 교체 ──────────────────────────────────────────
ALTER TABLE tier_settings
  ADD COLUMN IF NOT EXISTS special_min INTEGER NOT NULL DEFAULT 3;

ALTER TABLE charts
  ADD COLUMN IF NOT EXISTS special_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE charts DROP COLUMN IF EXISTS is_special;

-- ─── 3) 집계 함수 — special_count 도 함께 갱신 ─────────────
CREATE OR REPLACE FUNCTION recalc_chart_stats(p_chart_id integer) RETURNS void
LANGUAGE sql AS $fn$
  WITH stats AS (
    SELECT c.id                                AS chart_id,
           s.machine_id,
           COUNT(v.value)                      AS n,
           AVG(v.value)                        AS avg_vote,
           COALESCE(STDDEV_SAMP(v.value), 0)   AS sd,
           (SELECT COUNT(*) FROM special_marks sm WHERE sm.chart_id = c.id) AS special_n
    FROM charts c
    JOIN songs s ON s.id = c.song_id
    LEFT JOIN difficulty_votes v ON v.chart_id = c.id
    WHERE p_chart_id IS NULL OR c.id = p_chart_id
    GROUP BY c.id, s.machine_id
  ),
  scored AS (
    SELECT st.*,
           ts.min_votes,
           ts.min_convergence,
           CASE WHEN st.n < 2 THEN NULL
                ELSE GREATEST(0, 1 - st.sd / ts.tier_step)
           END AS convergence
    FROM stats st
    JOIN tier_settings ts ON ts.machine_id = st.machine_id
  )
  UPDATE charts c SET
    vote_count    = sc.n,
    special_count = sc.special_n,
    avg_vote      = CASE WHEN sc.n = 0 THEN NULL ELSE sc.avg_vote END,
    convergence   = sc.convergence,
    tier_code   = CASE
                    WHEN sc.n < sc.min_votes THEN 'undecided'
                    WHEN sc.convergence < sc.min_convergence THEN 'unique'
                    ELSE (
                      SELECT g.code FROM tier_grades g
                      WHERE g.machine_id = sc.machine_id
                      -- 동점(정확히 두 anchor 의 중간)이면 0 에 가까운 안쪽 등급.
                      ORDER BY abs(g.anchor - sc.avg_vote) ASC, abs(g.anchor) ASC,
                               g.sort_order ASC
                      LIMIT 1
                    )
                  END,
    stats_updated_at = now()
  FROM scored sc
  WHERE c.id = sc.chart_id;
$fn$;

-- ─── 4) 집계 ───────────────────────────────────────────────
SELECT recalc_chart_stats(NULL);
