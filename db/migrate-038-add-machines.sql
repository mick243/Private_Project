-- ============================================================
-- 038 · 기종 4종 추가 — 기타도라 · 댄스러쉬 · 팝픈뮤직 · 노스탤지어
--
-- 오락실에 실제로 흔한 코나미 계열이 목록에 없어서, 제보·필터·커뮤니티
-- 게시판 어디에서도 이 게임들을 고를 수 없었습니다.
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석).
--   새로 만든 DB 는 seed.sql 에 이미 들어 있으므로 ON CONFLICT 로 조용히
--   지나가고 적용 이력만 남습니다.
-- ============================================================

-- sort_order 는 jubeat(90) 뒤로 이어 붙입니다. 이름은 기존 규칙대로
-- 공식 표기(일본어 원제는 한국어 병기), 축약명은 칩·목록에 쓰는 통칭.
INSERT INTO machines (name, short_name, category, sort_order) VALUES
  ('GITADORA',              '기타도라',  'rhythm', 100),
  ('DANCERUSH STARDOM',     '댄스러쉬',  'rhythm', 110),
  ('pop''n music',          '팝픈',      'rhythm', 120),
  ('ノスタルジア (노스탤지어)', '노스탤지어', 'rhythm', 130)
ON CONFLICT (name) DO NOTHING;

-- 수동 INSERT 이후 시퀀스 정렬 (migrate-001 과 같은 이유 — 안 하면 다음
-- 기종 등록이 중복 id 로 실패합니다).
SELECT setval('machines_id_seq', (SELECT MAX(id) FROM machines));
