-- ============================================================
-- 019 · 리믹스 + 숏 컷 · 풀 송 수록곡 추가 (삭제곡 제외, 부활곡 유지)
--
-- ─── 출처 ───────────────────────────────────────────────
-- 나무위키 (CC BY-NC-SA 2.0 KR) · robots.txt 가 허용하는 /w/ 문서만 읽었습니다.
--   · 펌프 잇 업/리믹스 수록 목록
--   · 펌프 잇 업/숏컷·풀 송
--   · 펌프 잇 업/삭제곡          (제외 목록)
--   · 펌프 잇 업/수록곡          (한글 음차 → 원 표기 사전으로만 사용)
--
-- ─── 만든 방식 ──────────────────────────────────────────
--   (리믹스 ∪ 숏컷 ∪ 풀송) - (삭제곡 - 비고에 '부활' 이 적힌 곡)
--
--   리믹스        17곡 → 삭제곡 1곡(Super Mackerel/슈퍼 고등어) 제외 →  16곡
--   숏컷·풀송    183항목 → 삭제곡 70항목 제외 → 113항목 (숏컷 65 · 풀송 48)
--   합계                                                              129곡
--
--   '부활' 로 살아남은 곡: 디그니티(Dignity) · Fly — 둘 다 삭제곡 문서에 있지만
--   비고가 '부활' 이라 요청대로 제외하지 않았습니다.
--
-- ─── 숏 컷 / 풀 송은 곡명에 접미사를 붙입니다 ────────────
-- `Sarabande 숏컷`, `Dignity 풀송` 처럼 원곡과 **다른 행**으로 넣습니다.
-- 숏 컷과 풀 송은 원곡과 다른 버전이고, 접미사가 없으면 이미 카탈로그에 있는
-- 원곡(`Sarabande`, `Dignity`)과 같은 행이 되어 버립니다.
-- 같은 곡이 숏 컷과 풀 송 양쪽에 있으면 두 행이 다 생깁니다
-- (예: `Pop The Track 숏컷` · `Pop The Track 풀송`).
--
-- ─── 곡명은 원 표기로 맞췄습니다 ─────────────────────────
-- 숏컷·풀 송 문서는 `사라반드` · `니알라토텝` 처럼 한글 음차로 적혀 있는데,
-- songs 는 005 이후 원 표기(`Sarabande` · `Nyarlathotep`)를 씁니다. 음차를 그대로
-- 넣으면 카탈로그 안에서 같은 곡이 두 가지 표기로 흩어집니다. 그래서
--   1) 수록곡 문서의 '영문명' 컬럼으로 음차 → 원 표기 사전(484개)을 만들고
--   2) 사전에 없는 곡은 후보를 세워 **songs 에 실제로 있을 때만** 채택했습니다.
-- 이렇게 43항목을 원 표기로 바꿨습니다.
--
-- ⚠ **원 표기를 확정하지 못한 항목은 음차 그대로 들어갑니다.** 주로 오프닝
--   테마(`NX 오프닝` 등)와 PHOENIX 이후 K-POP 곡입니다. 나중에 원 표기가
--   확인되면 그 행의 title 만 고치면 됩니다.
--
-- ─── ⚠ 사랑가 행 삭제 ────────────────────────────────────
-- migrate-012 가 넣은 `사랑가` 는 오독이었습니다. 수록곡 문서 영문명 컬럼 기준
-- `사랑가` 의 원 표기는 **`Betrayer`** 이고, 그 행은 songs 에 이미 있었습니다.
-- 즉 012 는 같은 곡을 음차로 한 번 더 넣은 것입니다. 요청대로 이 행을 지웁니다.
--
-- ⚠ 이 행에 붙은 S1 채보가 CASCADE 로 함께 사라져 **S1 서열표가 18곡 → 17곡**이
--   됩니다. 참고한 서열표 이미지와 한 곡 어긋나게 됩니다. 원곡 자리를 지키려면
--   지우는 대신 그 채보를 `Betrayer` 행으로 옮겨야 합니다.
--
-- (같은 성격의 `무혼`(→`Solitary`, migrate-018)은 요청대로 그대로 둡니다.)
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- INSERT 는 ON CONFLICT DO NOTHING, DELETE 는 지울 것이 없으면 0행입니다.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM songs WHERE machine_id = 1
--     AND (title LIKE '% 숏컷' OR title LIKE '% 풀송');
--   (리믹스 16곡과 지워진 `사랑가` 는 되돌아오지 않습니다.)
-- ============================================================

