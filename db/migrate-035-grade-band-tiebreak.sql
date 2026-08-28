-- ============================================================
-- 035 · 등급 판정의 동점 규칙을 좌우 대칭으로 (중 = -0.2 ~ 0.2)
--
-- ─── 왜 ──────────────────────────────────────────────────
-- 등급은 "평균에 가장 가까운 anchor" 로 정합니다. 그런데 평균이 정확히 두 anchor
-- 의 중간일 때 `sort_order ASC` 로 갈라서 **늘 높은 등급**이 이겼습니다.
-- anchor 가 좌우 대칭(펌프 0 · ±0.40 · ±0.70 · ±1.00)이라, 이 규칙은 한쪽으로만
-- 기울어집니다:
--
--   -0.2 → 중   (안쪽, 중이 중하보다 높으니 중 승)
--    0.2 → 중상 (바깥, 중상이 중보다 높으니 중상 승)
--
-- 즉 '중' 띠가 [-0.2, 0.2) 로 한쪽만 열려 있었습니다. 동점이면 **0 에 가까운
-- 안쪽 anchor** 가 이기도록 바꿔 띠를 대칭으로 만듭니다 → **중 = -0.2 ~ 0.2**
-- (양 끝 포함). 화면 쪽 ChartDetailPanel.nearestGradeIndex 도 같은 규칙입니다.
--
-- ⚠ 바뀌는 것은 **동점일 때뿐**입니다. anchor · tier_step · min_votes ·
--   min_convergence 는 그대로이고, 동점이 아닌 값의 판정은 전과 같습니다.
--
-- ─── 어떤 경계가 움직이나 ────────────────────────────────
-- 눈금 0.1 로 슬라이더가 낼 수 있는 동점은 ±0.2 뿐입니다. 평균값까지 포함하면
-- 기종별로 이렇게 바뀝니다 (→ 오른쪽이 새 판정):
--   펌프   0.20 → 중   |  0.55 → 중상 |  0.85 → 상
--          -0.20 · -0.55 · -0.85 은 이미 안쪽이었으므로 그대로
--   사볼   0.25 → 중   |  0.75 → 상
--          -0.25 · -0.75 그대로
--
-- ─── 지금 데이터에는 변화가 없습니다 ─────────────────────
-- 투표가 있는 채보 16개 중 평균이 동점 지점에 정확히 놓인 것은 없습니다.
-- 그래도 규칙이 바뀌었으니 전체를 다시 계산합니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- CREATE OR REPLACE FUNCTION + 재계산.
--
-- 되돌리려면 ORDER BY 에서 `abs(g.anchor) ASC,` 한 줄을 빼고 다시 REPLACE 한 뒤
-- recalc_chart_stats(NULL) 을 부르세요 (schema-tier.sql · 컴포넌트도 함께).
-- ============================================================

CREATE OR REPLACE FUNCTION recalc_chart_stats(p_chart_id integer) RETURNS void
LANGUAGE sql AS $fn$
  WITH stats AS (
    SELECT c.id                                AS chart_id,
           s.machine_id,
           COUNT(v.value)                      AS n,
           AVG(v.value)                        AS avg_vote,
           COALESCE(STDDEV_SAMP(v.value), 0)   AS sd
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
    vote_count  = sc.n,
    avg_vote    = CASE WHEN sc.n = 0 THEN NULL ELSE sc.avg_vote END,
    convergence = sc.convergence,
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

SELECT recalc_chart_stats(NULL);
