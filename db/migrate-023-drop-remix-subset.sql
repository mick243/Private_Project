-- ============================================================
-- 023 · 리믹스 78곡 제거
--
-- 021 이 넣은 리믹스 중 78곡을 뺍니다. 남는 리믹스는 35곡입니다.
--   리믹스 보유 113곡 − 78곡 = 35곡
--
-- ─── 확인한 것 ───────────────────────────────────────────
--   · 78곡 모두 songs 에 실재하고 제목이 정확히 일치합니다 (부분 일치 없음).
--   · 목록에 중복 입력이 없습니다.
--   · **78곡 모두 채보가 붙어 있지 않습니다.** 그래서 곡 행만 사라지고
--     서열표(채보·투표·클리어)는 영향을 받지 않습니다.
--
-- ⚠ `Novasonic Mix ver. 3` 이 목록에 포함돼 함께 지워집니다. 022 에서 지운
--   `Novasonic Remix` 와는 다른 곡인데, 이번 목록에 들어 있어 그대로 처리합니다.
--
-- 여러 번 실행해도 결과가 같습니다 — 지울 것이 없으면 0행입니다.
--
-- 되돌리려면 021 의 해당 VALUES 를 다시 INSERT 하세요
--   (아티스트는 원래 전부 NULL 이었습니다).
-- ============================================================

DELETE FROM songs
WHERE machine_id = 1
  AND title IN (
  '1st 디바 리믹스',
  '1st 디스코 리믹스',
  '1st 테크노 리믹스',
  'Jo Sung Mo Remix',
  '엄정화 리믹스',
  'SM Town Remix',
  'Techno Repeatorment',
  '2nd 히든 리믹스',
  '3rd O.B.G. Diva Remix',
  'Park Mee Kyung Remix',
  'Park Jin Young Remix',
  'BanYa Hard Mix',
  'Exceed 2 Diva''s Remix',
  'World Remix',
  'B.P.M. Collection 1 (Auditions)',
  'Pumpster Zone 2-1',
  'Hamera',
  'World Pop Mix',
  'Ladimera',
  'B.P.M. Collection 4 (etc. Mix)',
  'K-Pop Girl Group RMX',
  'K-Pop Boy Group RMX',
  'The Historic Classic Remix A',
  'The Historic Classic Remix B',
  'Armakitten 2-X',
  'Blowin'' It Up',
  'Dawgs in Da Revolution',
  'Destroy Them!',
  'Final Audition Infinity',
  'MAWARU INFINITY',
  'Napalmancy',
  'WI-EX-DOC-VACUUM',
  'Amadeustreme',
  'msgoon RMX pt. 7',
  'History: We Are The Zest',
  'Pump It Up With You',
  'Get Up (And Go) 180',
  'Danger Zone Twins',
  'Horse Mix',
  'Witch Core',
  'B.P.M. Collection 3 (Pumptris)',
  'Monkey-rang',
  'Whimera',
  'Trato X4',
  'Solitary Elise',
  'Turkey Mix',
  'Beatreme of the Wisp',
  'Pumping Jam',
  '4-X',
  'Chicken Doctor',
  'Cannon X-Tree',
  'DJ. Moon',
  'KM Pop Mix',
  'Final Danger Sticks',
  'To.Jam.Fa',
  'B.P.M. Collection 2 (Solitaries)',
  'NX2 K-Pop Remix 1',
  'NX2 K-Pop Remix 2',
  'NX2 Diva Remix',
  'Final Audition 3 & Chimera Remix',
  'Yasangma',
  'Mr. Fire Fighter & Beat of the War 2',
  '45RPM & Eun Ji Won Mix',
  'The People Didn''t Know "Pumping Up"',
  'Ugly Duck Toccata',
  'Caprice of DJ Otada',
  'Dr. K.O.A',
  'Novasonic Mix ver. 3',
  'Turkey Virus',
  'Scream Song',
  'B.P Classic Remix 1',
  'K-Pop Mix (Old & New)',
  'PaPa Helloizing',
  'B.P Classic Remix 2',
  'Set Up Me 2 Mix',
  'Bee-Mera',
  'K-House Mix',
  'Groove Party'
);
