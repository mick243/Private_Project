-- ============================================================
-- 커뮤니티 시드
--
-- ⚠ 전부 UI 확인용 가상 데이터입니다.
--   - 제보/리뷰/채보 평가 문장은 지어낸 것입니다. 실제 업소 평가가 아닙니다.
--   - 사운드 볼텍스 곡 제목은 실제 수록곡 이름이지만, **모드·레벨·등급 배치는
--     이 파일에서 만든 가상 투표의 결과**입니다. 실제 난이도표가 아닙니다.
--
-- 대기인원 제보는 now() 기준 상대 시각으로 넣습니다. report_settings 의
-- queue_ttl_minutes(기본 4시간)를 넘기면 machine_live 에서 사라지는 게 정상 동작이라,
-- 시드를 넣은 지 오래된 DB 에서는 "지금 대기" 표시가 비어 있는 게 맞습니다.
-- ============================================================

-- ─── 게임별 플레이 모드 ────────────────────────────────────
INSERT INTO machine_modes (machine_id, code, label, sort_order) VALUES
  (1, 'S',   'Single',   1),
  (1, 'D',   'Double',   2),
  (1, 'CO',  'Co-op',    3),
  (3, 'NOV', 'NOVICE',   1),
  (3, 'ADV', 'ADVANCED', 2),
  (3, 'EXH', 'EXHAUST',  3),
  (3, 'MXM', 'MAXIMUM',  4);

-- ─── 두 번째 게임: 사운드 볼텍스 (machines.id 3) ───────────
-- 게임마다 등급 단계 수가 다르다는 걸 확인하기 위해 펌프(7단계)와 다른 5단계로 둡니다.
INSERT INTO tier_settings (machine_id, vote_min, vote_max, tier_step, min_votes, min_convergence)
VALUES (3, -1.25, 1.25, 0.50, 3, 0.20);

INSERT INTO tier_grades (machine_id, code, label, anchor, sort_order) VALUES
  (3, 'ss', '최상',  1.00, 1),
  (3, 's',  '상',    0.50, 2),
  (3, 'a',  '중',    0.00, 3),
  (3, 'b',  '하',   -0.50, 4),
  (3, 'c',  '최하', -1.00, 5);

INSERT INTO songs (machine_id, title, artist) VALUES
  (3, 'FLOWER',                  NULL),
  (3, 'Grievous Lady',           NULL),
  (3, 'XHAOS JUDGE',             NULL),
  (3, 'Bangin'' Burst',          NULL),
  (3, 'HE4VEN ～天国へようこそ～', NULL),
  (3, 'Lachryma《Re:Queen''M》',  NULL),
  (3, 'Xronièr',                 NULL),
  (3, 'Blastix Riotz',           NULL),
  (3, 'ULTiMATE INFLATiON',      NULL),
  (3, 'iLLness LiLin',           NULL),
  (3, 'FIN4LE ～終止線～',        NULL),
  (3, '極彩の花緑青',             NULL),
  (3, 'Verse IV',                NULL),
  (3, 'ちくわパフェだよ☆CKP',     NULL),
  (3, 'ドーナツホール',           NULL);

INSERT INTO charts (song_id, mode, level)
SELECT s.id, p.mode, p.level
FROM (VALUES
  ('Grievous Lady',           'MXM', 18),
  ('XHAOS JUDGE',             'MXM', 18),
  ('Lachryma《Re:Queen''M》',  'MXM', 18),
  ('Xronièr',                 'MXM', 18),
  ('iLLness LiLin',           'MXM', 18),
  ('FIN4LE ～終止線～',        'MXM', 18),
  ('Blastix Riotz',           'MXM', 18),
  ('ULTiMATE INFLATiON',      'MXM', 18),
  ('HE4VEN ～天国へようこそ～', 'MXM', 18),
  ('極彩の花緑青',             'MXM', 18),
  ('FLOWER',                  'EXH', 17),
  ('Bangin'' Burst',          'EXH', 17),
  ('Verse IV',                'EXH', 17),
  ('ちくわパフェだよ☆CKP',     'EXH', 17),
  ('ドーナツホール',           'EXH', 17)
) AS p(title, mode, level)
JOIN songs s ON s.title = p.title AND s.machine_id = 3;

