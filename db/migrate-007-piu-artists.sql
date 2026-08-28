-- ============================================================
-- 007 · Pump It Up 아티스트 NULL 값 채우기 (111곡)
--
-- 005/006 이후에도 나무위키 표에 아티스트 칸이 없거나(모바일판 M, PHOENIX
-- 계열 표는 열이 밀려 못 읽음) 표 자체에 아티스트가 비어 있는 곡이 111곡
-- 남아 있었습니다. 전부 웹 검색으로 채웠습니다.
--
-- ─── 주 출처 ─────────────────────────────────────────────
--  · Wikipedia "List of Pump It Up songs" — 시대별 정식 크레딧 표
--    (1st Dance Floor ~ Phoenix 2, PRO/PRO 2/Infinity/M 포함)
--  · GitHub dtinth/pump-it-up-songlist (songlist.tsv) — Fiesta EX 시대
--    ASDF/Pavane 교차 확인
--  · 웹 검색 — 그 외 개별 곡 3곡 (ASDF, Pavane, 刻限回廊ラビリンス)
--
-- ─── 확인이 필요했던 것들 ──────────────────────────────────
--  · ASDF → 'Doin' — Doin 의 또다른 이명(異名). 웹 검색과 songlist.tsv
--    (Fiesta EX, 'ASDF' 행) 두 곳에서 확인.
--  · Pavane → 'V.A.' — 포레 파반느 F#단조 Op.50 리믹스, 특정 작곡가 없이
--    '여러 아티스트(V.A.)' 로 공식 크레딧됨. songlist.tsv 도 동일.
--  · 익스트림 음악학원 2교시 feat. Nanahira → 이 파일이 아니라 이미 채워진
--    '1교시' 항목(같은 파일 내)의 아티스트를 그대로 사용 — 같은 시리즈의
--    후속곡이라 아티스트가 같음.
--  · 刻限回廊ラビリンス(시간의 회랑 라비린스) → 'Λ:llhα (ΛNE + 2riΛ)'
--
-- ⚠ 이 파일이 다루는 111곡은 전부 이 시점(007 적용 시점)에 machine_id=1
--   PIU 곡 목록에 존재해야 갱신됩니다. 없는 제목은 조용히 건너뜁니다
--   (UPDATE ... WHERE title = v.title 이 매치되는 행이 없으면 아무 일도
--   하지 않음 — 여러 번 실행해도 안전합니다).
-- ============================================================

