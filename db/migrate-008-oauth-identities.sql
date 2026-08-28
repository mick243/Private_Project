-- ============================================================
-- 소셜 로그인 신원 (Google · 카카오 · 네이버)
--
-- players 에 provider/provider_uid 칸을 더하지 않고 표를 따로 두는 이유:
-- 한 사람이 카카오로 가입했다가 나중에 구글도 연결할 수 있어야 하고, 그때
-- players 에 칸을 두면 "둘 중 하나만" 이 되어 계정이 갈라집니다. 여기서는
-- (provider, provider_uid) 가 키이고 player_id 는 여러 줄이 같이 가리킵니다.
--
--   provider_uid : 제공자가 주는 회원 번호. 이메일이 아닙니다 — 이메일은 바뀌고,
--                  카카오는 동의를 안 하면 주지도 않습니다.
--   email        : 참고용 사본. 로그인 판단에는 쓰지 않습니다 (제공자마다
--                  검증 여부가 달라서, 이걸로 계정을 합치면 남의 계정을 가져갈
--                  길이 열립니다).
--
-- players.password_hash 는 그대로 NULL 일 수 있습니다 — 소셜로만 가입한 사람은
-- 비밀번호가 없고, 아이디/비밀번호 로그인은 애초에 대상이 아닙니다
-- (lib/auth.ts authenticate 는 password_hash 가 NULL 이면 곧장 실패합니다).
--
-- ⚠ 여러 번 실행해도 안전해야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

CREATE TABLE IF NOT EXISTS player_identities (
  provider     TEXT    NOT NULL,
  provider_uid TEXT    NOT NULL,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  email        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_uid)
);

-- "이 사람이 무엇으로 연결해 뒀는가" 를 계정 화면에서 묻게 됩니다.
CREATE INDEX IF NOT EXISTS idx_identities_player ON player_identities(player_id);
