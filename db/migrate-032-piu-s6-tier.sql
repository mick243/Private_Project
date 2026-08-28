-- ============================================================
-- 032 · Pump It Up Single 6레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S6 채보 103개. **투표는 넣지 않습니다** — 요청대로 전부 '미정' 으로 들어갑니다.
-- 018(S2) · 028(S3) · 030(S4) · 031(S5) 과 같은 방식입니다.
--
-- 참고한 서열표의 등급 분포는 아래 주석에 남겨 두었습니다 (배치에는 쓰이지 않음):
--   최상 6 · 상 18 · 중상 21 · 중 25 · 중하 17 · 하 7
--   · 고유(개인차) 3 · 미정 6 = 103곡
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 음차 → 원 표기는 재킷과 수록곡·삭제곡 문서(옛 위키 수록곡 일람 포함)로
-- 맞췄습니다. 103곡 전부 매칭했고 중복은 없습니다. 헷갈리는 짝:
--   · `취낙원무` → `Dizzy Dance, Street Light` (WyvernP). 한글 제목이 원 표기와
--     전혀 달라 PHOENIX 2 신곡 표에서 확인했습니다. 이미 songs 에 있는 곡입니다.
--   · `사월` → `Death Moon` (`사월의 축제` = Festival of Death Moon 과 별개.
--     S5(031) 중상에 그쪽이 이미 있습니다)
--   · `비트 오브 더 워` → `Beat of the War` **원곡**. S4·S5 에 넣은
--     `Beat of the war 2` 와 다른 곡이라 여기서 새로 추가합니다.
--   · `젓가락 변주곡` → `Chopsticks Challenge` (Yahpp). songs 의
--     `Chopstix`(Sonic Dimension)와 **다른 곡**입니다 — 수록곡 문서에 두 곡이
--     따로 있고, 재킷도 "Chopsticks Chall… BPM 128 Composed by YAHPP" 입니다.
--   · `디 갱`·`탑 시티`·`카프리스 오브 오타다`·`마이웨이`·`디그니티`·`컴 투 미`·
--     `치킨 윙`·`파파 곤잘레스`·`사랑가 -2막-` 은 030 이, `디 갱` 은 031 이
--     추가해 둔 행에 붙습니다.
--   · `윈터 - SHORT CUT`·`XX 오프닝 - SHORT CUT`·`스위트로닉 - SHORT CUT` 은
--     019 가 넣은 숏컷 행에 붙였습니다 (표시에 SHORT CUT 이 있는 것만).
--
-- ⚠ **`첫사랑` 은 어느 행에 붙일지 확정하지 못했습니다.** songs 에는
--   `First Love (Spanish ver.)`(BanYa) 와 `First Love (Techno Mix)`(클론) 둘뿐인데
--   재킷은 "FIRST LOVE · Composed by BanYa" 라 BanYa 쪽으로 넣었습니다.
--   옛 위키에는 `첫사랑`(BanYa, "Oh! 로사와 동일") 이 스페인어 버전과 별개 행으로
--   있었으므로, 현행 문서가 둘을 합친 것인지 아닌지는 확인하지 못했습니다.
--   **전부 미정이라 등급 결과에는 영향이 없습니다.**
--
-- ─── ⚠ 새로 넣는 곡 5개 ──────────────────────────────────
-- 103곡 중 5곡이 songs 에 없어서 여기서 추가합니다. 표기·아티스트는 나무위키
-- 문서와 옛 위키 수록곡 일람에서 가져왔고 재킷과 대조했습니다:
--
--   Beat of the War       BanYa              (최초의 본격 변속곡. '2' 와 별개)
--   An Interesting View   BanYa              (서울구경 · 구전가요 리메이크)
--   Close Your Eye        BanYa              (눈을 감아)
--   Chopsticks Challenge  Yahpp              (젓가락 변주곡 · 클래식 리메이크)
--   conflict              Cranky+siromaru    (컨플릭트 · BPM 160)
--
-- 앞 넷은 초기작 삭제곡이라 005 가 뺐던 곡입니다 (028·030·031 과 같은 사례).
-- `conflict` 는 라이선스 만료로 2023-07-04 ~ 2024-05-26 임시 삭제됐다가
-- **PHOENIX Ver 2.00.0 에서 복귀**한 곡으로, 005 주석 한계 3번("부활곡이 잘못
-- 빠집니다")에 정확히 해당합니다. 곡명은 소문자 `conflict` 가 정식 표기입니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 6
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
-- ============================================================

-- ─── 1) songs 에 없는 5곡 추가 ─────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('Beat of the War', 'BanYa'),
  ('An Interesting View', 'BanYa'),
  ('Close Your Eye', 'BanYa'),
  ('Chopsticks Challenge', 'Yahpp'),
  ('conflict', 'Cranky+siromaru')
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) S6 채보 103개 ──────────────────────────────────────
-- 투표를 넣지 않으므로 clear_records / difficulty_votes 도 만들지 않습니다.
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 6
FROM (VALUES
  ('무혼'),                                      -- 최상 · 무혼
  ('Dr. M'),                                   -- 최상 · 닥터 엠
  ('Full Moon'),                               -- 최상 · 풀 문
  ('Sorceress Elise'),                         -- 최상 · 소서리스 엘리제
  ('Beethoven Virus'),                         -- 최상 · 베토벤 바이러스
  ('Another Truth'),                           -- 최상 · 또다른 진심
  ('Beat of the War'),                         -- 상 · 비트 오브 더 워
  ('D Gang'),                                  -- 상 · 디 갱
  ('Top City'),                                -- 상 · 탑 시티
  ('Selfishness'),                             -- 상 · 셀피쉬니스
  ('Moment Day'),                              -- 상 · 모멘트 데이
  ('Unique'),                                  -- 상 · 유니크
  ('Fires of Destiny'),                        -- 상 · 파이어 오브 데스티니
  ('Asterios-ReEntry'),                        -- 상 · 아스테리오스 -리엔트리-
  ('An Interesting View'),                     -- 상 · 서울구경
  ('Hello William'),                           -- 상 · 안녕 윌리엄
  ('Caprice of Otada'),                        -- 상 · 카프리스 오브 오타다
  ('Milky Way Galaxy'),                        -- 상 · 밀키 웨이 갤럭시
  ('Stardream (feat. Romelon)'),               -- 상 · 스타드림 (feat. Romelon)
  ('Keep On!'),                                -- 상 · 킵 온!
  ('Winter 숏컷'),                               -- 상 · 윈터 - SHORT CUT
  ('Smells Like a Chocolate'),                 -- 상 · 스멜스 라이크 어 초콜렛
  ('Like Me'),                                 -- 상 · 라이크 미
  ('Wedding Crashers'),                        -- 상 · 웨딩 크래셔
  ('Hypercube'),                               -- 중상 · 하이퍼큐브
  ('My Way'),                                  -- 중상 · 마이웨이
  ('Banya Hiphop Remix'),                      -- 중상 · 반야 힙합 리믹스
  ('Allegro Piu Mosso'),                       -- 중상 · 알레그로 피유 모쏘
  ('Jonathan''s Dream'),                       -- 중상 · 조나단의 꿈
  ('You again my love'),                       -- 중상 · 유 어게인 마이 러브
  ('Nightmare'),                               -- 중상 · 악몽
  ('Harmagedon'),                              -- 중상 · 아마겟돈
  ('Super Stylin'''),                          -- 중상 · 슈퍼 스타일린
  ('First Love (Spanish ver.)'),               -- 중상 · 첫사랑
  ('District 1'),                              -- 중상 · 디스트릭트 1
  ('Rising Star'),                             -- 중상 · 라이징 스타
  ('Death Moon'),                              -- 중상 · 사월
  ('Pump Me Amadeus'),                         -- 중상 · 펌프 미 아마데우스
  ('V3'),                                      -- 중상 · V3
  ('conflict'),                                -- 중상 · 컨플릭트
  ('Turkey March -Minimal Tunes-'),            -- 중상 · 터키 행진곡 -미니멀 튠즈-
  ('Dignity'),                                 -- 중상 · 디그니티
  ('Violet Perfume'),                          -- 중상 · 바이올렛 퍼퓸
  ('Good Night'),                              -- 중상 · 굿 나이트
  ('Yo! Say!! Fairy!!!'),                      -- 중상 · 요! 세이!! 페어리!!!
  ('Do you know that - old school'),           -- 중 · 두 유 노우 댓-올드 스쿨
  ('Pumping Jumping'),                         -- 중 · 펌핑 점핑
  ('Night Duty'),                              -- 중 · 야근
  ('Set Me Up'),                               -- 중 · 셋 미 업
  ('Witch Doctor'),                            -- 중 · 위치 닥터
  ('Point Break'),                             -- 중 · 포인트 브레이크
  ('Higgledy Piggledy'),                       -- 중 · 히글디 피글디
  ('Papa Gonzales'),                           -- 중 · 파파 곤잘레스
  ('U Got Me Crazy'),                          -- 중 · 유 갓 미 크레이지
  ('Reality'),                                 -- 중 · 리얼리티
  ('Removable Disk0'),                         -- 중 · 리무버블 디스코
  ('U Got Me Rocking'),                        -- 중 · 유 갓 미 락킹
  ('Magical Vacation'),                        -- 중 · 매지컬 베케이션
  ('%X'),                                      -- 중 · 퍼센트 엑스
  ('Twist of Fate (feat. Ruriling)'),          -- 중 · 트위스트 오브 페이트
  ('Transacaglia in G-minor'),                 -- 중 · 트란사칼리아
  ('Fallen Angel'),                            -- 중 · 폴른 엔젤
  ('VANISH'),                                  -- 중 · 배니쉬
  ('아마이 유우와쿠 데인져러스'),                          -- 중 · 아마이 유우와쿠 데인져러스
  ('Hungarian Dance V'),                       -- 중 · 헝가리 무곡 V
  ('Monkey Fingers'),                          -- 중 · 몽키 핑거즈
  ('Soldiers (TANO*C W TEAM RED ANTHEM)'),     -- 중 · 솔저스
  ('Sugar Conspiracy Theory'),                 -- 중 · 설탕음모론
  ('Follow Me'),                               -- 중 · 팔로우 미
  ('Forgotten Vampire'),                       -- 중 · 포가튼 뱀파이어
  ('XX 오프닝 숏컷'),                               -- 중하 · XX 오프닝 - SHORT CUT
  ('Dizzy Dance, Street Light'),               -- 중하 · 취낙원무
  ('Blaze Emotion'),                           -- 중하 · 블레이즈 이모션
  ('Chopsticks Challenge'),                    -- 중하 · 젓가락 변주곡
  ('Come To Me'),                              -- 중하 · 컴 투 미
  ('Butterfly'),                               -- 중하 · 버터플라이
  ('Switronic 숏컷'),                            -- 중하 · 스위트로닉 - SHORT CUT
  ('Dance with me'),                           -- 중하 · 댄스 위드 미
  ('X-Rave'),                                  -- 중하 · 엑스 레이브
  ('Repentance'),                              -- 중하 · 리펜턴스
  ('Poseidon'),                                -- 중하 · 포세이돈
  ('Headless Chicken'),                        -- 중하 · 헤드리스 치킨
  ('Allegro Furioso'),                         -- 중하 · 알레그로 퓨리오소
  ('Chicken Wing'),                            -- 중하 · 치킨 윙
  ('Sudden Romance'),                          -- 중하 · 서든 로맨스 [PIU Edit]
  ('Houseplan'),                               -- 중하 · 하우스플랜
  ('Showdown'),                                -- 중하 · 쇼다운
  ('Betrayer Act.2'),                          -- 하 · 사랑가 -2막-
  ('Pavane'),                                  -- 하 · 파반느
  ('Campanella'),                              -- 하 · 캄파넬라
  ('Cosmical Rhythm'),                         -- 하 · 코스미컬 리듬
  ('Altale'),                                  -- 하 · 알테일
  ('Storm'),                                   -- 하 · 스톰
  ('Lacrimosa'),                               -- 하 · 라크리모사
  ('Dolly Kiss'),                              -- 고유 · 돌리 키스
  ('The Devil'),                               -- 고유 · 마왕
  ('Close Your Eye'),                          -- 고유 · 눈을 감아
  ('Ercitite'),                                -- 미정 · 에르시타이트
  ('Xuxa'),                                    -- 미정 · 슈샤
  ('Will o'' The Wisp'),                       -- 미정 · 윌 오 더 위스프
  ('Witch Doctor #1'),                         -- 미정 · 위치 닥터 #1
  ('BANG BANG'),                               -- 미정 · 뱅 뱅
  ('고민중독 (T.B.H)')                              -- 미정 · 고민중독
) AS p(title)
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 전부 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND c.mode = 'S' AND c.level = 6;