-- 가상 클리어 + 투표 (seed-tier.sql 과 같은 결정론적 지터 방식)
CREATE TEMP TABLE seed_plan_sdvx AS
SELECT c.id AS chart_id, p.base, p.spread, p.voters
FROM (VALUES
  ('Grievous Lady',           'MXM', 18,  0.95::numeric, 0.05::numeric, 9),  -- 최상
  ('XHAOS JUDGE',             'MXM', 18,  0.85,          0.06,          7),
  ('Lachryma《Re:Queen''M》',  'MXM', 18,  0.55,          0.05,          8),  -- 상
  ('Xronièr',                 'MXM', 18,  0.45,          0.06,          6),
  ('iLLness LiLin',           'MXM', 18,  0.10,          0.05,          7),  -- 중
  ('FIN4LE ～終止線～',        'MXM', 18, -0.05,          0.06,          9),
  ('Blastix Riotz',           'MXM', 18, -0.45,          0.05,          6),  -- 하
  ('ULTiMATE INFLATiON',      'MXM', 18, -0.90,          0.06,          5),  -- 최하
  ('HE4VEN ～天国へようこそ～', 'MXM', 18,  0.30,          0.32,          8),  -- 고유(개인차)
  ('極彩の花緑青',             'MXM', 18,  0.60,          0.08,          2),  -- 미정(표본 부족)
  ('FLOWER',                  'EXH', 17, -0.80,          0.05,          6),
  ('Bangin'' Burst',          'EXH', 17,  0.70,          0.06,          7),
  ('Verse IV',                'EXH', 17,  0.05,          0.05,          5),
  ('ちくわパフェだよ☆CKP',     'EXH', 17, -0.30,          0.30,          7),  -- 고유
  ('ドーナツホール',           'EXH', 17, -0.55,          0.06,          4)
) AS p(title, mode, level, base, spread, voters)
JOIN songs  s ON s.title = p.title AND s.machine_id = 3
JOIN charts c ON c.song_id = s.id AND c.mode = p.mode AND c.level = p.level;

INSERT INTO clear_records (player_id, chart_id)
SELECT pl.id, sp.chart_id FROM seed_plan_sdvx sp JOIN players pl ON pl.id <= sp.voters;

INSERT INTO difficulty_votes (player_id, chart_id, value)
SELECT pl.id,
       sp.chart_id,
       GREATEST(-1.25, LEAST(1.25,
         sp.base + sp.spread * (((pl.id * 41 + sp.chart_id * 13) % 7) - 3)
       ))
FROM seed_plan_sdvx sp JOIN players pl ON pl.id <= sp.voters;

DROP TABLE seed_plan_sdvx;

SELECT recalc_chart_stats(NULL);

-- ─── 채보 평가 ─────────────────────────────────────────────
INSERT INTO chart_comments (chart_id, player_id, body, tags, created_at, updated_at)
SELECT c.id,
       p.player_id,
       p.body,
       p.tags,
       now() - make_interval(days => p.days_ago),
       now() - make_interval(days => p.days_ago)