UPDATE songs AS s
SET artist = v.artist
FROM (VALUES
  ('4NT', 'PODA'), ('A Little Less Conversation', 'Elvis Presley'),
  ('About The Universe', 'SOTUI & MIssionary'), ('Amphitryon', 'Gentle Stick'),
  ('Annihilator Method', 'DM Ashura'), ('Another Truth', 'Novasonic'),
  ('Arirang', 'BanYa Production'), ('ASDF', 'Doin'),
  ('Avalanche', 'Memme'), ('B2', 'MAX'),
  ('Bad Character(못된 성질)', 'Jang Na Ra'), ('Binary Star', 'Synthwulf'),
  ('Blaze Emotion (Band Version)', 'Yahpp'), ('Blazing', 'BanYa'),
  ('Breakin''Love', 'Steve Yoo'), ('Bullfighter''s Song', 'BanYa Production'),
  ('Burn Out', 'WyvernP'), ('Campanella', 'Cashew'),
  ('Certain Victory', 'Taiji Boys'), ('Cosmical Rhythm', 'SID-Sound'),
  ('Csikos Post', 'BanYa'), ('Dance with me', 'BanYa'),
  ('Dancing', 'Said'), ('Digan Lo Que Digan(나완 상관없어)', 'Nina Pilots'),
  ('Do It!', 'House Rulez'), ('Do you know that - old school', 'BanYa Production'),
  ('Dolly Kiss', 'SID-Sound'), ('Elysium', 'Warak'),
  ('Emperor', 'BanYa'), ('ESP', 'nato'),
  ('Eternal Universe', 'Quree'), ('Extravaganza', 'BanYa'),
  ('Faster Z', 'Yahpp'), ('Feel My Happiness', '3R2'),
  ('Festival of Death Moon', 'SHK'), ('Final Audition Episode 2-2', 'Yahpp'),
  ('First Love (Spanish ver.)', 'BanYa'), ('Force of Ra', 'Memme'),
  ('Fracture Temporelle', 'Kurokotei'), ('Galaxy Collapse', 'Kurokotei'),
  ('Gentleman Quality', 'C.B. Mass'), ('Get Up (And Go)', 'BanYa Production'),
  ('God Mode 2.0 feat. Skizzo', 'Nato'), ('Hayuga', 'Taiji Boys'),
  ('Hello William', 'BanYa Production'), ('Hi-Bi', 'BanYa'),
  ('Highway Chaser', 'Cosmograph'), ('Human Extinction (PIU Edit)', 'MonstDeath'),
  ('HUSH', 'Yassi Pressman & Nadine Lustre'), ('Hyacinth', 'Yahpp'),
  ('I am Your Girl', 'S.E.S'), ('Interference', 'Doin'),
  ('It''s My Party', 'Thalia'), ('Just A Girl', 'No Doubt'),
  ('Katkoi', 'M2U'), ('Let''s Get the Party Started', 'P!nk'),
  ('Let''s Groove', 'Earth, Wind & Fire'), ('Love is A Danger Zone', 'BanYa'),
  ('Mad5cience', 'Paul Bazooka'), ('Maria', 'BanYa'),
  ('Master of Puppets', 'Metallica'), ('Midnight Blue', 'BanYa'),
  ('Miss S'' Story', 'BanYa'), ('Moment Day', 'MAX'),
  ('Moonlight', 'BanYa'), ('Music', 'Madonna'),
  ('My Fantasy', 'Taiji Boys'), ('Naissance 2', 'BanYa'),
  ('Name of the Game', 'The Crystal Method'), ('Nyan-turne (feat. KuTiNA)', 'Cashew & Castellia'),
  ('Objection', 'Shakira'), ('Pavane', 'V.A.'),
  ('Pañuelito Rojo(붉은 손수건)', 'Big Metra'), ('Perpetual', 'Qu-ail'),
  ('Phantom', 'BanYa'), ('Phantom -Intermezzo-', 'BanYa Production'),
  ('Point Break', 'BanYa'), ('Procedimientos Para Llegar A Un Comun Acuerdo(잘 가 내 사랑)', 'Pxndx'),
  ('Pump Me Amadeus', 'BanYa'), ('Rapper''s Delight', 'Sugarhill Gang'),
  ('Removable Disk0', 'Doin'), ('Robot Battle', 'CYO Style'),
  ('Rush-Hour', 'litmus*'), ('Set Me Up', 'BanYa'),
  ('Silhouette Effect', 'Nato'), ('Solfeggietto', 'Fiverwater'),
  ('Solitary 2', 'BanYa'), ('Sorceress Elise', 'Yahpp'),
  ('Super Capriccio', 'SHK'), ('Tek -Club Copenhagen-', 'BanYa Production'),
  ('That Kitty (PIU Edit)', 'MonstDeath'), ('The Devil', 'BanYa Production'),
  ('Throw''em Up', 'Andrew Kim'), ('Till the end of time', 'BanYa'),
  ('Turkey March -Minimal Tunes-', 'BanYa Production'), ('U Got Me Crazy', 'MAX'),
  ('U Got Me Rocking', 'MAX'), ('Ugly Dee', 'BanYa Production'),
  ('Ultimate Eyes', 'HyuN'), ('ULTIMATUM', 'Cosmograph'),
  ('Underworld ft. Skizzo (PIU Edit)', 'MonstDeath vs Neutral Moon'), ('Violet Perfume', 'SHK'),
  ('Walkie Talkie Man', 'Steriogram'), ('We Got 2 Know', 'MAX'),
  ('We Will Meet Again', 'BanYa'), ('Will o'' The Wisp', 'BanYa'),
  ('Witch Doctor', 'BanYa'), ('X-Tream', 'BanYa'),
  ('Xenesis', 'BanYa Production'), ('刻限回廊ラビリンス', 'Λ:llhα (ΛNE + 2riΛ)'),
  ('익스트림 음악학원 2교시 feat. Nanahira', 'Massive New Krew & RoughSketch')
) AS v(title, artist)
WHERE s.machine_id = 1 AND s.title = v.title AND s.artist IS NULL;
