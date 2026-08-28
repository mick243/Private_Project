-- ============================================================
-- 관리자 계정
--
-- players 에 두 칸을 더합니다. 계정 테이블을 새로 만들지 않는 이유:
-- 관리자도 제보·리뷰·글을 쓰는 한 명의 플레이어입니다. 따로 두면 "관리자가 남긴
-- 제보"의 작성자를 어느 테이블에서 찾을지가 갈리고, machine_reports.player_id
-- 같은 기존 FK 가 전부 두 갈래가 됩니다.
--
--   password_hash : 관리자만 값이 있습니다 (scrypt · lib/auth.ts).
--                   일반 플레이어는 아직 인증이 없어 NULL 입니다.
--   is_admin      : 오락실 정보 수정 · 제보 삭제 권한.
--
-- 실제 계정은 ADMIN_NICKNAME / ADMIN_PASSWORD 환경변수를 근거로 로그인 시점에
-- 만들어집니다 (lib/auth.ts ensureAdminAccount) — 해시를 시드에 박아 두면
-- 비밀번호가 저장소에 남고, 바꾸려면 DB 를 손대야 합니다.
--
-- ⚠ 여러 번 실행해도 안전해야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
