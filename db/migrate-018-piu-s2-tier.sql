-- ============================================================
-- 018 · Pump It Up Single 2레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S2 채보 29개. **투표는 넣지 않습니다** — 전부 '미정' 으로 들어갑니다.
-- 012(S1) 와 달리 가상 투표를 만들지 않으므로, 실제 플레이어가 투표하는 대로
-- 등급이 처음부터 쌓입니다.
--
-- 투표가 min_votes(3) 미만이면 recalc_chart_stats 가 'undecided' 로 넣습니다.
-- 참고한 서열표의 등급은 아래 주석에 남겨 두었습니다 (배치에는 쓰이지 않음).
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 참고 서열표는 한글 음차(`사라반드`, `유 갓 투 노우`)를, songs 는 005 가 넣은
-- 원 표기(`Sarabande`, `U Got 2 Know`)를 씁니다. 음차를 새로 넣으면 같은 곡이
-- 두 행이 되므로 기존 행에 채보를 붙입니다.
--
-- 헷갈리는 짝은 재킷 이미지로 갈랐습니다:
--   · `위치 닥터 #1` → `Witch Doctor #1` (Yahpp). `Witch Doctor`(BanYa) 아님.
--   · `팬텀`        → `Phantom` (BanYa). `Phantom -Intermezzo-` 아님.
--   · 같은 등급에 `블레이즈 이모션…` 과 `블레이즈 이모션` 이 따로 있는데,
--     앞은 재킷이 'Blaze Emotion -Band Version-' 이라 `Blaze Emotion (Band Version)`,
--     뒤는 'LAZE EMOTION Composed by YAHPP' 라 `Blaze Emotion` 입니다.
--   · `파이널 오디션 3` → DB 의 유일한 3번 항목인
--     `Final Audition 3 U.F (Un.Finished)` (BanYa) 로 봤습니다.
--     `Final Audition`(무印) · `Final Audition 2` · `Ep.2-X` 등과는 별개 행입니다.
--
-- ─── ⚠ 검토가 필요한 부분: 새로 넣는 곡 7개 ───────────────
-- 29곡 중 7곡이 songs 에 없어서 여기서 추가합니다. 620곡 전체를 훑어
-- 대소문자·음차·부제까지 확인했고 근접한 행이 없었습니다.
--
--   Higgledy Piggledy   Banya Production   재킷 'iggledy piggledy bpm 150 Banyapro'
--   Pumping Jumping     Banya Production   재킷 'BPM 116 Banya Production'
--   Blaze Emotion       Yahpp              재킷 'Composed by YAHPP' (밴드 버전과 별개 곡)
--   Pop the track       NULL               재킷에 아티스트가 안 보입니다
--   Idealized Romance   NULL               〃
--   Storm               NULL               〃
--   무혼                 NULL               〃
--
-- **제목·아티스트를 확인할 출처가 저장소 안에 없습니다.** 재킷에서 읽히는 만큼만
-- 넣었고, 안 읽히는 아티스트는 틀린 값을 넣기보다 NULL 로 뒀습니다 — 005 가
-- 밀린 셀을 아티스트로 넣지 않고 비운 것과 같은 판단입니다(005 주석 한계 5번).
-- 정확한 공식 표기는 확인이 필요합니다. 틀리면 이 파일의 title 만 고치면 됩니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 이 파일을 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 2
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
-- ============================================================

-- ─── 1) songs 에 없는 7곡 추가 ─────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('Higgledy Piggledy', 'Banya Production'),
  ('Pumping Jumping',   'Banya Production'),
  ('Blaze Emotion',     'Yahpp'),
  ('Pop the track',     NULL),
  ('Idealized Romance', NULL),
  ('Storm',             NULL),
  ('무혼',               NULL)
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) S2 채보 29개 ───────────────────────────────────────
-- 투표를 넣지 않으므로 clear_records / difficulty_votes 도 만들지 않습니다.
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 2
FROM (VALUES
  -- 원 표기 (songs.title)                  -- 참고 서열표 등급 · 표기
  ('Sarabande'),                            -- 최상 · 사라반드
  ('BANG BANG'),                            -- 상   · 뱅 뱅
  ('Higgledy Piggledy'),                    -- 상   · 히글디 피글디
  ('Pop the track'),                        -- 상   · 팝 더 트랙
  ('Pumping Jumping'),                      -- 중상 · 펌핑 점핑
  ('Blaze Emotion (Band Version)'),         -- 중상 · 블레이즈 이모션 (밴드 버전)
  ('무혼'),                                  -- 중상 · 무혼
  ('U Got 2 Know'),                         -- 중상 · 유 갓 투 노우
  ('Blaze Emotion'),                        -- 중상 · 블레이즈 이모션
  ('Tropicanic'),                           -- 중상 · 트로피카닉
  ('Altale'),                               -- 중상 · 알테일
  ('Tepris'),                               -- 중상 · 테프리스
  ('Witch Doctor #1'),                      -- 중   · 위치 닥터 #1
  ('Set Me Up'),                            -- 중   · 셋 미 업
  ('Arch of Darkness'),                     -- 중   · 아크 오브 다크니스
  ('HTTP'),                                 -- 중   · HTTP
  ('Dance with me'),                        -- 중   · 댄스 위드 미
  ('Final Audition 3 U.F (Un.Finished)'),   -- 중   · 파이널 오디션 3
  ('Idealized Romance'),                    -- 중   · 아이디얼라이즈드 로맨스
  ('Final Audition'),                       -- 중   · 파이널 오디션
  ('Phantom'),                              -- 중   · 팬텀
  ('Life is PIANO'),                        -- 중   · 라이프 이즈 피아노
  ('Storm'),                                -- 중   · 스톰
  ('Will o'' The Wisp'),                    -- 중하 · 윌 오 더 위스프
  ('Timing'),                               -- 중하 · 타이밍
  ('Xtree'),                                -- 중하 · 엑스트리
  ('Full Moon'),                            -- 중하 · 풀 문
  ('고민중독 (T.B.H)'),                       -- 중하 · 고민중독
  ('Obelisque')                             -- 하   · 오벨리스크
) AS p(title)
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 전부 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND c.mode = 'S' AND c.level = 2;
