-- ============================================================
-- 011 · 대기 제보 수명 6시간 → 4시간
--
-- 대기 인원은 지나면 틀린 값입니다. 6시간 전 "대기 5명" 은 지금 아무 근거도
-- 되지 못하는데, 피드의 '최근 24시간' 을 채워 방금 올라온 제보를 밀어냅니다.
-- 수명을 4시간으로 줄입니다.
--
-- 값 하나만 바꾸면 두 곳이 함께 따라옵니다 — 둘 다 이 컬럼을 읽습니다:
--   · db/views.sql 의 machine_live       (화면에서 사라지는 시점)
--   · lib/reports.ts purgeExpiredQueueReports (행이 지워지는 시점)
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

-- 360(6시간) 일 때만 바꿉니다. 운영하면서 다른 값으로 조정해 뒀다면 그 값을
-- 존중합니다 — migrate-003 이 90 일 때만 360 으로 올린 것과 같은 이유입니다.
-- 새로 만든 DB 는 schema-community.sql 기본값이 이미 240 이라 여기서 아무 일도
-- 일어나지 않습니다.
UPDATE report_settings
SET queue_ttl_minutes = 240
WHERE id = 1 AND queue_ttl_minutes = 360;

-- 새 수명 기준으로 이미 지난 대기 제보를 한 번 정리합니다. 이 뒤로는 앱이
-- 알아서 지웁니다(제보를 쓸 때·피드를 읽을 때). 이 DELETE 가 없으면 4~6시간
-- 사이의 제보가 다음 요청까지 피드에 남습니다.
DELETE FROM machine_reports r
USING report_settings cfg
WHERE cfg.id = 1
  AND r.kind = 'queue'
  AND r.created_at <= now() - make_interval(mins => cfg.queue_ttl_minutes);
