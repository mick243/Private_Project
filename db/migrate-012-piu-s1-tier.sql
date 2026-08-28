-- ============================================================
-- 012 · Pump It Up Single 1레벨 서열표
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S1 채보 18개와, 그 채보들을 아래 등급에 배치시키는 가상 투표입니다.
--
--   최상  여래아
--   상    사랑가 · 설탕음모론
--   중상  스타드림 · 케이.오.에이 · 키티 캣 · 날아올라
--   중    404 · 미토츠다이라 · 아마이 유우와쿠 · 레이디버그 · 배드 애플!! · 유 어게인 마이 러브
--   중하  빌려온 고양이 · 라라 · 위 갓 투 노우 · 비행기
--   하    유 엔 아이
--
-- ⚠ **등급 배치는 참고한 서열표를 옮긴 것이고, 투표는 가상입니다.**
--   서열표 화면은 등급을 직접 저장하지 않고 difficulty_votes 평균으로 계산하므로
--   (schema-tier.sql recalc_chart_stats), 원하는 등급을 만들려면 그 등급으로
--   계산되는 투표를 넣는 수밖에 없습니다. seed-tier.sql 과 같은 방식입니다.
--   실제 플레이어 투표가 쌓이면 그쪽이 이 값을 덮습니다.
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 참고한 서열표는 한글 음차 표기(`라라`, `위 갓 투 노우`, `404 (뉴 에라)`)를
-- 쓰지만, songs 에는 005 가 넣은 원 표기(`Lala`, `We Got 2 Know`,
-- `404 (New Era)`)로 들어 있습니다. 음차를 새로 넣으면 같은 곡이 두 행이 되므로
-- **기존 행에 채보를 붙입니다**. 아래 VALUES 의 주석이 음차 ↔ 원 표기 대응입니다.
--
-- ─── ⚠ 검토가 필요한 부분: 새로 넣는 곡 3개 ───────────────
-- 18곡 중 3곡이 songs 에 없어서 이 파일에서 추가합니다. 617곡 전체를 훑어
-- 대소문자·음차·부제까지 확인했고 근접한 행이 없었습니다.
--
--   Mitotsudaira                 ETIA.             ← 005 가 누락을 이미 명시한 곡
--                                                    (005 주석 "확인된 누락" 참고)
--   K.O.A : Alice In Wonderworld BanYa Production
--   사랑가                        BanYa
--
-- 앞의 하나는 005 가 스스로 적어 둔 누락이라 메꾸는 것이 맞습니다. 뒤의 둘은
-- **표기를 확인할 출처가 저장소 안에 없습니다.** 041f504 가 시드에 적어 둔 음차
-- (`케이.오.에이 : 엘리스 인 원더월드`, `사랑가`)를 005 의 표기 규칙(원 표기 ·
-- 한글 제목은 한글 그대로)에 맞춰 옮긴 값이고, 아티스트는 songs 에 이미 있는
-- 형태(`BanYa Production`, `BanYa`)를 골랐습니다. 정확한 공식 표기는 확인이
-- 필요합니다 — 틀리면 이 파일의 title 만 고치면 됩니다.
--
-- ─── 등급을 anchor 에서 끌어오는 이유 ────────────────────
-- 투표값을 숫자로 박아 두면 tier_grades.anchor 가 바뀌는 순간 배치가 어긋납니다.
-- 그래서 base 를 `그 등급의 anchor` 로 잡습니다 — 평균이 anchor 와 같으면
-- "가장 가까운 anchor" 는 정의상 그 등급입니다. anchor 를 어떻게 조정해도
-- 이 파일은 따라옵니다.
--
-- 같은 등급 안의 순서는 참고 서열표의 위→아래 순서를 유지하려고 0.01 씩 차등을
-- 둡니다 (화면 정렬이 avg_vote DESC, title ASC 이므로). 가장 큰 차등이 0.05 인데
-- 등급 경계까지 최소 0.125 여유가 있어 배치가 흔들리지 않습니다.
--
-- 투표는 base 를 중심으로 좌우 대칭인 결정론적 지터라 평균이 정확히 base 이고,
-- 표준편차가 작아 수렴도(1 - sd/tier_step)가 임계값을 넉넉히 넘습니다 → '고유'로
-- 빠지지 않습니다. 투표 수도 min_votes 를 넘겨 '미정'을 피합니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보·클리어는 ON CONFLICT DO NOTHING, 투표는 DO UPDATE 로 같은 값에 수렴합니다.
--
-- 되돌리려면: MIGRATION_FILES 에서 이 파일을 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 1
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
--   (투표·클리어는 CASCADE 로 함께 사라집니다.)
-- ============================================================

