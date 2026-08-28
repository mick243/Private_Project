-- ============================================================
-- 030 · Pump It Up Single 4레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S4 채보 158개. **투표는 넣지 않습니다** — 요청대로 전부 '미정' 으로 들어갑니다.
-- 018(S2) · 028(S3) 과 같은 방식입니다.
--
-- 참고한 서열표의 등급 분포는 아래 주석에 남겨 두었습니다 (배치에는 쓰이지 않음):
--   최상 8 · 상 27 · 중상 35 · 중 38 · 중하 24 · 하 10 · 최하 1
--   · 고유(개인차) 6 · 미정 9 = 158곡
-- 참고 서열표에는 고유·미정 그룹까지 있지만, 투표를 넣지 않으므로
-- 여기서는 전부 미정이 됩니다.
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 참고 서열표는 한글 음차(`위 윌 밋 어게인`, `우편마차`)를 쓰고 songs 는 원 표기
-- (`We Will Meet Again`, `Csikos Post`)를 쓰므로, 재킷과 수록곡·삭제곡 문서로
-- 음차 → 원 표기를 맞춘 뒤 기존 행에 채보를 붙였습니다. 158곡 전부 매칭했고
-- 중복은 없습니다. 헷갈리는 짝은 재킷으로 갈랐습니다:
--   · `마왕` → `The Devil` (재킷 "THE ..."), `아마겟돈` → `Harmagedon` (재킷 표기)
--   · `추격` → `Etude Op 10-4` (재킷에 "Etude Op 10-4 · Composed by MAX")
--   · `사랑가 -2막-` → `Betrayer Act.2` (020 이 확인한 `사랑가` = `Betrayer` 와
--     같은 시리즈. 옛 위키 수록곡 일람: 사랑가 2막 / Betrayer Act.2 / msgoon)
--   · `... - SHORT CUT` 3곡은 019 가 넣은 숏컷 행(`Wedding Crashers 숏컷` ·
--     `Euphorianic 숏컷` · `I Want U 숏컷`)에 붙였습니다.
--
-- ⚠ **파이널 오디션 계열 두 칸(하 · 고유)은 어느 곡인지 확정하지 못했습니다.**
--   하 칸 재킷은 보라 나비 · Yahpp · BPM 170 — 029 에서 확인했듯 Episode 2-1 과
--   Ep.2-X 의 재킷이 똑같이 이 조합이라 이미지만으로 갈라지지 않습니다.
--   → `Final Audition Episode 2-1` 로 넣었습니다.
--   고유 칸 재킷은 붉은 배경에 흰 사각형 — `Final Audition 3 U.F (Un.Finished)`
--   로 넣었습니다. 두 칸 모두 **전부 미정이므로 등급 결과에는 영향이 없고**,
--   나중에 투표가 쌓일 때만 어느 곡인지 재확인하면 됩니다 (029 전례).
--   러브 이즈 어 데인저 존 두 칸(중상 · 고유)도 같은 이유로 원곡과 pt.2 중
--   어느 쪽이 어느 칸인지는 확정하지 않았습니다 — 두 곡 다 채보가 생깁니다.
--
-- ─── ⚠ 새로 넣는 곡 17개 ─────────────────────────────────
-- 158곡 중 17곡이 songs 에 없어서 여기서 추가합니다. 대부분 삭제곡 문서와
-- 겹친다는 이유로 005 가 뺐던 곡입니다 (005 주석 한계 3번 "부활곡이 잘못
-- 빠집니다" — 028 의 7곡과 같은 사례). 표기·아티스트는 나무위키 삭제곡 문서와
-- 옛 위키 수록곡 일람(enha 미러)에서 가져왔고, 재킷 표기와 대조했습니다.
--
--   DJ Otada             Banya Production   (클래식 리메이크)
--   Caprice of Otada     Banya Production   (재킷 표기. 옛 위키는 'Carprice' 오타)
--   Monkey Fingers 2     Banya Production
--   무혼 2               BanYa              (나무위키 개별 문서 확인)
--   Toccata              Banya Production   (클래식 리메이크)
--   Betrayer Act.2       msgoon             (사랑가 -2막-, 원곡 후반부 편곡)
--   Papa Gonzales        BanYa
--   Oy Oy Oy             BanYa
--   Come To Me           BanYa              (클론 '돌아와' 와 다른 BanYa 원곡)
--   Jump                 BanYa
--   Dignity              크래쉬             (songs 의 'Dignity 풀송' 과 짝)
--   My Way               BanYa
--   Get Your Groove On   BanYa
--   Chicken Wing         BanYa
--   My Dreams            Banya Production
--   Top City             BanYa
--   Cannon X.1           Yahpp              (클래식 리메이크. 'Canon' 아님)
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 4
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
-- ============================================================

-- ─── 1) songs 에 없는 17곡 추가 ────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('DJ Otada', 'Banya Production'),
  ('Caprice of Otada', 'Banya Production'),
  ('Monkey Fingers 2', 'Banya Production'),
  ('무혼 2', 'BanYa'),
  ('Toccata', 'Banya Production'),
  ('Betrayer Act.2', 'msgoon'),
  ('Papa Gonzales', 'BanYa'),
  ('Oy Oy Oy', 'BanYa'),
  ('Come To Me', 'BanYa'),
  ('Jump', 'BanYa'),
  ('Dignity', '크래쉬'),
  ('My Way', 'BanYa'),
  ('Get Your Groove On', 'BanYa'),
  ('Chicken Wing', 'BanYa'),
  ('My Dreams', 'Banya Production'),
  ('Top City', 'BanYa'),
  ('Cannon X.1', 'Yahpp')
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) S4 채보 158개 ──────────────────────────────────────
-- 투표를 넣지 않으므로 clear_records / difficulty_votes 도 만들지 않습니다.
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 4
FROM (VALUES
  ('We Will Meet Again'),                      -- 최상 · 위 윌 밋 어게인
  ('Hello William'),                           -- 최상 · 안녕 윌리엄
  ('DJ Otada'),                                -- 최상 · 디제이 오타다
  ('Utopia'),                                  -- 최상 · 유토피아
  ('Matador'),                                 -- 최상 · 마타도르
  ('Another Truth'),                           -- 최상 · 또다른 진심
  ('Chimera'),                                 -- 최상 · 키메라
  ('Beethoven Virus'),                         -- 최상 · 베토벤 바이러스
  ('Destination'),                             -- 상 · 데스티네이션
  ('Eternal Universe'),                        -- 상 · 이터널 유니버스
  ('Pumping Jumping'),                         -- 상 · 펌핑 점핑
  ('Witch Doctor'),                            -- 상 · 위치 닥터
  ('Lucid (PIU Edit)'),                        -- 상 · 루시드(PIU Edit)
  ('Red Swan'),                                -- 상 · 레드 스완
  ('Accident'),                                -- 상 · 엑시던트
  ('Monkey Fingers 2'),                        -- 상 · 몽키 핑거즈 2
  ('Get Up (And Go)'),                         -- 상 · 겟 업 (앤 고)
  ('D'),                                       -- 상 · 디
  ('Cygnus'),                                  -- 상 · 시그너스
  ('Caprice of Otada'),                        -- 상 · 카프리스 오브 오타다
  ('Blazing'),                                 -- 상 · 블레이징
  ('Reality'),                                 -- 상 · 리얼리티
  ('Avalanche'),                               -- 상 · 아발란치
  ('Take Out'),                                -- 상 · 테이크 아웃
  ('Passacaglia'),                             -- 상 · 파사칼리아
  ('Monkey Fingers'),                          -- 상 · 몽키 핑거즈
  ('Queen Of The Red'),                        -- 상 · 퀸 오브 더 레드
  ('Hardkore of the North'),                   -- 상 · 하드코어 오브 더 노스
  ('천년이 지나서'),                                 -- 상 · 천년이 지나서
  ('Extravaganza'),                            -- 상 · 엑스트라바간자
  ('Etude Op 10-4'),                           -- 상 · 추격
  ('Earendel'),                                -- 상 · 에렌델
  ('Csikos Post'),                             -- 상 · 우편마차
  ('Sorceress Elise'),                         -- 상 · 소서리스 엘리제
  ('SONIC BOOM'),                              -- 상 · 소닉 붐
  ('Tek -Club Copenhagen-'),                   -- 중상 · 테크 -클럽 코펜하겐-
  ('The Apocalypse'),                          -- 중상 · 더 아포칼립스
  ('Ultimate Eyes'),                           -- 중상 · 얼티밋 아이즈
  ('무혼 2'),                                    -- 중상 · 무혼 2
  ('B2'),                                      -- 중상 · B2
  ('Allegro Piu Mosso'),                       -- 중상 · 알레그로 피유 모소
  ('Butterfly'),                               -- 중상 · 버터플라이
  ('Orbit Stabilizer'),                        -- 중상 · 오르비트 스테빌라이저
  ('Toccata'),                                 -- 중상 · 토카타
  ('Start On Red'),                            -- 중상 · 스타트 온 레드
  ('Faster Z'),                                -- 중상 · 패스터 Z
  ('Silhouette Effect'),                       -- 중상 · 실루엣 이펙트
  ('Harmagedon'),                              -- 중상 · 아마겟돈
  ('Break Out'),                               -- 중상 · 브레이크 아웃
  ('Black Dragon'),                            -- 중상 · 블랙 드래곤
  ('God Mode feat. Skizzo'),                   -- 중상 · 갓 모드 feat. Skizzo
  ('Love is a Danger Zone pt.2'),              -- 중상 · 러브 이즈 어 데인저 존 ?
  ('Sudden Romance'),                          -- 중상 · 서든 로맨스 [PIU Edit]
  ('Kasou Shinja'),                            -- 중상 · 가장신자
  ('Sarabande'),                               -- 중상 · 사라반드
  ('PRIME'),                                   -- 중상 · 프라임
  ('Just hold on(To All Fighters)'),           -- 중상 · 저스트 홀드 온
  ('The Devil'),                               -- 중상 · 마왕
  ('CROSS RAY'),                               -- 중상 · 크로스 레이
  ('Full Moon'),                               -- 중상 · 풀 문
  ('Necromancy'),                              -- 중상 · 네크로맨시
  ('Imprinting'),                              -- 중상 · 임프린팅
  ('Tantanmen'),                               -- 중상 · 탄탄멘
  ('Smile Diary'),                             -- 중상 · 스마일 다이어리
  ('YOU AND I'),                               -- 중상 · 유 앤 아이
  ('Winter'),                                  -- 중상 · 윈터
  ('Wedding Crashers'),                        -- 중상 · 웨딩 크래셔
  ('Elise'),                                   -- 중상 · 엘리제
  ('GOODBOUNCE'),                              -- 중상 · 굿바운스
  ('호랑풍류가'),                                   -- 중상 · 호랑풍류가
  ('SUPER☆HARAGURO☆POP'),                      -- 중 · 슈퍼☆하라구로☆팝
  ('FLVSH OUT'),                               -- 중 · 플래시 아웃
  ('Set Me Up'),                               -- 중 · 셋 미 업
  ('Betrayer Act.2'),                          -- 중 · 사랑가 -2막-
  ('HTTP'),                                    -- 중 · HTTP
  ('Clue'),                                    -- 중 · 클루
  ('Papa Gonzales'),                           -- 중 · 파파 곤잘레스
  ('Xenesis'),                                 -- 중 · 제네시스
  ('Campanella'),                              -- 중 · 캄파넬라
  ('Hyperion'),                                -- 중 · 히페리온
  ('Tribe Attacker'),                          -- 중 · 트라이브 어택커
  ('Overblow'),                                -- 중 · 오버블로우
  ('Requiem'),                                 -- 중 · 레퀴엠
  ('Karyawisata'),                             -- 중 · 까랴위사따
  ('Twist of Fate (feat. Ruriling)'),          -- 중 · 트위스트 오브 페이트
  ('Idealized Romance'),                       -- 중 · 아이디얼라이즈드 로맨스
  ('Oy Oy Oy'),                                -- 중 · 오이 오이 오이
  ('Amphitryon'),                              -- 중 · 암피트리온
  ('Chinese Restaurant'),                      -- 중 · 차이니즈 레스토랑
  ('Mitotsudaira'),                            -- 중 · 미토츠다이라
  ('Pop the track'),                           -- 중 · 팝 더 트랙
  ('Hestia'),                                  -- 중 · 헤스티아
  ('Hungarian Dance V'),                       -- 중 · 헝가리 무곡 V
  ('Arcana Force'),                            -- 중 · 아르카나 포스
  ('Tropicanic'),                              -- 중 · 트로피카닉
  ('Tepris'),                                  -- 중 · 테프리스
  ('Gargoyle'),                                -- 중 · 가고일
  ('Nemesis'),                                 -- 중 · 네메시스
  ('Super Capriccio'),                         -- 중 · 슈퍼 카프리시오
  ('일 더하기 일은 귀요미'),                            -- 중 · 일 더하기 일은 귀요미
  ('Till the end of time'),                    -- 중 · 틸 디 엔드 오브 타임
  ('Perpetual'),                               -- 중 · 퍼페츄얼
  ('Violet Perfume'),                          -- 중 · 바이올렛 퍼퓸
  ('Highway Chaser'),                          -- 중 · 하이웨이 체이서
  ('Athena''s Shield'),                        -- 중 · 아테나의 방패
  ('Galaxy Collapse'),                         -- 중 · 갤럭시 컬랩스
  ('wither garden'),                           -- 중 · 위더 가든
  ('Simon Says, EURODANCE!! (feat. Sara☆M)'),  -- 중 · 사이먼 세이즈, 유로댄스!!
  ('Final Audition 2'),                        -- 중하 · 파이널 오디션 2
  ('Come To Me'),                              -- 중하 · 컴 투 미
  ('무혼'),                                      -- 중하 · 무혼
  ('Bullfighter''s Song'),                     -- 중하 · 투우사의 노래
  ('Jump'),                                    -- 중하 · 점프
  ('Rave ''til the Earth''s End'),             -- 중하 · 레이브 언틸 디 어스 엔드
  ('Jonathan''s Dream'),                       -- 중하 · 조나단의 꿈
  ('Dance with me'),                           -- 중하 · 댄스 위드 미
  ('U Got Me Crazy'),                          -- 중하 · 유 갓 미 크레이지
  ('Beat of the war 2'),                       -- 중하 · 비트 오브 더 워 2
  ('Asterios-ReEntry'),                        -- 중하 · 아스테리오스 -리엔트리-
  ('Stardust Overdrive'),                      -- 중하 · 스타더스트 오버드라이브
  ('Elysium'),                                 -- 중하 · 엘리시움
  ('Macaron Day'),                             -- 중하 · 마카롱 데이
  ('Obelisque'),                               -- 중하 · 오벨리스크
  ('Life is PIANO'),                           -- 중하 · 라이프 이즈 피아노
  ('Timing'),                                  -- 중하 · 타이밍
  ('Sugar Plum'),                              -- 중하 · 슈가 플럼
  ('Feel My Happiness'),                       -- 중하 · 필 마이 해피니스
  ('Super Fantasy'),                           -- 중하 · 슈퍼 판타지
  ('Dignity'),                                 -- 중하 · 디그니티
  ('Follow Me'),                               -- 중하 · 팔로우 미
  ('Soldiers (TANO*C W TEAM RED ANTHEM)'),     -- 중하 · 솔저스
  ('I Want U 숏컷'),                             -- 중하 · 아이 원트 유 - SHORT CUT
  ('Wedding Crashers 숏컷'),                     -- 하 · 웨딩 크래셔 - SHORT CUT
  ('My Way'),                                  -- 하 · 마이웨이
  ('Final Audition Episode 2-1'),              -- 하 · 파이널 오디션 에피소드 2-?
  ('Get Your Groove On'),                      -- 하 · 겟 유어 그루브 온
  ('Cleaner'),                                 -- 하 · 클리너
  ('Chicken Wing'),                            -- 하 · 치킨 윙
  ('Cosmical Rhythm'),                         -- 하 · 코스미컬 리듬
  ('Storm'),                                   -- 하 · 스톰
  ('Euphorianic 숏컷'),                          -- 하 · 유포리아닉 - SHORT CUT
  ('Nyan-turne (feat. KuTiNA)'),               -- 하 · 냥-턴 (feat. KuTiNA)
  ('Moonlight'),                               -- 최하 · 월광
  ('My Dreams'),                               -- 고유 · 마이 드림즈
  ('Final Audition 3 U.F (Un.Finished)'),      -- 고유 · 파이널 오디션 3
  ('Love is A Danger Zone'),                   -- 고유 · 러브 이즈 어 데인저 존 ?
  ('Beat the ghost'),                          -- 고유 · 비트 더 고스트
  ('Do you know that - old school'),           -- 고유 · 두 유 노우 댓-올드 스쿨
  ('Top City'),                                -- 고유 · 탑 시티
  ('King''s Tomb'),                            -- 미정 · 왕의 무덤
  ('Unfelicitas'),                             -- 미정 · 불행의 여신
  ('Cannon X.1'),                              -- 미정 · 캐논 X.1
  ('Turkey March -Minimal Tunes-'),            -- 미정 · 터키 행진곡 -미니멀 튠즈-
  ('Ice of Death'),                            -- 미정 · 아이스 오브 데스
  ('Reminiscence'),                            -- 미정 · 레미니센스
  ('BANG BANG'),                               -- 미정 · 뱅 뱅
  ('Punishment Restaurant'),                   -- 미정 · 응징 레스토랑
  ('고민중독 (T.B.H)')                              -- 미정 · 고민중독
) AS p(title)
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 전부 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND c.mode = 'S' AND c.level = 4;
