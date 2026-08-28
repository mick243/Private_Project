-- ============================================================
-- 서열표 시드
--
-- 곡 제목은 실제 Pump It Up 수록곡이지만, **등급 배치는 아래에서 생성한
-- 가상 투표의 결과**입니다. 어떤 실제 서열표를 옮겨온 것이 아닙니다.
-- 집계 파이프라인이 동작하는지 보기 위한 데이터입니다.
-- ============================================================

-- ─── 집계 설정 (Pump It Up = machines.id 1) ────────────────
-- anchor 간격 0.5 기준의 7단계. 이 값들은 운영하면서 조정할 튜닝 파라미터이지,
-- 어딘가에서 검증된 상수가 아닙니다. tier_settings/tier_grades 만 바꾸면 됩니다.
--
-- ⚠ **현재 값이 아닙니다.** migrate-014 가 anchor 를 좌우 대칭 스케일
--   (최상 1.0 · 상 0.7 · 중상 0.4 · 중 0 · … · 최하 -1.0) 로, min_convergence 를
--   0.30 으로 바꿉니다. 여기를 최종값으로 고쳐 놓으면 안 됩니다 —
--   migrate-012 가 투표값을 **그 시점의 anchor 에서** 끌어오기 때문에, 시드를
--   고치면 새로 만든 DB 의 투표값이 이미 적용된 DB 와 달라집니다.
--   시드는 그때의 상태로 두고, 바꾸는 것은 마이그레이션이 합니다.
INSERT INTO tier_settings (machine_id, vote_min, vote_max, tier_step, min_votes, min_convergence)
VALUES (1, -1.25, 1.75, 0.50, 3, 0.20);

INSERT INTO tier_grades (machine_id, code, label, anchor, sort_order) VALUES
  (1, 'ss', '최상',  1.75, 1),
  (1, 's',  '상',    1.25, 2),
  (1, 'a',  '중상',  0.75, 3),
  (1, 'b',  '중',    0.25, 4),
  (1, 'c',  '중하', -0.25, 5),
  (1, 'd',  '하',   -0.75, 6),
  (1, 'dd', '최하', -1.25, 7);

-- ─── 플레이어 ──────────────────────────────────────────────
INSERT INTO players (nickname) VALUES
  ('스텝퍼'), ('발바닥'), ('트월'), ('하프더블'), ('브렉온'), ('겟백'),
  ('노미스장인'), ('폭타러'), ('비트매냐'), ('싱글고인물'), ('더블입문'), ('주말러');

-- ─── 곡 ────────────────────────────────────────────────────
INSERT INTO songs (machine_id, title, artist) VALUES
  (1, 'Bee',                        'BanYa'),
  (1, 'Love is a Danger Zone pt.2', 'BanYa'),
  (1, 'Final Audition Ep.2-X',      'BanYa'),
  (1, 'Canon-D',                    'BanYa'),
  (1, 'Vook',                       'BanYa'),
  (1, 'Beethoven Virus',            'BanYa'),
  (1, 'Turkey March',               'BanYa'),
  (1, 'Napalm',                     'BanYa'),
  (1, 'Hypercube',                  'Memme'),
  (1, 'Bad Apple!! feat. nomico',   'Alstroemeria Records'),
  (1, 'Chimera',                    'Yak_Won'),
  (1, 'Monkey Fingers',             'BanYa'),
  (1, 'Cross Over',                 'Cranky'),
  (1, 'Scorpion King',              'r300k'),
  (1, 'Destination',                'SHK'),
  (1, 'Hellfire',                   'Cashell'),
  (1, 'Prime Time',                 'Nato'),
  (1, 'Obliteration',               'ATAS'),
  (1, 'Nihilism',                   'Yak_Won'),
  (1, 'Sarabande',                  'SPHAM');

-- ─── 채보 ──────────────────────────────────────────────────
INSERT INTO charts (song_id, mode, level)
SELECT s.id, p.mode, p.level
FROM (VALUES
  ('Bee',                        'S', 15),
  ('Love is a Danger Zone pt.2', 'S', 15),
  ('Final Audition Ep.2-X',      'S', 15),
  ('Canon-D',                    'S', 15),
  ('Vook',                       'S', 15),
  ('Beethoven Virus',            'S', 15),
  ('Turkey March',               'S', 15),
  ('Napalm',                     'S', 15),
  ('Hypercube',                  'S', 15),
  ('Bad Apple!! feat. nomico',   'S', 15),
  ('Chimera',                    'S', 15),
  ('Monkey Fingers',             'S', 15),
  ('Cross Over',                 'S', 15),
  ('Scorpion King',              'S', 15),
  ('Destination',                'S', 16),
  ('Hellfire',                   'S', 16),
  ('Prime Time',                 'S', 16),
  ('Obliteration',               'S', 16),
  ('Nihilism',                   'S', 16),
  ('Bee',                        'D', 18),
  ('Canon-D',                    'D', 18),
  ('Napalm',                     'D', 18),
  ('Monkey Fingers',             'D', 18),
  ('Sarabande',                  'D', 18)
) AS p(title, mode, level)
JOIN songs s ON s.title = p.title AND s.machine_id = 1;

