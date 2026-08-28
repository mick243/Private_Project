-- ============================================================
-- 003 · 대기 제보 수명 90분 → 6시간, 그리고 실제 삭제
--
-- 지금까지 queue_ttl_minutes 는 **표시 필터**였습니다. 시간이 지나면
-- machine_live 뷰에서 빠질 뿐 행은 machine_reports 에 그대로 남아, 전국 피드의
-- '최근 24시간' 에는 20시간 전 대기 제보가 계속 떴습니다. 대기 인원은 되돌아볼
-- 값이 아니라 지나면 틀린 값이므로, 이제 수명이 다하면 행을 지웁니다
-- (lib/reports.ts purgeExpiredQueueReports — 제보 등록·피드 조회 때 함께 돕니다).
--
-- 컨디션·있어요/없어졌어요는 그대로 남습니다. 그쪽은 누적이 근거가 됩니다.
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

-- 90 일 때만 바꿉니다. 운영하면서 다른 값으로 조정해 뒀다면 그 값을 존중합니다
-- (새로 만든 DB 는 schema-community.sql 기본값이 이미 360 이라 여기서 아무 일도
--  일어나지 않습니다).
UPDATE report_settings
SET queue_ttl_minutes = 360
WHERE id = 1 AND queue_ttl_minutes = 90;

-- 이미 수명이 지난 대기 제보를 한 번 정리합니다. 이 뒤로는 앱이 알아서 지웁니다.
DELETE FROM machine_reports r
USING report_settings cfg
WHERE cfg.id = 1
  AND r.kind = 'queue'
  AND r.created_at <= now() - make_interval(mins => cfg.queue_ttl_minutes);