-- ─── 1) migrate-012 의 오독 행 제거 ────────────────────────
DELETE FROM songs WHERE machine_id = 1 AND title = '사랑가';

-- ─── 2) 리믹스 + 숏컷 + 풀송 ───────────────────────────────
INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, v.artist
FROM (VALUES
  ('Beethoven Influenza', '반야 & 와락'),
  ('Avalanquiem', '맥스 & 맴매'),
  ('PARADOXX', '슬램 & 나토'),
  ('Vulcan Remix', '맴매'),
  ('Shub Sothoth', '나토 & EXC'),
  ('Leather', '도인'),
  ('Desaparecer', '맥스 & 애플소다'),
  ('Meteo5cience (GADGET mix)', 'Paul Bazooka'),
  ('Prime Time', 'Cashew'),
  ('Fire Noodle Challenge', 'Memme'),
  ('ERRORCODE: 0', 'Doin && SUNNY'),
  ('Brown Sky', 'Doin'),
  ('DISTRICT V', 'Zekk vs 맥스'),
  ('BIG to the BANG', '빅뱅 & 맥스'),
  ('Infinity RMX', 'Synthwulf & 맥스'),
  ('What are you Doin?', '도인 & 맥스'),
  ('Final Audition 2 숏컷', 'BanYa'),
  ('Final Audition 3 숏컷', 'BanYa'),
  ('Love is A Danger Zone 숏컷', 'BanYa'),
  ('Love is a Danger Zone pt.2 숏컷', 'BanYa'),
  ('Extravaganza 숏컷', 'BanYa'),
  ('Winter 숏컷', 'BanYa'),
  ('Solitary 2 숏컷', 'BanYa'),
  ('Moonlight 숏컷', 'BanYa'),
  ('Witch Doctor 숏컷', 'BanYa'),
  ('Exceed 2 Opening 숏컷', 'BanYa'),
  ('Final Audition Ep.2-X 숏컷', '이 얍'),
  ('NX 오프닝 숏컷', '이 얍'),
  ('Bemera 숏컷', '이 얍'),
  ('펌트리스 8비트 ver. 숏컷', '이 얍'),
  ('K.O.A : Alice In Wonderworld 숏컷', '반야 프로덕션'),
  ('Destination 숏컷', 'SHK'),
  ('Procedimientos Para Llegar A Un Comun Acuerdo(잘 가 내 사랑) 숏컷', 'PXNDX(판다)'),
  ('Trotpris 숏컷', 'Doin'),
  ('Cleaner 숏컷', 'Doin'),
  ('Take Out 숏컷', 'SHK'),
  ('Overblow 숏컷', '맥스'),
  ('X-Rave 숏컷', 'DM Ashura'),
  ('Bullfighter''s Song 숏컷', '반야 프로덕션'),
  ('Beat the ghost 숏컷', '반야 프로덕션'),
  ('Dance On Fire: Retribution 숏컷', 'Magic Hammer'),
  ('Incubator 숏컷', '/DJS'),
  ('Kill Them! 숏컷', 'Archefluxx & Kesean Beat'),
  ('What Happened 숏컷', 'Throwdown'),
  ('Pop The Track 숏컷', 'J-Mi & Midi-D ft. Hanna Stockzell'),
  ('Passacaglia 숏컷', 'Synthwulf'),
  ('Ignis Fatuus (DM Ashura Mix) 숏컷', 'DM Ashura'),
  ('FFF 숏컷', '도인'),
  ('Unique 숏컷', 'SHK'),
  ('U Got Me Rocking 숏컷', '맥스'),
  ('Super Fantasy 숏컷', 'SHK'),
  ('Yog-Sothoth 숏컷', 'nato'),
  ('Silhouette Effect 숏컷', 'nato'),
  ('Rock the House 숏컷', 'Matduke'),
  ('Selfishness 숏컷', 'S.I.D-Sound'),
  ('Move That Body! 숏컷', 'DM Ashura feat. Skizzo & Hanna'),
  ('PRIME Opening 숏컷', '맥스'),
  ('Stardust Overdrive 숏컷', 'typeMARS'),
  ('Sarabande 숏컷', '맥스'),
  ('Death Moon 숏컷', 'SHK'),
  ('PRIME 2 Opening 숏컷', '맥스'),
  ('Shub Niggurath 숏컷', 'nato'),
  ('Hyperion 숏컷', '엠투유'),
  ('Kasou Shinja 숏컷', '맥스'),
  ('Nyarlathotep 숏컷', '나토'),
  ('Wedding Crashers 숏컷', 'SHK'),
  ('XX 오프닝 숏컷', '맥스'),
  ('Poseidon 숏컷', '큐리'),
  ('Switronic 숏컷', 'SHK'),
  ('I Want U 숏컷', '맥스'),
  ('패러독스 숏컷', '슬램 & 나토'),
  ('Euphorianic 숏컷', 'SHK'),
  ('Jupin 숏컷', 'Sobrem'),
  ('PHOENIX 오프닝 숏컷', '맥스'),
  ('Ghroth 숏컷', '나토'),
  ('Neo Catharsis 숏컷', 'TAG underground overlay'),
  ('Hymn of Golden Glory 숏컷', 'Essbee'),
  ('Halloween Party ~Multiverse~ 숏컷', 'SHK'),
  ('Stardream -Eurobeat Remix- 숏컷', 'MAX x Cashew x Dave Rodgers'),
  ('PRiMA MATERiA 숏컷', 'xi'),
  ('DUEL 숏컷', 'Cashew & D_AAN'),
  ('Dignity 풀송', '크래쉬'),
  ('Canon-D 풀송', '반야'),
  ('Beat of the war 2 풀송', '이 얍'),
  ('Love is a Danger Zone pt.2 풀송', '이 얍'),
  ('Monkey Fingers 풀송', '반야 프로덕션'),
  ('Fly 풀송', '에픽하이'),
  ('I''ll Give You All My Love 풀송', '왁스'),
  ('Chopstix 풀송', '이 얍'),
  ('Panuelito Rojo(붉은 손수건) 풀송', 'Big Metra'),
  ('Trato De No Trabarme(잠깐이면 돼) 풀송', 'Big Metra'),
  ('Procedimientos Para Llegar A Un Comun Acuerdo(잘 가 내 사랑) 풀송', 'PXNDX(판다)'),
  ('Slightly 풀송', '45알피엠'),
  ('Come On 풀송', '이정현'),
  ('Chocolate 풀송', '바나나걸'),
  ('Digan Lo Que Digan(나완 상관없어) 풀송', 'Nina Pilots'),
  ('Haven 풀송', 'SGX'),
  ('Maslo 풀송', 'Vospi'),
  ('Smells Like a Chocolate 풀송', 'Vospi'),
  ('Star Command 풀송', 'Zircon'),
  ('Z -The New Legend- 풀송', 'DM Ashura'),
  ('Interference 풀송', '도인'),
  ('Ring Ding Dong 풀송', '샤이니'),
  ('Baroque Virus 풀송', 'Zircon'),
  ('Blow 풀송', 'Future Funk Squad'),
  ('Butterfly 풀송', 'MAX & Rorychesell'),
  ('Jonathan''s Dream 풀송', 'MAX & Seorryang'),
  ('Gargoyle 풀송', 'Sanxion7'),
  ('Nervous 풀송', 'Vospi'),
  ('Pop The Track 풀송', 'J-Mi & Midi-D'),
  ('Slam 풀송', '노바소닉'),
  ('The Ark Sailing Over Truth 풀송', 'Ashley Scared The Sky'),
  ('The Trident ov Power 풀송', 'Magic Hammer'),
  ('π·ρ·maniac 풀송', 'DM Ashura'),
  ('Move That Body! 풀송', 'DM Ashura feat. Skizzo & Hanna'),
  ('Bad Apple!! feat. nomico 풀송', 'Masayoshi Minoshima'),
  ('FOUR SEASONS OF LONELINESS ver β feat. sariyajin 풀송', 'TatshMusicCircle'),
  ('信仰 –1st desire– 풀송', 'TatshMusicCircle'),
  ('Chase Me 풀송', '드림캐쳐'),
  ('86 풀송', 'Dasu'),
  ('Allegro Con Fuoco 풀송', 'DM Ashura'),
  ('한(Alone) 풀송', '(G)I-DLE'),
  ('Time to the moon light(밤) 풀송', '여자친구'),
  ('I''m so sick(1도없어) 풀송', '에이핑크'),
  ('Good bye(잘가라) 풀송', '홍진영'),
  ('Nekkoya(내꺼야) 풀송', 'Produce48'),
  ('Full Moon(풀 문) 풀송', '드림캐쳐'),
  ('Papasito(파파시토){feat. KuTiNA} 풀송', 'Yakikaze & Cashew'),
  ('GOOD NIGHT(굿 나잇) 풀송', '드림캐쳐')
) AS v(title, artist)
ON CONFLICT (machine_id, title) DO NOTHING;
