-- ============================================================
-- 파생 객체 (뷰) — **매번 다시 적용됩니다**
--
-- 스키마 파일들은 sentinel 테이블이 이미 있으면 건너뛰므로(lib/db.ts SQL_GROUPS),
-- 한 번 적용된 뒤에 집계식을 고쳐도 기존 DB 에는 반영되지 않습니다. 뷰는 데이터를
-- 갖지 않는 파생 객체라서 언제 다시 만들어도 안전하므로, 여기 모아 두고 서버가 뜰
-- 때마다 DROP → CREATE 합니다. 집계 규칙을 고치려면 이 파일만 고치면 됩니다.
--
-- ⚠ 테이블·시드는 여기 넣지 마세요. 매번 실행되므로 데이터가 날아갑니다.
-- ⚠ CREATE OR REPLACE VIEW 가 아니라 DROP + CREATE 인 이유: OR REPLACE 는 컬럼의
--   타입을 바꿀 수 없습니다 (wait_count 를 float8 → int 로 바꾼 것이 그 경우입니다).
--
-- schema-community.sql 이 먼저 적용된 상태를 전제로 합니다.
-- ============================================================

-- ─── "지금 이 기종" · 대기 ─────────────────────────────────
-- TTL 안의 제보만 모아 현재 상태를 만든다. 캐시 컬럼을 두지 않는 이유:
-- 대기인원은 시간이 지나기만 해도 무효가 되므로, 갱신해 줄 쓰기 시점이 없다.
--
-- 대기는 **기종 단위**다. 펌프가 2대여도 줄은 게임 앞에 서고, 제보하는 사람이
-- "몇 호기 줄인지"까지 고르게 하면 제보가 흩어져 집계가 설 자리가 없어진다.
-- 반대로 컨디션은 기체마다 다르므로 아래 cabinet_condition 으로 따로 집계한다.
--
-- GROUP BY 키가 (arcade_id, machine_id) 하나뿐이라, 이 뷰를 오락실 1곳으로 좁혀
-- 조인하면 조건이 집계 아래로 내려가 machine_reports_live_idx 를 탄다.
DROP VIEW IF EXISTS machine_live CASCADE;

CREATE VIEW machine_live AS
SELECT r.arcade_id,
       r.machine_id,
       -- 제보된 값 중 **최대값**. 평균도 중앙값도 아니다.
       --
       -- 대기 인원은 틀릴 때의 손해가 한쪽으로 기운 값이다. 실제보다 적게
       -- 알려주면 갔다가 줄 서서 돌아오지만, 많게 알려주면 안 가고 마는 정도다.
       -- 그래서 여러 제보가 엇갈리면 가장 긴 줄을 말한 사람 쪽으로 붙인다.
       -- 값이 이미 정수라 반올림/올림 처리도 필요 없다.
       --
       -- ⚠ 대신 한 명이 장난으로 99 를 넣으면 그대로 99 로 뜬다. 중앙값이었을
       --   때는 그런 값이 묻혔다. 어뷰징 방어는 제보자 신원(계정)에 매달려 있고
       --   지금은 그 방어선이 없다 — README "아직 없는 것" 참고.
       MAX(r.wait_count)::int AS wait_count,
       COUNT(*)::int          AS wait_reports,
       MAX(r.created_at)      AS wait_reported_at
FROM machine_reports r
CROSS JOIN report_settings cfg
WHERE cfg.id = 1
  AND r.kind = 'queue'
  AND r.created_at > now() - make_interval(mins => cfg.queue_ttl_minutes)
GROUP BY r.arcade_id, r.machine_id;

-- ─── "이 기체 컨디션" · 종합 ───────────────────────────────
-- 컨디션은 기체 1대 단위다. 같은 오락실 같은 게임이라도 1호기는 멀쩡한데
-- 2호기만 발판이 죽어 있는 경우가 흔한데, 기종 단위로 평균 내면 그 사실이
-- "컨디션 3.5" 한 줄로 뭉개진다.
--
-- **등록 컨디션과 제보를 한 덩어리로 본다.** 예전에는 둘이 따로였다 —
-- 제보가 있으면 제보 평균, 없으면 "등록 컨디션 5/5". 같은 자리에 뜻이 다른
-- 두 숫자가 번갈아 나오면 읽는 쪽이 매번 무슨 값인지 따져야 한다.
-- 등록값을 제보 한 건처럼 세어 함께 평균낸다.
--
-- 결과는 **반올림한 정수**다. 컨디션은 1~5 다섯 칸짜리 눈금이라 "4.67" 은
-- 있지도 않은 정밀도를 주장한다. 몇 건이 모인 값인지는 reports 로 따로 준다.
--
-- cabinet_id 가 NULL 인 행(기체가 지워진 옛 제보)은 가리킬 카드가 없으므로
-- 집계에서 뺀다. 제보 목록·전국 피드에는 그대로 남는다.
DROP VIEW IF EXISTS cabinet_live      CASCADE;   -- 옛 이름 (기간 안 제보만 담던 뷰)
DROP VIEW IF EXISTS cabinet_condition CASCADE;

CREATE VIEW cabinet_condition AS
SELECT c.id AS cabinet_id,
       ROUND(
         (COALESCE(rep.total, 0) + COALESCE(c.condition, 0))::numeric
         / NULLIF(
             COALESCE(rep.n, 0) + (CASE WHEN c.condition IS NULL THEN 0 ELSE 1 END),
             0
           )
       )::int            AS value,
       -- 등록값은 세지 않는다. "제보 3건" 은 사람 셋이 확인했다는 뜻이어야 한다.
       COALESCE(rep.n, 0) AS reports,
       rep.last_at        AS reported_at
FROM arcade_cabinets c
LEFT JOIN (
  SELECT r.cabinet_id,
         SUM(r.condition)::int AS total,
         COUNT(*)::int         AS n,
         MAX(r.created_at)     AS last_at
  FROM machine_reports r
  CROSS JOIN report_settings cfg
  WHERE cfg.id = 1
    AND r.kind = 'condition'
    AND r.cabinet_id IS NOT NULL
    AND r.created_at > now() - make_interval(days => cfg.condition_window_days)
  GROUP BY r.cabinet_id
) rep ON rep.cabinet_id = c.id;
