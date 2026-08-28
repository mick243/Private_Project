-- ============================================================
-- 028 · Pump It Up Single 3레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S3 채보 94개. **투표는 넣지 않습니다** — 요청대로 전부 '미정' 으로 들어갑니다.
-- 018(S2) 과 같은 방식입니다.
--
-- 참고한 서열표의 등급 분포는 아래 주석에 남겨 두었습니다 (배치에는 쓰이지 않음):
--   최상 2 · 상 13 · 중상 21 · 중 23 · 중하 23 · 하 9 · 최하 3 = 94곡
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 참고 서열표는 한글 음차(`여래아`, `엑스 레이브`)를 쓰고 songs 는 원 표기
-- (`Yeo Rae A`, `X-Rave`)를 쓰므로, 나무위키 수록곡 문서의 '영문명' 컬럼으로
-- 음차 → 원 표기를 맞춘 뒤 기존 행에 채보를 붙였습니다. 94곡 전부 매칭했고
-- 중복은 없습니다.
--
-- 헷갈리는 짝은 재킷과 문서로 갈랐습니다:
--   · `펌트리스 8비트 ...` → `Pumptris 8Bit ver.` (숏 컷이 아닌 정식곡).
--     수록곡 문서 비고: "NX2 당시 미션 전용, NXA에서 정식곡으로 승격.
--     피에스타에서 숏 컷 추가" — 019 가 넣은 `펌트리스 8비트 ver. 숏컷` 과 별개입니다.
--   · `펌트리스 꽈뜨로` → `Pumptris Quattro` (위와 다른 곡)
--   · `XX 오프닝 - SHORT CUT` · `스위트로닉 - SHORT CUT` 은 019 가 넣은
--     숏 컷 행(`XX 오프닝 숏컷` · `Switronic 숏컷`)에 붙였습니다.
--
-- ⚠ **파이널 오디션 에피소드 2-1 / 2-2 는 어느 쪽이 어느 등급인지 확정하지
--   못했습니다.** 서열표에 파이널 오디션 에피소드가 상·중하 두 칸에 있는데,
--   두 재킷 모두 Yahpp · BPM 170 이라 이미지만으로 갈라지지 않습니다.
--   다만 **모든 곡을 '미정' 으로 넣으므로 등급이 결과에 영향을 주지 않습니다** —
--   두 곡 다 S3 채보가 생기는 것은 동일합니다. 나중에 투표가 쌓일 때만
--   어느 쪽이 어느 곡인지 확인하면 됩니다.
--
-- ─── ⚠ 새로 넣는 곡 7개 ──────────────────────────────────
-- 94곡 중 7곡이 songs 에 없어서 여기서 추가합니다. 표기는 전부 나무위키
-- 수록곡 문서의 '영문명' 컬럼 또는 표의 곡명에서 그대로 가져왔습니다.
--
--   All I Want For X-mas   NULL               (아티스트 칸이 비어 있음)
--   Guitar Man             Banya Production   (리믹스 문서 본문 표기)
--   Pumptris Quattro       Yahpp
--   Pumptris 8Bit ver.     Yahpp
--   Night Duty             V.A.
--   Up & Up                Skizzo
--   Nightmare              NULL               (아티스트 칸이 비어 있음)
--
-- 이 중 All I Want For X-mas · Guitar Man · Night Duty · Nightmare 는 005/019 가
-- 삭제곡 문서와 겹친다는 이유로 뺐던 곡입니다. 그런데 참고한 서열표는 **현재
-- 플레이 가능한 S3 채보**를 보여주므로 실제로는 살아 있는 곡입니다 —
-- 005 주석 한계 3번("부활곡이 잘못 빠집니다")이 실제로 드러난 사례입니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 3
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
-- ============================================================

