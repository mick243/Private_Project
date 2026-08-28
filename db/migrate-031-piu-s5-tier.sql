-- ============================================================
-- 031 · Pump It Up Single 5레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- S5 채보 79개. **투표는 넣지 않습니다** — 요청대로 전부 '미정' 으로 들어갑니다.
-- 018(S2) · 028(S3) · 030(S4) 과 같은 방식입니다.
--
-- 참고한 서열표의 등급 분포는 아래 주석에 남겨 두었습니다 (배치에는 쓰이지 않음):
--   최상 1 · 상 8 · 중상 17 · 중 19 · 중하 19 · 하 8 · 최하 1
--   · 고유(개인차) 3 · 미정 3 = 79곡
--
-- ─── 곡명은 songs 테이블의 표기를 따릅니다 ───────────────
-- 음차 → 원 표기는 재킷과 수록곡·삭제곡 문서(옛 위키 수록곡 일람 포함)로
-- 맞췄습니다. 79곡 전부 매칭했고 중복은 없습니다. 헷갈리는 짝:
--   · `금혼식` → `La Cinquantaine` (재킷 "Cinquantaine · 164 BPM")
--   · `사월의 축제` → `Festival of Death Moon`, `사랑가` → `Betrayer` (020 정리)
--   · `태동` → `Naissance` (옛 위키: 태동(胎動)/Naissance. `태동 2` = Naissance 2
--     와 별개 — 표시가 `태동` 단독이라 원곡에 붙였습니다)
--   · `겟 업` → `Get Up!` (재킷 "GET UP · song by Banya"). S4(030) 상의
--     `겟 업 (앤 고)` = `Get Up (And Go)` 는 이 곡의 리메이크로, 다른 곡입니다.
--   · `엔` → `N` (BanYa. 퍼펙트 컬렉션 출시 전 선공개 5곡 중 하나)
--   · `유포리아닉` · `스위트로닉` · `펌트리스 8비트 …` 는 표시에 SHORT CUT 이
--     없으므로 019 숏컷 행이 아니라 정식곡 행에 붙였습니다.
--
-- ⚠ **중상의 파이널 오디션 에피소드 칸은 어느 곡인지 확정하지 못했습니다.**
--   재킷이 Yahpp · BPM 170 — 029 에서 확인했듯 Episode 2-1 과 Ep.2-X 가 같은
--   조합이라 이미지만으로 갈라지지 않습니다. `Final Audition Episode 2-1` 로
--   넣었습니다 (030 하 칸과 같은 선택). **전부 미정이므로 등급 결과에는 영향이
--   없고**, 투표가 쌓일 때 재확인하면 됩니다 (029 전례).
--
-- ─── ⚠ 새로 넣는 곡 8개 (전부 BanYa) ─────────────────────
-- 79곡 중 8곡이 songs 에 없어서 여기서 추가합니다. 초기작(퍼펙트 컬렉션 이전)
-- 삭제곡이라 005 가 뺐던 곡들입니다 (028의 7곡 · 030의 17곡과 같은 사례).
-- 표기·아티스트는 옛 위키 수록곡 일람에서 가져왔고 재킷과 대조했습니다:
--
--   Pumping Up         (히든곡 '태동' 출현 조건 대상곡)
--   With My Lover      (님과 함께 — 트로트 리메이크. 020 전례대로 영문명 표기)
--   Free Style
--   Pump Jump          (Pumping Jumping 의 원곡)
--   Mission Possible
--   D Gang
--   Get Up!            (Get Up (And Go) 의 원곡)
--   N                  (선공개 5곡 중 하나)
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE mode = 'S' AND level = 5
--     AND song_id IN (SELECT id FROM songs WHERE machine_id = 1);
-- ============================================================