-- ─── 1) songs 에 없는 3곡 추가 ─────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('Mitotsudaira',                 'ETIA.'),
  ('K.O.A : Alice In Wonderworld', 'BanYa Production'),
  ('사랑가',                        'BanYa')
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) 배치 계획 ──────────────────────────────────────────
-- ord 는 같은 등급 안에서의 순서용 미세 차등(위쪽이 큼). 등급 자체는
-- grade 코드 → tier_grades.anchor 로 결정됩니다.
CREATE TEMP TABLE s1_plan (title TEXT, grade TEXT, ord INTEGER);

INSERT INTO s1_plan (title, grade, ord) VALUES
  -- 원 표기 (songs.title)              등급  순서    -- 참고 서열표 표기
  ('Yeo Rae A',                    'ss', 0),  -- 여래아
  ('사랑가',                        's',  1),  -- 사랑가
  ('Sugar Conspiracy Theory',      's',  0),  -- 설탕음모론
  ('Stardream (feat. Romelon)',    'a',  3),  -- 스타드림 (feat. R…)
  ('K.O.A : Alice In Wonderworld', 'a',  2),  -- 케이.오.에이 : 엘리스 인 원더월드
  ('Kitty Cat',                    'a',  1),  -- 키티 캣
  ('날아올라',                      'a',  0),  -- 날아올라
  ('404 (New Era)',                'b',  5),  -- 404 (뉴 에라)
  ('Mitotsudaira',                 'b',  4),  -- 미토츠다이라
  ('아마이 유우와쿠 데인져러스',      'b',  3),  -- 아마이 유우와쿠 데인저러스
  ('Ladybug',                      'b',  2),  -- 레이디버그
  ('Bad Apple!! feat. nomico',     'b',  1),  -- 배드 애플!! feat. Nomico
  ('You again my love',            'b',  0),  -- 유 어게인 마이 러브
  ('빌려온 고양이 (Do the Dance)',   'c',  3),  -- 빌려온 고양이
  ('Lala',                         'c',  2),  -- 라라
  ('We Got 2 Know',                'c',  1),  -- 위 갓 투 노우
  ('비행기',                        'c',  0),  -- 비행기
  ('YOU AND I',                    'd',  0);  -- 유 엔 아이

-- ─── 3) S1 채보 생성 ───────────────────────────────────────
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 1
FROM s1_plan p
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 4) 채보 → 목표 평균 ───────────────────────────────────
CREATE TEMP TABLE s1_target AS
SELECT c.id                        AS chart_id,
       g.anchor + p.ord * 0.01     AS base
FROM s1_plan p
JOIN songs  s      ON s.machine_id = 1 AND s.title = p.title
JOIN charts c      ON c.song_id = s.id AND c.mode = 'S' AND c.level = 1
JOIN tier_grades g ON g.machine_id = 1 AND g.code = p.grade;

-- ─── 5) 투표자 ─────────────────────────────────────────────
-- 가장 오래된 계정 7명. n 을 같이 들고 다녀서 인원이 7명 미만이어도
-- 지터가 base 를 중심으로 대칭이 유지됩니다.
CREATE TEMP TABLE s1_voter AS
SELECT player_id,
       row_number() OVER (ORDER BY player_id) AS k,
       COUNT(*)     OVER ()                   AS n
FROM (SELECT id AS player_id FROM players ORDER BY id LIMIT 7) t;

-- ─── 6) 클리어 기록 ────────────────────────────────────────
-- 투표의 전제 조건입니다 (difficulty_votes 가 clear_records 를 복합 FK 로 참조).
INSERT INTO clear_records (player_id, chart_id)
SELECT v.player_id, t.chart_id
FROM s1_target t CROSS JOIN s1_voter v
ON CONFLICT DO NOTHING;

-- ─── 7) 투표 ───────────────────────────────────────────────
INSERT INTO difficulty_votes (player_id, chart_id, value)
SELECT v.player_id,
       t.chart_id,
       GREATEST(ts.vote_min,
                LEAST(ts.vote_max,
                      t.base + 0.06 * (v.k - (v.n + 1) / 2.0)))
FROM s1_target t
CROSS JOIN s1_voter v
CROSS JOIN tier_settings ts
WHERE ts.machine_id = 1
ON CONFLICT (player_id, chart_id)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ─── 8) 집계 ───────────────────────────────────────────────
-- 이 파일이 만든 채보만 다시 계산합니다 (NULL 을 넘기면 전체 재계산).
SELECT recalc_chart_stats(chart_id) FROM s1_target;

DROP TABLE s1_voter;
DROP TABLE s1_target;
DROP TABLE s1_plan;