-- ─── 1) songs 에 없는 7곡 추가 ─────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('All I Want For X-mas', NULL),
  ('Guitar Man', 'Banya Production'),
  ('Pumptris Quattro', 'Yahpp'),
  ('Pumptris 8Bit ver.', 'Yahpp'),
  ('Night Duty', 'V.A.'),
  ('Up & Up', 'Skizzo'),
  ('Nightmare', NULL)
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) S3 채보 94개 ───────────────────────────────────────
-- 투표를 넣지 않으므로 clear_records / difficulty_votes 도 만들지 않습니다.
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 3
FROM (VALUES
  ('Yeo Rae A'),                               -- 최상 · 여래아
  ('Rolling Christmas'),                       -- 최상 · 롤링 크리스마스
  ('Blaze Emotion'),                           -- 상 · 블레이즈 이모션
  ('Star Command'),                            -- 상 · 스타 커맨드
  ('Final Audition Episode 2-1'),              -- 상 · 파이널 오디션 에피소드 2-?
  ('K.O.A : Alice In Wonderworld'),            -- 상 · 케이.오.에이 : 엘리스 인 원더월드
  ('Meteorize'),                               -- 상 · 메테오라이즈
  ('All I Want For X-mas'),                    -- 상 · 올 아이 원트 포 크리스마스
  ('Selfishness'),                             -- 상 · 셀피쉬니스
  ('X-Rave'),                                  -- 상 · 엑스 레이브
  ('Xuxa'),                                    -- 상 · 슈샤
  ('Dr. M'),                                   -- 상 · 닥터 엠
  ('Sugar Conspiracy Theory'),                 -- 상 · 설탕음모론
  ('Canon-D'),                                 -- 상 · 캐논 디
  ('Yo! Say!! Fairy!!!'),                      -- 상 · 요! 세이!! 페어리!!!
  ('Pull Me Up (Feat. Monya)'),                -- 중상 · 풀 미 업 (Feat. Monya)
  ('Sweet Wonderland'),                        -- 중상 · 스위트 원더랜드
  ('What Happened'),                           -- 중상 · 왓 해픈드
  ('Guitar Man'),                              -- 중상 · 기타 맨
  ('2006. Love Song'),                         -- 중상 · 사랑가 2006
  ('HUSH'),                                    -- 중상 · 허쉬
  ('The People Didn''t Know'),                 -- 중상 · 사람들은 몰랐다네
  ('Removable Disk0'),                         -- 중상 · 리무버블 디스코
  ('U Got Me Rocking'),                        -- 중상 · 유 갓 미 락킹
  ('Move That Body!'),                         -- 중상 · 무브 댓 바디!
  ('Kitty Cat'),                               -- 중상 · 키티 캣
  ('Pumptris Quattro'),                        -- 중상 · 펌트리스 꽈뜨로
  ('Till the end of time'),                    -- 중상 · 틸 디 엔드 오브 타임
  ('Pump Me Amadeus'),                         -- 중상 · 펌프 미 아마데우스
  ('Houseplan'),                               -- 중상 · 하우스플랜
  ('Yoropiku Pikuyoro!'),                      -- 중상 · 요로피쿠 피쿠요로!
  ('날아올라'),                                    -- 중상 · 날아올라
  ('Turkey March'),                            -- 중상 · 터키 행진곡
  ('Good Night'),                              -- 중상 · 굿 나이트
  ('Chase Me'),                                -- 중상 · 체이스 미
  ('404 (New Era)'),                           -- 중상 · 404 (뉴 에라)
  ('Ercitite'),                                -- 중 · 에르시타이트
  ('Emperor'),                                 -- 중 · 엠페러
  ('Festival of Death Moon'),                  -- 중 · 사월의 축제
  ('Night Duty'),                              -- 중 · 야근
  ('Beat of the war 2'),                       -- 중 · 비트 오브 더 워
  ('Native'),                                  -- 중 · 네이티브
  ('Hey U'),                                   -- 중 · 헤이 유
  ('The End of the World ft. Skizzo'),         -- 중 · 디 엔드 오브 더 월드
  ('You again my love'),                       -- 중 · 유 어게인 마이 러브
  ('Lala'),                                    -- 중 · 라라
  ('Monolith'),                                -- 중 · 모노리스
  ('Ladybug'),                                 -- 중 · 레이디버그
  ('I Want U'),                                -- 중 · 아이 원트 유
  ('Transacaglia in G-minor'),                 -- 중 · 트란사칼리아
  ('Adrenaline Blaster'),                      -- 중 · 아드레날린 블래스터
  ('Forgotten Vampire'),                       -- 중 · 포가튼 뱀파이어
  ('Stardream (feat. Romelon)'),               -- 중 · 스타드림 (feat. Romelon)
  ('아마이 유우와쿠 데인져러스'),                          -- 중 · 아마이 유우와쿠 데인져러스
  ('Slapstick Parfait'),                       -- 중 · 슬랩스틱 파르페
  ('Latino Virus'),                            -- 중 · 라티노 바이러스
  ('Smells Like a Chocolate'),                 -- 중 · 스멜스 라이크 어 초콜렛
  ('Brain Power'),                             -- 중 · 브레인 파워
  ('Bluish Rose'),                             -- 중 · 블루이쉬 로즈
  ('빌려온 고양이 (Do the Dance)'),                  -- 중하 · 빌려온 고양이
  ('EMOMOMO'),                                 -- 중하 · 에모모모
  ('Anguished Unmaking'),                      -- 중하 · 앵귀시드 언메이킹
  ('J-Bong'),                                  -- 중하 · 제이 봉
  ('Final Audition Episode 2-2'),              -- 중하 · 파이널 오디션 에피소드 2-X
  ('Pavane'),                                  -- 중하 · 파반느
  ('Pumptris 8Bit ver.'),                      -- 중하 · 펌트리스 8비트 ver.
  ('Scorpion King'),                           -- 중하 · 스콜피온 킹
  ('Up & Up'),                                 -- 중하 · 업 앤 업
  ('Nightmare'),                               -- 중하 · 악몽
  ('Moment Day'),                              -- 중하 · 모멘트 데이
  ('Poseidon'),                                -- 중하 · 포세이돈
  ('%X'),                                      -- 중하 · 퍼센트 엑스
  ('Travel to Future'),                        -- 중하 · 트래블 투 퓨처
  ('Death Moon'),                              -- 중하 · 사월
  ('Vook'),                                    -- 중하 · 부크
  ('Cross Time'),                              -- 중하 · 크로스 타임
  ('Ugly Dee'),                                -- 중하 · 미운 오리새끼
  ('Christmas Memories'),                      -- 중하 · 크리스마스의 기억
  ('Switronic'),                               -- 중하 · 스위트로닉
  ('XX 오프닝 숏컷'),                               -- 중하 · XX 오프닝 - SHORT CUT
  ('Switronic 숏컷'),                            -- 중하 · 스위트로닉 - SHORT CUT
  ('Nostalgia'),                               -- 중하 · 노스텔지어
  ('Point Break'),                             -- 하 · 포인트 브레이크
  ('Phantom -Intermezzo-'),                    -- 하 · 팬텀 -인터메조-
  ('The Reverie'),                             -- 하 · 더 레버리
  ('Unique'),                                  -- 하 · 유니크
  ('Last Rebirth'),                            -- 하 · 라스트 리버스
  ('조깅'),                                      -- 하 · 조깅
  ('Lacrimosa'),                               -- 하 · 라크리모사
  ('Bad Apple!! feat. nomico'),                -- 하 · 배드 애플!! feat. nomico
  ('Euphorianic'),                             -- 하 · 유포리아닉
  ('Mr.Larpus'),                               -- 최하 · 미스터 라푸스
  ('Cycling!'),                                -- 최하 · 싸이클링!
  ('비행기')                                     -- 최하 · 비행기
) AS p(title)
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 전부 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND c.mode = 'S' AND c.level = 3;