-- ─── 1) songs 에 없는 8곡 추가 ─────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, 'BanYa'
FROM (VALUES
  ('Pumping Up'),
  ('With My Lover'),
  ('Free Style'),
  ('Pump Jump'),
  ('Mission Possible'),
  ('D Gang'),
  ('Get Up!'),
  ('N')
) AS v(title)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 2) S5 채보 79개 ───────────────────────────────────────
-- 투표를 넣지 않으므로 clear_records / difficulty_votes 도 만들지 않습니다.
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 5
FROM (VALUES
  ('Mr.Larpus'),                               -- 최상 · 미스터 라푸스
  ('Hi-Bi'),                                   -- 상 · 하이 바이
  ('Star Command'),                            -- 상 · 스타 커맨드
  ('Pumping Up'),                              -- 상 · 펌핑업
  ('HUSH'),                                    -- 상 · 허쉬
  ('Kitty Cat'),                               -- 상 · 키티 캣
  ('Baroque Virus'),                           -- 상 · 바로크 바이러스
  ('Ladybug'),                                 -- 상 · 레이디버그
  ('Rolling Christmas'),                       -- 상 · 롤링 크리스마스
  ('Festival of Death Moon'),                  -- 중상 · 사월의 축제
  ('Final Audition Episode 2-1'),              -- 중상 · 파이널 오디션 에피소드 2-?
  ('Native'),                                  -- 중상 · 네이티브
  ('J-Bong'),                                  -- 중상 · 제이 봉
  ('We Got 2 Know'),                           -- 중상 · 위 갓 투 노우
  ('Final Audition 3 U.F (Un.Finished)'),      -- 중상 · 파이널 오디션 3
  ('Hyacinth'),                                -- 중상 · 히아신스
  ('Bullfighter''s Song'),                     -- 중상 · 투우사의 노래
  ('Scorpion King'),                           -- 중상 · 스콜피온 킹
  ('Pumptris 8Bit ver.'),                      -- 중상 · 펌트리스 8비트 ver.
  ('Monolith'),                                -- 중상 · 모노리스
  ('Tribe Attacker'),                          -- 중상 · 트라이브 어택커
  ('Slam'),                                    -- 중상 · 슬램
  ('La Cinquantaine'),                         -- 중상 · 금혼식
  ('Allegro Con Fuoco'),                       -- 중상 · 알레그로 콘 뿌오코
  ('조깅'),                                      -- 중상 · 조깅
  ('Chase Me'),                                -- 중상 · 체이스 미
  ('Sweet Wonderland'),                        -- 중 · 스위트 원더랜드
  ('Binary Star'),                             -- 중 · 바이너리 스타
  ('N'),                                       -- 중 · 엔
  ('D Gang'),                                  -- 중 · 디 갱
  ('Tek -Club Copenhagen-'),                   -- 중 · 테크 -클럽 코펜하겐-
  ('Pump Jump'),                               -- 중 · 펌프 점프
  ('Beat of the war 2'),                       -- 중 · 비트 오브 더 워 2
  ('Visual Dream 2 (In Fiction)'),             -- 중 · 비주얼 드림 2 (인 픽션)
  ('Lala'),                                    -- 중 · 라라
  ('K.O.A : Alice In Wonderworld'),            -- 중 · 케이.오.에이 : 엘리스 인 원더월드
  ('Log-in'),                                  -- 중 · 로그인
  ('Hey U'),                                   -- 중 · 헤이 유
  ('Betrayer'),                                -- 중 · 사랑가
  ('Kill Them!'),                              -- 중 · 킬 뎀!
  ('All I Want For X-mas'),                    -- 중 · 올 아이 원트 포 크리스마스
  ('Get Up!'),                                 -- 중 · 겟 업
  ('REDLINE'),                                 -- 중 · 레드라인
  ('Adrenaline Blaster'),                      -- 중 · 아드레날린 블래스터
  ('날아올라'),                                    -- 중 · 날아올라
  ('ALiVE'),                                   -- 중하 · 얼라이브
  ('Arch of Darkness'),                        -- 중하 · 아크 오브 다크니스
  ('Mission Possible'),                        -- 중하 · 미션 파서블
  ('Ugly Dee'),                                -- 중하 · 미운 오리새끼
  ('Anguished Unmaking'),                      -- 중하 · 앵귀시드 언메이킹
  ('Overblow2'),                               -- 중하 · 오버블로우2
  ('The People Didn''t Know'),                 -- 중하 · 사람들은 몰랐다네
  ('Move That Body!'),                         -- 중하 · 무브 댓 바디!
  ('Yeo Rae A'),                               -- 중하 · 여래아
  ('The End of the World ft. Skizzo'),         -- 중하 · 디 엔드 오브 더 월드
  ('HELIX'),                                   -- 중하 · 헬릭스
  ('Last Rebirth'),                            -- 중하 · 라스트 리버스
  ('Christmas Memories'),                      -- 중하 · 크리스마스의 기억
  ('POP SEQUENCE'),                            -- 중하 · 팝 시퀀스
  ('Yoropiku Pikuyoro!'),                      -- 중하 · 요로피쿠 피쿠요로!
  ('Nostalgia'),                               -- 중하 · 노스텔지어
  ('Brain Power'),                             -- 중하 · 브레인 파워
  ('Bluish Rose'),                             -- 중하 · 블루이쉬 로즈
  ('Bad Apple!! feat. nomico'),                -- 중하 · 배드 애플!! feat. nomico
  ('With My Lover'),                           -- 하 · 님과 함께
  ('X-Tream'),                                 -- 하 · 엑스트림
  ('Free Style'),                              -- 하 · 프리 스타일
  ('Naissance'),                               -- 하 · 태동
  ('The Reverie'),                             -- 하 · 더 레버리
  ('Up & Up'),                                 -- 하 · 업 앤 업
  ('Switronic'),                               -- 하 · 스위트로닉
  ('비행기'),                                     -- 하 · 비행기
  ('Euphorianic'),                             -- 최하 · 유포리아닉
  ('Meteorize'),                               -- 고유 · 메테오라이즈
  ('Mad5cience'),                              -- 고유 · 매드 사이언스
  ('Gun Rock'),                                -- 고유 · 건 락
  ('Demon of Laplace'),                        -- 미정 · 데몬 오브 라플라스
  ('빌려온 고양이 (Do the Dance)'),                  -- 미정 · 빌려온 고양이
  ('404 (New Era)')                            -- 미정 · 404 (뉴 에라)
) AS p(title)
JOIN songs s ON s.machine_id = 1 AND s.title = p.title
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 전부 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND c.mode = 'S' AND c.level = 5;