FROM (VALUES
  ('Bee',                        'S',   15, 1,  '후반 폭타 구간에서 체력이 다 빠집니다. 앞을 최대한 아껴야 뒤가 남습니다.', ARRAY['폭타', '체력', '후살'], 3),
  ('Bee',                        'S',   15, 4,  '같은 레벨 중에 제일 어렵다고 느꼈어요. 이 채보 깨고 다른 15는 다 쉬워 보였습니다.', ARRAY['폭타', '불렙'], 12),
  ('Cross Over',                 'S',   15, 2,  '틀기가 익숙하면 중 정도, 아니면 최상급으로 느껴집니다. 개인차가 큰 이유가 여기 있어요.', ARRAY['틀기', '개인차'], 5),
  ('Cross Over',                 'S',   15, 7,  '저는 틀기가 약해서 아직 못 깼습니다. 발 꼬이는 구간이 세 군데 있어요.', ARRAY['틀기', '개인차'], 19),
  ('Monkey Fingers',             'S',   15, 3,  '패턴이 단순해서 15 입문용으로 좋습니다. 물렙 소리 나올 만합니다.', ARRAY['물렙'], 8),
  ('Beethoven Virus',            'S',   15, 5,  '중반 변속만 넘기면 나머지는 평범합니다.', ARRAY['변속'], 14),
  ('Napalm',                     'S',   15, 6,  '초반이 제일 빡세고 뒤로 갈수록 쉬워집니다. 초살형.', ARRAY['초살', '폭타'], 2),
  ('Bee',                        'D',   18, 2,  '싱글보다 더블이 오히려 쉽게 느껴졌습니다. 발 배분만 잡으면 됩니다.', ARRAY['체력'], 21),
  ('Grievous Lady',              'MXM', 18, 1,  '후반 원핸드 구간에서 게이지가 다 녹습니다. 노브도 안 쉬워요.', ARRAY['후살', '체력'], 4),
  ('Grievous Lady',              'MXM', 18, 9,  '18 중에서는 확실히 위쪽. 클리어랑 스코어링 난이도가 둘 다 높습니다.', ARRAY['불렙', '폭타'], 11),
  ('HE4VEN ～天国へようこそ～',    'MXM', 18, 3,  '노브가 강하면 쉽고 약하면 지옥입니다. 그래서 평가가 갈리는 듯.', ARRAY['개인차', '판정'], 6),
  ('HE4VEN ～天国へようこそ～',    'MXM', 18, 10, '저한테는 18 최상급이었어요. 노브 구간 연습이 따로 필요합니다.', ARRAY['개인차'], 16),
  ('ULTiMATE INFLATiON',         'MXM', 18, 4,  '18 입문으로 추천합니다. 패턴이 정직해요.', ARRAY['물렙'], 9),
  ('FLOWER',                     'EXH', 17, 6,  '17 중에서는 쉬운 편. 폭타가 정직하게 나옵니다.', ARRAY['물렙', '폭타'], 13),
  ('ちくわパフェだよ☆CKP',        'EXH', 17, 5,  '기습 구간이 많아서 초견에는 확실히 어렵습니다. 외우면 확 내려갑니다.', ARRAY['기습', '개인차'], 7)
) AS p(title, mode, level, player_id, body, tags, days_ago)
JOIN songs  s ON s.title = p.title
JOIN charts c ON c.song_id = s.id AND c.mode = p.mode AND c.level = p.level;

-- ─── 기종 제보 ─────────────────────────────────────────────
-- (오락실, 기종, 몇호기, 제보자, 종류, 대기인원, 컨디션, 코멘트, 몇 분 전)
--
-- '몇호기' 는 컨디션 제보에만 있습니다. 대기는 기종 단위이고(줄은 게임 앞에 섭니다)
-- 있어요/없어졌어요는 기종 자체에 대한 제보라 기체를 가리키지 않습니다.
-- 번호(cabinet_no)로 쓰고 아래에서 arcade_cabinets.id 로 옮깁니다 — SERIAL 값을
-- 시드에 박아 두면 기체를 하나 끼워 넣는 순간 전부 어긋납니다.
INSERT INTO machine_reports (arcade_id, machine_id, cabinet_id, player_id, kind, wait_count, condition, comment, created_at)
SELECT p.arcade_id, p.machine_id, c.id, p.player_id, p.kind, p.wait_count, p.condition, p.comment,
       now() - make_interval(mins => p.minutes_ago)