-- ─── 가상 클리어 기록 + 투표 ───────────────────────────────
-- base = 그 채보의 "실제" 체감 난이도, spread = 의견이 갈리는 정도,
-- voters = 클리어해서 투표까지 한 인원 수.
-- 투표값은 난수 대신 (player_id, chart_id) 기반 결정론적 지터라 재현 가능합니다.
CREATE TEMP TABLE seed_plan AS
SELECT c.id AS chart_id, p.base, p.spread, p.voters
FROM (VALUES
  -- title, mode, level, base, spread, voters
  ('Bee',                        'S', 15,  1.60::numeric, 0.05::numeric, 10),  -- 최상
  ('Love is a Danger Zone pt.2', 'S', 15,  1.30,          0.06,           9),  -- 상
  ('Final Audition Ep.2-X',      'S', 15,  1.15,          0.05,           8),  -- 상
  ('Canon-D',                    'S', 15,  0.80,          0.06,          11),  -- 중상
  ('Vook',                       'S', 15,  0.62,          0.07,           9),  -- 중상
  ('Beethoven Virus',            'S', 15,  0.30,          0.06,          10),  -- 중
  ('Turkey March',               'S', 15,  0.20,          0.05,           7),  -- 중
  ('Napalm',                     'S', 15,  0.10,          0.06,           8),  -- 중
  ('Hypercube',                  'S', 15, -0.20,          0.05,           9),  -- 중하
  ('Bad Apple!! feat. nomico',   'S', 15, -0.35,          0.06,           8),  -- 중하
  ('Chimera',                    'S', 15, -0.70,          0.05,           7),  -- 하
  ('Monkey Fingers',             'S', 15, -1.10,          0.06,           6),  -- 최하
  ('Cross Over',                 'S', 15,  0.50,          0.35,          10),  -- 고유(의견 분산)
  ('Scorpion King',              'S', 15,  0.90,          0.10,           2),  -- 미정(표본 부족)
  ('Destination',                'S', 16,  1.40,          0.06,           7),
  ('Hellfire',                   'S', 16,  0.70,          0.06,           8),
  ('Prime Time',                 'S', 16,  0.05,          0.05,           6),
  ('Obliteration',               'S', 16, -0.60,          0.06,           5),
  ('Nihilism',                   'S', 16,  0.60,          0.30,           8),  -- 고유
  ('Bee',                        'D', 18,  1.20,          0.05,           6),
  ('Canon-D',                    'D', 18,  0.40,          0.06,           7),
  ('Napalm',                     'D', 18, -0.10,          0.05,           5),
  ('Monkey Fingers',             'D', 18, -0.90,          0.06,           4),
  ('Sarabande',                  'D', 18,  1.00,          0.05,           2)   -- 미정
) AS p(title, mode, level, base, spread, voters)
JOIN songs  s ON s.title = p.title AND s.machine_id = 1
JOIN charts c ON c.song_id = s.id AND c.mode = p.mode AND c.level = p.level;

INSERT INTO clear_records (player_id, chart_id)
SELECT pl.id, sp.chart_id
FROM seed_plan sp
JOIN players pl ON pl.id <= sp.voters;

INSERT INTO difficulty_votes (player_id, chart_id, value)
SELECT pl.id,
       sp.chart_id,
       -- 결정론적 지터: -3 ~ +3 단계 × spread
       GREATEST(-1.25, LEAST(1.75,
         sp.base + sp.spread * (((pl.id * 37 + sp.chart_id * 17) % 7) - 3)
       ))
FROM seed_plan sp
JOIN players pl ON pl.id <= sp.voters;

DROP TABLE seed_plan;

-- 시드 투표를 반영해 전체 채보 등급을 계산한다.
SELECT recalc_chart_stats(NULL);

SELECT setval('players_id_seq', (SELECT MAX(id) FROM players));
SELECT setval('songs_id_seq',   (SELECT MAX(id) FROM songs));
SELECT setval('charts_id_seq',  (SELECT MAX(id) FROM charts));
