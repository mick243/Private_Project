-- ============================================================
-- 006 · 005 이후 어긋난 부분 동기화 + 북미 전용판(Pro 2)·모바일판(M) 제거
--
-- 005 는 그 뒤 파일이 직접 수정됐습니다(아티스트 보정, BEE 추가, 일부 곡 제외).
-- 이미 적용된 마이그레이션은 다시 실행되지 않으므로(lib/db.ts runMigrations
-- 주석 참고) 그 수정이 기존 DB 에는 반영되지 않았습니다. 이 파일이 그 차이를
-- 메꾸고, 사용자가 요청한 6.2·7.3.1 제외를 적용합니다.
--
-- ─── 1) 005 파일과 라이브 DB 사이 동기화 ─────────────────
--   DB 에 없는데 파일엔 있는 곡  : 2  (BEE, Love is A Danger Zone pt.2)
--   파일엔 없는데 DB 에 남은 곡  : 5  (일본 한정판에서 제외된 곡, 채보 없음 확인)
--
-- ─── 2) 6.2 Pump It Up Pro 2(북미 전용판) + 7.3.1 펌프 잇 업 M(모바일) 제거 ──
-- 나무위키 펌프 잇 업/수록곡 (CC BY-NC-SA 2.0 KR), robots.txt 가 허용하는 /w/ 만.
-- 두 목록과 교집합인 곡을 지웁니다 (둘 다 국내 오락실 기체가 아님).
-- 단 비고에 '~~에 이식' 이라고 적힌 곡은 본가에서도 플레이 가능하므로 남깁니다.
--   교집합 총 123행 · 이식 표기로 남김 30 · 삭제 86
--
-- ⚠ 채보(charts)가 붙은 곡은 지우지 않습니다(사용자 난이도 투표가 CASCADE 로
--   같이 사라지므로). 시드 곡이 목록과 겹치면 곡은 남습니다.
--
-- ⚠ 대소문자만 다른 중복도 정리합니다 (BEE/Bee, Love is A/a Danger Zone pt.2).
--   채보가 붙지 않은 쪽만 지웁니다.
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

-- 1a) 파일에는 있지만 DB 에 없는 곡 추가
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('BEE', 'Banya'), ('Love is A Danger Zone pt.2', NULL)
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- 1b) 005 에서 제외됐는데 DB 에 남아 있는 곡 정리 (채보 없는 것만)
DELETE FROM songs
WHERE machine_id = 1
  AND title = ANY(ARRAY['방과 후 스트라이드', '세츠나 트립', '신앙 –1st desire–', '아이, 유레테...', '잡동사니 이노센스']::text[])
  AND id NOT IN (SELECT DISTINCT song_id FROM charts);

-- 2a) 이식 표기가 있어 남기는 곡 — 없으면 되살린다 (30곡)
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('4NT', NULL), ('About The Universe', NULL),
  ('Allegro Con Fuoco', 'DM Ashura'), ('Binary Star', NULL),
  ('Burn Out', NULL), ('Dancing', NULL),
  ('Dream To Nightmare', 'Nightmare'), ('ESP', NULL),
  ('Eternal Universe', NULL), ('Festival of Death Moon', NULL),
  ('Fracture Temporelle', NULL), ('Galaxy Collapse', NULL),
  ('Gargoyle', 'Sanxion7'), ('God Mode 2.0 feat. Skizzo', NULL),
  ('Hardkore of the North', 'Diclonius Kid'), ('Highway Chaser', NULL),
  ('Human Extinction (PIU Edit)', NULL), ('Necromancy', 'Zircon'),
  ('Nyan-turne (feat. KuTiNA)', NULL), ('Perpetual', NULL),
  ('Smells Like a Chocolate', 'Vospi'), ('Star Command', 'Zircon'),
  ('That Kitty (PIU Edit)', NULL), ('Tribe Attacker', 'Hi-G'),
  ('Ultimate Eyes', NULL), ('ULTIMATUM', NULL),
  ('Underworld ft. Skizzo (PIU Edit)', NULL), ('What Happened', 'Throwdown'),
  ('X-Rave', 'DM Ashura'), ('刻限回廊ラビリンス', NULL)
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- 2b) 교집합 제거 (86곡)
DELETE FROM songs s
WHERE s.machine_id = 1
  AND NOT EXISTS (SELECT 1 FROM charts c WHERE c.song_id = s.id)
  AND lower(s.title) IN (
    '2step baby', 'accelerator', 'all of the world',
    'back in boogie town', 'bang the bass', 'bestest frenemy!',
    'beyond the sky', 'boom digi da', 'boulafacet',
    'breathing you in', 'chaotic white', 'closer to heaven',
    'coalesce', 'concerto', 'cosmic unconsciousness',
    'cowgirl', 'crowdpleaser (drop the mic mix)', 'dabbi doo',
    'dawgs in da house', 'dead soul', 'disco punks on jolt',
    'don''t don''t go away', 'elder god shrine', 'electrock',
    'eternus', 'fairy dash', 'frozen',
    'go! (ek mix)', 'hanky panky', 'hardkore atomic',
    'haven', 'hell flame', 'i think i like that sound',
    'i''m just a dj', 'ika uka', 'in the groove',
    'in the night', 'king of the beats', 'lifestreaming',
    'lolitabot', 'man vs mountain', 'maslo',
    'memory', 'mind your matter', 'mission incredible',
    'never give up!', 'new world', 'novatail',
    'oh oh oh sexy vampire', 'one step higher', 'operator',
    'photosynthesis', 'pink fuzzy bunnies', 'playa d'' embossa (i feel love)',
    'poco loco', 'power trip', 'quantum hyperspace',
    'rave until the night is over (cyber trance mix)', 'red blossom', 'right back up',
    'rock robotic -osx mix-', 'réveil α', 'shine (breakz mix)',
    'smart optics', 'span', 'step on it',
    'supremacy', 'sweet senorita', 'swing baby swing',
    'swing the house', 'tell me a story (compendium mix)', 'terminal',
    'the game of love', 'the last firstborn', 'the neon underground',
    'the next step', 'ufo catcher', 'unlikely (stay with me)',
    'wake up', 'wanting you', 'we are loud',
    'wham bam boogie', 'while tha rekkid spinz', 'you bring the rain',
    'z -the new legend-', 'パラパラ☆熱く→dancing2night'
  );

-- 3) 대소문자만 다른 중복 정리 — 채보가 붙지 않은 쪽만 지운다.
DELETE FROM songs d
WHERE d.machine_id = 1
  AND NOT EXISTS (SELECT 1 FROM charts c WHERE c.song_id = d.id)
  AND EXISTS (
    SELECT 1 FROM songs k
     WHERE k.machine_id = d.machine_id
       AND k.id <> d.id
       AND lower(k.title) = lower(d.title)
  );