FROM (VALUES
  -- 홍대 펀시티 · 펌프 → 최대 6명 (많음)
  (3, 1, NULL, 1,  'queue',     5,    NULL, '주말 저녁이라 줄 섰습니다',                12),
  (3, 1, NULL, 4,  'queue',     6,    NULL, NULL,                                       25),
  (3, 1, NULL, 7,  'queue',     4,    NULL, '한 대는 비어 있어요',                      41),
  -- 홍대 펀시티 · 사볼 → 최대 2명 (여유)
  (3, 3, NULL, 2,  'queue',     1,    NULL, NULL,                                        8),
  (3, 3, NULL, 9,  'queue',     2,    NULL, NULL,                                       33),
  -- 강남 리듬스테이션 · 펌프 → 거의 대기 없음
  (1, 1, NULL, 3,  'queue',     0,    NULL, '지금 바로 가능합니다',                     15),
  (1, 1, NULL, 10, 'queue',     1,    NULL, NULL,                                       47),
  -- 부천 아케이드존 · 펌프 → 최대 9명 (매우 많음)
  (5, 1, NULL, 5,  'queue',     8,    NULL, '펌프 전용관 전부 대기입니다',              20),
  (5, 1, NULL, 8,  'queue',     9,    NULL, NULL,                                       34),
  (5, 1, NULL, 11, 'queue',     7,    NULL, NULL,                                       52),
  -- 신촌 게임파크 · 태고 → 제보 1건
  (2, 5, NULL, 6,  'queue',     2,    NULL, NULL,                                       29),
  -- 컨디션 제보 (분 단위지만 며칠 전 값) — 기체마다 따로 쌓입니다
  --
  -- 강남 펌프 2대: 같은 오락실 같은 게임인데 1호기와 2호기가 갈립니다.
  -- 기종 단위로 평균 내면 "컨디션 3.3" 한 줄이 되어 이 차이가 사라집니다.
  (1, 1, 1,    5,  'condition', NULL, 5,    '1호기는 발판 쌩쌩합니다',               60 * 24 * 1),
  (1, 1, 2,    7,  'condition', NULL, 2,    '2호기 2P 좌측 발판이 자주 빠집니다',    60 * 24 * 1),
  (1, 1, 2,    11, 'condition', NULL, 3,    NULL,                                    60 * 24 * 3),
  -- 홍대 펌프 3대
  (3, 1, 1,    1,  'condition', NULL, 5,    '1호기 발판 전부 정상. 감도 좋습니다',   60 * 24 * 2),
  (3, 1, 2,    6,  'condition', NULL, 5,    NULL,                                    60 * 24 * 5),
  (3, 1, 3,    12, 'condition', NULL, 4,    '3호기만 2P 우측 발판이 살짝 뜹니다',    60 * 24 * 9),
  -- 신촌 DDR 1대
  (2, 6, 1,    3,  'condition', NULL, 2,    '화살표 두 개가 잘 안 먹습니다',         60 * 24 * 3),
  (2, 6, 1,    8,  'condition', NULL, 1,    '거의 못 쓸 상태예요. 수리 필요',        60 * 24 * 6),
  -- 수원 펌프 2대
  (6, 1, 1,    4,  'condition', NULL, 3,    '무난합니다',                            60 * 24 * 4),
  (6, 1, 2,    9,  'condition', NULL, 4,    NULL,                                   60 * 24 * 11),
  -- 강남 사볼 2대 중 1호기
  (1, 3, 1,    2,  'condition', NULL, 4,    '노브 헛돌지 않습니다',                  60 * 24 * 7),
  -- "있어요" 제보 2건이 모여 arcade_machines 에 반영된 케이스 (아래에서 함께 넣습니다)
  (6, 4, NULL, 5,  'presence',  NULL, NULL, '2층에 IIDX 들어왔습니다',              60 * 24 * 8),
  (6, 4, NULL, 10, 'presence',  NULL, NULL, '맞아요, 1대 있습니다',                 60 * 24 * 8),
  -- 임계값(2명) 미달 — 아직 반영되지 않은 제보
  (4, 7, NULL, 7,  'presence',  NULL, NULL, 'maimai 신규 입고된 것 같아요',          60 * 24 * 1),
  -- "없어졌어요" 제보 1건 — 역시 임계값 미달
  (8, 5, NULL, 11, 'absence',   NULL, NULL, '태고 자리에 다른 기계 들어왔습니다',     60 * 12)
) AS p(arcade_id, machine_id, cabinet_no, player_id, kind, wait_count, condition, comment, minutes_ago)
-- LEFT JOIN — cabinet_no 가 NULL 인 대기/기종변동 제보는 붙을 기체가 없습니다.
LEFT JOIN arcade_cabinets c
  ON c.arcade_id  = p.arcade_id
 AND c.machine_id = p.machine_id
 AND c.cabinet_no = p.cabinet_no;

-- presence 제보 2건이 모여 반영된 결과. 실제로는 lib/reports.ts 가
-- 제보를 받을 때 임계값을 확인하고 이 두 INSERT 를 수행합니다.
INSERT INTO arcade_machines (arcade_id, machine_id)
VALUES (6, 4)
ON CONFLICT (arcade_id, machine_id) DO NOTHING;

-- 제보로 들어온 기종이라 대수·컨디션은 아무도 알려주지 않았습니다.
-- 1호기 하나를 컨디션 모름으로 답니다 — 기체가 0대면 화면에서 통째로 사라집니다.
INSERT INTO arcade_cabinets (arcade_id, machine_id, cabinet_no, condition)
VALUES (6, 4, 1, NULL)
ON CONFLICT (arcade_id, machine_id, cabinet_no) DO NOTHING;

-- ─── 오락실 리뷰 ───────────────────────────────────────────
INSERT INTO arcade_reviews (arcade_id, player_id, rating, body, created_at) VALUES
  (1, 1,  5, '리듬게임 관리 상태가 제일 좋습니다. 발판 점검을 자주 하는 것 같아요.',  now() - INTERVAL '4 days'),
  (1, 3,  4, '기체는 좋은데 주말 저녁에는 자리가 없습니다.',                           now() - INTERVAL '11 days'),
  (1, 6,  5, '에어컨이 잘 나와서 오래 있어도 괜찮습니다.',                             now() - INTERVAL '20 days'),
  (2, 2,  3, '24시간이라 새벽에 갈 수 있는 건 좋은데 DDR 컨디션이 아쉽습니다.',        now() - INTERVAL '6 days'),
  (2, 8,  2, '기체 관리가 안 되고 있어요. 화살표 안 먹는 걸 몇 달째 방치 중.',         now() - INTERVAL '13 days'),
  (3, 4,  5, '리듬게임만 보면 여기가 제일 낫습니다. 기종 수가 압도적.',                now() - INTERVAL '2 days'),
  (3, 7,  4, '사람이 많은 건 감수해야 합니다. 대기는 항상 있어요.',                    now() - INTERVAL '9 days'),
  (3, 12, 5, '펌프 3대라 대기가 있어도 회전이 빠릅니다.',                              now() - INTERVAL '17 days'),
  (5, 5,  4, '펌프 전용관이 따로 있어서 소리 간섭이 없습니다.',                        now() - INTERVAL '5 days'),
  (5, 11, 3, '주말에는 대기가 너무 길어요. 평일에 가는 걸 추천합니다.',                now() - INTERVAL '15 days'),
  (7, 9,  4, '서면역에서 가까워서 접근성이 좋습니다.',                                 now() - INTERVAL '8 days'),
  (7, 10, 3, '기종은 다양한데 컨디션은 보통입니다.',                                   now() - INTERVAL '22 days');

SELECT recalc_arcade_rating(NULL);
