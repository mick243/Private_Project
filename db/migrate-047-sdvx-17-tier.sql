-- ============================================================
-- 047 · SOUND VOLTEX 17레벨 서열표 (채보만 · 투표 없음)
--
-- ─── 무엇을 만드는가 ─────────────────────────────────────
-- 사볼 Lv17 채보 681개. **투표는 넣지 않습니다** — 전부 '미정' 으로 들어갑니다.
-- 018(PIU S2) · 028 · 030~032 와 같은 방식입니다: 참고한 표의 등급은 아래와
-- 각 행 끝 주석에만 남고, 배치에는 쓰이지 않습니다. 등급은 이 서비스의 투표가
-- 쌓이면서 정해집니다.
--
-- ─── 출처 ────────────────────────────────────────────────
--   SDVX17LV初クリア難易度表 (일본 커뮤니티 스프레드시트)
--   https://docs.google.com/spreadsheets/d/1cFltguBvPplBem-x1STHnG3k4TZzFfyNEZ-RwsQszoo/htmlview
--
-- ⚠ **'첫 클리어' 난이도표입니다** — 체감 난이도 일반이 아니라 클리어 기준입니다.
-- ⚠ **2023/12/25 로 갱신이 멈춘 표입니다** (更新停止). 이후 추가·개정된 채보는
--   빠져 있고, 난이도가 바뀐 채보도 반영되지 않았습니다.
-- ⚠ 시트가 표기한 곡 수(675)와 밴드별 표기 합(671)이 실제 목록(681)과 다릅니다.
--   갱신이 멈춘 뒤 카운트가 따라가지 못한 것으로 보여, **실제 목록**을 따랐습니다.
--
-- ─── 밴드 → 등급 변환 ────────────────────────────────────
-- 요청대로 위쪽 세 밴드를 한 칸씩 올렸습니다. 나머지는 자리 그대로입니다.
--
--   시트 A+ → S      (16곡)      시트 C  → C   (136곡)
--   시트 A  → A+     (55곡)      시트 D  → D   (119곡)
--   시트 B+ → A      (89곡)      시트 E  → E    (98곡)
--   시트 B  → B     (118곡)      시트 F  → F    (38곡)
--
--   시트 F-      → F 로 병합 (9곡). 사볼 등급이 8단(043)이라 자리가 없습니다.
--   시트 超個人差 → 개인차 (3곡). 표에서 '난이도가 사람마다 크게 갈린다' 로
--                    따로 묶어 둔 칸이라 이 서비스의 '개인차' 와 뜻이 같습니다.
--   → S 16 · A+ 55 · A 89 · B 118 · C 136 · D 119 · E 98 · F 47 · 개인차 3
--
-- ⚠ 이 변환은 **주석일 뿐입니다.** 투표를 넣지 않으므로 681곡 전부 '미정' 으로
--   들어갑니다. 서열표 화면의 S·A+·A 칸은 비어 있습니다.
--
-- ─── 시트의 표시 중 옮기지 못한 것 ──────────────────────
-- 범례: 地力 · 鍵盤 · つまみ · 削除曲 · ※個人差 · 【初見殺し】 · 新曲 · 難易度変更
-- 이 중 ※(個人差 47곡)와 【】(初見殺し 61곡)만 곡명에 글자로 있어 알 수 있고,
-- 나머지(地力·鍵盤·つまみ·削除曲·新曲·難易度変更)는 **셀 배경색**으로만 표시돼
-- CSV 내보내기에 남지 않습니다.
--
-- ⚠ 그래서 **삭제곡(削除曲)을 걸러내지 못했습니다.** 이미 서비스 종료된 채보가
--   섞여 있을 수 있습니다. 색을 읽으려면 시트 API 로 서식을 받아야 합니다.
-- ⚠ ※ 와 【】 는 곡명에서 떼어내고 제목만 넣었습니다 — 이 서비스에는 '개인차' 를
--   투표 수렴도로 정하는 규칙이 이미 있어(min_convergence), 남의 표 표시를
--   섞으면 근거가 두 개가 됩니다. 어느 곡이었는지는 각 행 끝 주석에 남깁니다.
--
-- ─── ⚠ 난이도 미표기 113곡 ──────────────────────────────
-- 시트에 [EXH]·[MXM] 같은 난이도 표시가 없는 항목이 113개입니다. 요청대로
-- **표시 없이 그대로** 넣습니다 — charts.mode 를 NULL 로 둡니다. 추측해서
-- EXH 로 채우면 틀린 채보가 조용히 섞이고, 빼면 표의 6분의 1이 사라집니다.
--
-- 그래서 charts.mode 의 NOT NULL 을 뗍니다. 사볼처럼 mode 가 난이도인 게임
-- (045)에서 NULL = '난이도 미표기' 입니다. 펌프의 S/D/CO 는 늘 채워지므로
-- 영향이 없습니다.
--
-- UNIQUE(song_id, mode, level) 도 NULLS NOT DISTINCT 로 다시 만듭니다 —
-- 기본 규칙에서는 NULL 끼리 서로 다른 값이라, 이 파일을 두 번 돌리면 미표기
-- 113개가 그대로 한 벌 더 들어갑니다.
--
-- ─── 난이도 코드 5종을 machine_modes 에 추가 ─────────────
-- 시트에 GRV·VVD·HVN·INF·XCD 가 82곡 쓰였는데 machine_modes 에는 NOV·ADV·
-- EXH·MXM 만 있었습니다. 사볼의 4번째 칸은 기체·시기에 따라 이름이 다릅니다.
--   실제 분포: MXM 354 · EXH 132 · 미표기 113 · GRV 29 · VVD 17 · HVN 14 · INF 13 · XCD 9
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 곡·채보·난이도 모두 ON CONFLICT DO NOTHING.
--
-- ⚠ 이미 있는 채보는 건드리지 않습니다. `Verse IV [EXH]` 한 개가 겹치는데
--   (시드 데이터, 투표 5건으로 C 등급) 그대로 남아 미정이 되지 않습니다.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   DELETE FROM charts WHERE level = 17 AND song_id IN
--     (SELECT id FROM songs WHERE machine_id = 3);
--   DELETE FROM songs WHERE machine_id = 3 AND id NOT IN (SELECT song_id FROM charts);
--   (mode 의 NOT NULL 과 UNIQUE 는 되돌리지 않아도 무해합니다.)
-- ============================================================

-- ─── 1) 사볼 4번째 칸 난이도 이름들 ───────────────────────
INSERT INTO machine_modes (machine_id, code, label, sort_order) VALUES
  (3, 'INF', 'INFINITE', 5),
  (3, 'GRV', 'GRAVITY',  6),
  (3, 'HVN', 'HEAVENLY', 7),
  (3, 'VVD', 'VIVID',    8),
  (3, 'XCD', 'EXCEED',   9)
ON CONFLICT DO NOTHING;

-- ─── 2) 난이도 미표기를 담을 수 있게 ──────────────────────
ALTER TABLE charts ALTER COLUMN mode DROP NOT NULL;

COMMENT ON COLUMN charts.mode IS
  'machine_modes.code. mode_is_difficulty 인 게임(사볼)에서는 난이도이고, NULL 은 ''난이도 미표기''다.';

-- NULL 끼리도 같은 값으로 봐야 재실행이 중복을 만들지 않는다 (Postgres 15+).
ALTER TABLE charts DROP CONSTRAINT IF EXISTS charts_song_id_mode_level_key;
ALTER TABLE charts ADD  CONSTRAINT charts_song_id_mode_level_key
  UNIQUE NULLS NOT DISTINCT (song_id, mode, level);

-- ─── 3) 곡 681개 ──────────────────────────────────────────
-- 행 끝 주석: 시트 밴드 → 변환된 등급, 그리고 시트의 표시(※個人差·【初見殺し】).
-- 아티스트는 시트에 없어 NULL 입니다.
INSERT INTO songs (machine_id, title, artist)
SELECT 3, v.title, NULL
FROM (VALUES
  ('2 MINUTES FIGHTERS'),                              --   A+ → S    EXH
  ('Aftermath'),                                       --   A+ → S    MXM
  ('Booths of Fighters'),                              --   A+ → S    EXH   ※
  ('Candy Colored Hearts'),                            --   A+ → S    EXH
  ('Dyscontrolled Galaxy'),                            --   A+ → S    EXH   ※
  ('Ghost Family Living In Graveyard'),                --   A+ → S    EXH   ※【】
  ('Line 4 Ruin -kohumix-'),                           --   A+ → S    MXM
  ('Nofram'),                                          --   A+ → S    미표기
  ('Sakura Mirage'),                                   --   A+ → S    미표기
  ('ULTRA B+K'),                                       --   A+ → S    MXM   ※
  ('freaky freak'),                                    --   A+ → S    GRV   ※
  ('ほおずき程度には赤い頭髪'),                        --   A+ → S    미표기
  ('ケロ⑨destiny'),                                    --   A+ → S    HVN
  ('ネメシス SDVX Edit'),                              --   A+ → S    미표기
  ('パ→ピ→プ→Yeah'),                                   --   A+ → S    미표기   【】
  ('量子の海のリントヴルム'),                          --   A+ → S    미표기
  ('2094'),                                            --    A → A+   MXM
  ('A Lasting Promise'),                               --    A → A+   EXH
  ('AYAKASHI'),                                        --    A → A+   미표기   ※【】
  ('Aliquam'),                                         --    A → A+   미표기
  ('All Clear!!'),                                     --    A → A+   MXM
  ('Aragami'),                                         --    A → A+   MXM
  ('BAYONEX'),                                         --    A → A+   EXH
  ('BEAT-NEW-WORLD'),                                  --    A → A+   미표기
  ('BLAZE∞BREEZE'),                                    --    A → A+   MXM
  ('CODE -CRiMSON-'),                                  --    A → A+   EXH
  ('Chant du Cygne'),                                  --    A → A+   EXH
  ('Chewingood!!!'),                                   --    A → A+   MXM
  ('Cy-Bird'),                                         --    A → A+   MXM
  ('Destroy'),                                         --    A → A+   GRV
  ('Devastated Territory'),                            --    A → A+   VVD
  ('Dynasty'),                                         --    A → A+   INF
  ('ENDYMION'),                                        --    A → A+   EXH   ※【】
  ('Emperors divide'),                                 --    A → A+   미표기
  ('Enigma'),                                          --    A → A+   미표기
  ('Enigma II'),                                       --    A → A+   MXM
  ('FLYING OUT TO THE SKY'),                           --    A → A+   미표기
  ('Garakuta Doll Play'),                              --    A → A+   EXH
  ('Gott'),                                            --    A → A+   INF
  ('Grand Chariot'),                                   --    A → A+   GRV
  ('HE4VEN ～天国へようこそ～'),                       --    A → A+   EXH
  ('Harpuia'),                                         --    A → A+   EXH
  ('Hexennacht'),                                      --    A → A+   VVD   ※【】
  ('Life is beautiful'),                               --    A → A+   MXM   ※【】
  ('M-O-R-F-I-N-E'),                                   --    A → A+   MXM
  ('NEON WORLD'),                                      --    A → A+   미표기
  ('Non RolicK!!大冒険'),                              --    A → A+   MXM
  ('Poison AND÷OR Affection'),                         --    A → A+   MXM   【】
  ('Pure Evil -Aya2g Drm`n Tech Rmx-'),                --    A → A+   미표기
  ('Pure Evil(Kobaryo FTN-Remix)'),                    --    A → A+   미표기
  ('Royal Judgement'),                                 --    A → A+   GRV
  ('Shanghai Wu Long ～上海舞龍～'),                   --    A → A+   미표기
  ('StrayedCatz'),                                     --    A → A+   GRV
  ('Sulk'),                                            --    A → A+   MXM
  ('TENKAICHI ULTIMATE MEDLEY'),                       --    A → A+   EXH
  ('The End of War'),                                  --    A → A+   미표기   ※
  ('Witch in Sweetsland'),                             --    A → A+   미표기
  ('continew'),                                        --    A → A+   미표기   ※【】
  ('iLLness LiLin'),                                   --    A → A+   EXH
  ('rhythmology study'),                               --    A → A+   MXM
  ('vivid landscape'),                                 --    A → A+   MXM
  ('Μοῦσα'),                                           --    A → A+   MXM
  ('それは花火のような恋'),                            --    A → A+   MXM
  ('ウエンレラの氷華'),                                --    A → A+   GRV
  ('エンゲージ〆ント'),                                --    A → A+   MXM   【】
  ('ナイト・オブ・ナイツ'),                            --    A → A+   INF
  ('少年は空を辿るProg Piano Remix'),                  --    A → A+   GRV
  ('放課後ストライド'),                                --    A → A+   HVN
  ('超越してしまった彼女と其を生み落した理由'),        --    A → A+   EXH   ※【】
  ('雪月花 -さわわRemix-'),                            --    A → A+   미표기
  ('香港功夫大旋風'),                                  --    A → A+   GRV
  ('777'),                                             --   B+ → A    EXH   【】
  ('ABSOLUTE(ismk passionate mix)'),                   --   B+ → A    MXM   【】
  ('Absolute Domination'),                             --   B+ → A    EXH
  ('AμreoLe ~for Triumph~'),                           --   B+ → A    EXH
  ('BabeL ～Next Story～'),                            --   B+ → A    미표기
  ('Believe (y)our Wings{GRA5P WAVES}'),               --   B+ → A    MXM   【】
  ('Believe (y)our Wings{V:VID RAYS}'),                --   B+ → A    MXM   【】
  ('Bule Forest (Prog Key Remix)'),                    --   B+ → A    MXM
  ('CRITICAL LINE'),                                   --   B+ → A    미표기   ※【】
  ('CUTE-Reflection'),                                 --   B+ → A    MXM
  ('Calamity Tempest'),                                --   B+ → A    EXH
  ('Chocolate Parade'),                                --   B+ → A    MXM
  ('Chocolate Planet'),                                --   B+ → A    MXM   ※
  ('Circulator'),                                      --   B+ → A    MXM
  ('Cross Fire'),                                      --   B+ → A    EXH
  ('DIABLOSIS::Nāga'),                                 --   B+ → A    EXH
  ('Daisycutter'),                                     --   B+ → A    EXH   ※【】
  ('Destruction & Qreation'),                          --   B+ → A    MXM
  ('Double Universe'),                                 --   B+ → A    GRV
  ('Dualive'),                                         --   B+ → A    미표기
  ('Everlasting Message'),                             --   B+ → A    EXH
  ('Failnaught'),                                      --   B+ → A    EXH
  ('Fiat Lux'),                                        --   B+ → A    EXH
  ('GERBERA -For Finalists-'),                         --   B+ → A    EXH
  ('Got more raves？'),                                --   B+ → A    EXH
  ('HYENA'),                                           --   B+ → A    EXH   ※
  ('Halcyon'),                                         --   B+ → A    미표기
  ('Help me ERINNNNNN!! -Cranky remix-'),              --   B+ → A    미표기
  ('Historia of Velnoti'),                             --   B+ → A    VVD
  ('Hoshizora Illumination'),                          --   B+ → A    HVN
  ('IX'),                                              --   B+ → A    EXH
  ('Innocent Floor'),                                  --   B+ → A    미표기
  ('Innocent tempest'),                                --   B+ → A    EXH   【】
  ('JOMANDA'),                                         --   B+ → A    미표기
  ('Jetcoaster Windy'),                                --   B+ → A    MXM
  ('Lancelot ～Flame of the Rebellion～'),             --   B+ → A    EXH
  ('Last Concerto'),                                   --   B+ → A    EXH   ※
  ('Lost Wing at.0'),                                  --   B+ → A    MXM
  ('Mayohiga Spurt'),                                  --   B+ → A    미표기
  ('Metamorphobia'),                                   --   B+ → A    미표기
  ('Milk'),                                            --   B+ → A    MXM   ※【】
  ('Musha Vibration'),                                 --   B+ → A    MXM
  ('NEON LOVE♥POTION!!!'),                             --   B+ → A    MXM   ※
  ('Our Faith (Faithful MTL Remix)'),                  --   B+ → A    미표기
  ('Paradission'),                                     --   B+ → A    미표기
  ('Princess Lily'),                                   --   B+ → A    MXM
  ('Quietus Ray'),                                     --   B+ → A    EXH
  ('Rebuilding of Paradise Lost'),                     --   B+ → A    MXM   ※【】
  ('Royal Action'),                                    --   B+ → A    MXM
  ('Sakura Mirage -Drum''n World-'),                   --   B+ → A    MXM
  ('Sharkbait'),                                       --   B+ → A    MXM   ※
  ('Stleq'),                                           --   B+ → A    미표기
  ('Sunflower Vibes'),                                 --   B+ → A    MXM
  ('TWO-TORIAL'),                                      --   B+ → A    EXH
  ('The star in eclipse'),                             --   B+ → A    EXH
  ('Time to Air -Fly High Remix-'),                    --   B+ → A    미표기
  ('Verse IV'),                                        --   B+ → A    EXH
  ('Virtual Bit'),                                     --   B+ → A    미표기
  ('Voynich:Manuscript'),                              --   B+ → A    미표기
  ('XROSS INFECTION'),                                 --   B+ → A    EXH
  ('clear:wings'),                                     --   B+ → A    MXM
  ('infinite:youniverse'),                             --   B+ → A    MXM
  ('planetarium'),                                     --   B+ → A    MXM   【】
  ('{albus}'),                                         --   B+ → A    미표기
  ('ΕΛΠΙΣ'),                                           --   B+ → A    미표기
  ('ΩBIRD'),                                           --   B+ → A    MXM   【】
  ('ЯeviveR'),                                         --   B+ → A    EXH
  ('そして紫の幻想曲は全てを受け入れる'),              --   B+ → A    미표기
  ('アキネイション'),                                  --   B+ → A    미표기
  ('オルターエゴ'),                                    --   B+ → A    MXM   【】
  ('キモチコネクト'),                                  --   B+ → A    GRV
  ('ゲキツイムラサ'),                                  --   B+ → A    미표기
  ('ゴーストルール'),                                  --   B+ → A    MXM
  ('サヨナラ・ヘヴン(かめりあ`sRMX)'),                 --   B+ → A    HVN
  ('チルノとまりおのパーフェクト算数教室'),            --   B+ → A    미표기   【】
  ('ハレ晴レユカイ'),                                  --   B+ → A    MXM
  ('ホーンテッド★メイドランチ'),                       --   B+ → A    미표기
  ('ラキラキ'),                                        --   B+ → A    MXM
  ('人形裁判 -THIRD IMPACT -'),                        --   B+ → A    미표기
  ('伊邪那美白山姫大神'),                              --   B+ → A    MXM
  ('熱情のザパデアート'),                              --   B+ → A    MXM   ※
  ('物凄いｽﾍﾟｰｽｼｬﾄﾙでこいしが物凄いうた'),             --   B+ → A    MXM
  ('紅の剣舞'),                                        --   B+ → A    미표기
  ('色を喪った街'),                                    --   B+ → A    EXH
  ('超超光速スピードスターかなで'),                    --   B+ → A    EXH   【】
  ('闇夜に舞うは紅の華'),                              --   B+ → A    MXM
  ('雪女'),                                            --   B+ → A    GRV
  ('零次元エクスプレス'),                              --   B+ → A    MXM
  ('飄える翼追い掛けて'),                              --   B+ → A    EXH
  ('- Jupiter -'),                                     --    B → B    MXM
  ('2 Beasts Unchained'),                              --    B → B    EXH
  ('3y3s (JMBS FUNKOT RMX)'),                          --    B → B    MXM
  ('50th Memorial Songs -The BEMANI History-'),        --    B → B    VVD
  ('AA BlackY mix'),                                   --    B → B    INF
  ('Afterimage d`automne'),                            --    B → B    MXM
  ('Another Chapter'),                                 --    B → B    MXM   ※
  ('BLACK JACKAL'),                                    --    B → B    MXM
  ('Berry Go!!'),                                      --    B → B    MXM
  ('CUTIE☆EX-DREAM'),                                  --    B → B    미표기
  ('Chocolate Planet（いるちょこRemix）'),             --    B → B    MXM
  ('Continuous Moment'),                               --    B → B    MXM
  ('DEEP PSYCHEDELIC STRIKER'),                        --    B → B    MXM
  ('DO-IT-AMA-SITE!!!'),                               --    B → B    VVD
  ('Dark Matter'),                                     --    B → B    MXM   ※
  ('Decretum'),                                        --    B → B    미표기
  ('Dharma'),                                          --    B → B    MXM
  ('Distorted Floor'),                                 --    B → B    INF
  ('EGG'),                                             --    B → B    GRV
  ('FUJIMORI -祭- FESTIVAL'),                          --    B → B    MXM   【】
  ('False Cross'),                                     --    B → B    미표기
  ('Fire Strike'),                                     --    B → B    HVN
  ('Fun walk!!'),                                      --    B → B    MXM
  ('Fáfnir'),                                          --    B → B    MXM
  ('Ganymede kamome mix'),                             --    B → B    EXH   ※
  ('Get back here'),                                   --    B → B    GRV
  ('Gimme dreamin'''),                                 --    B → B    VVD
  ('Glory of Fighters'),                               --    B → B    EXH
  ('Hellfire'),                                        --    B → B    EXH   ※
  ('Impress(siqlo`s Hi-Tech Veats)'),                  --    B → B    MXM
  ('Inixia'),                                          --    B → B    GRV
  ('Into The Madness'),                                --    B → B    MXM   【】
  ('Iridescent Crouds'),                               --    B → B    MXM
  ('JUGGLE'),                                          --    B → B    MXM
  ('Jailbreaker'),                                     --    B → B    MXM
  ('Justitia Gladius'),                                --    B → B    MXM
  ('KAC 2012 ULTIMATE MEDLEY'),                        --    B → B    EXH   ※
  ('Knights Assault'),                                 --    B → B    MXM
  ('Libera me'),                                       --    B → B    MXM
  ('LubedeR'),                                         --    B → B    EXH   ※
  ('MAXIVCORD'),                                       --    B → B    MXM
  ('MILITARY R04D'),                                   --    B → B    EXH
  ('Max Burning!!'),                                   --    B → B    EXH   ※
  ('Me:Tear'),                                         --    B → B    MXM
  ('PIZZATIME'),                                       --    B → B    MXM
  ('Pieces of a Dream'),                               --    B → B    미표기
  ('Pure Evil'),                                       --    B → B    미표기
  ('Quark'),                                           --    B → B    MXM
  ('Rapsodia d''amore'),                               --    B → B    EXH
  ('Rebellio'),                                        --    B → B    EXH
  ('Rejoin'),                                          --    B → B    MXM   【】
  ('Revolution'),                                      --    B → B    MXM
  ('Rhapsody ⚙︎f Triumph'),                            --    B → B    EXH
  ('Sailing Force'),                                   --    B → B    EXH
  ('Six String Proof'),                                --    B → B    MXM
  ('Sparkle Smilin`'),                                 --    B → B    MXM
  ('TIEFSEE'),                                         --    B → B    미표기
  ('Tribal Trial'),                                    --    B → B    MXM
  ('Twilight∞nighT'),                                  --    B → B    MXM
  ('U.N.オーエンは彼女なのか？haru_naba Remix'),       --    B → B    EXH   【】
  ('UROBØROS'),                                        --    B → B    미표기
  ('Vampire''s Territory'),                            --    B → B    미표기   ※
  ('WONDER_WOBBLER'),                                  --    B → B    MXM
  ('Whip☆Drip'),                                       --    B → B    MXM
  ('Xroniàl Xéro'),                                    --    B → B    EXH
  ('conflict'),                                        --    B → B    미표기
  ('eXtridia'),                                        --    B → B    MXM
  ('gigadelic -stance xxxx-'),                         --    B → B    미표기
  ('gigadelic(m3rkAb4# R3m!x)'),                       --    B → B    미표기
  ('onslaught -Retaliation of Bahamūt-'),              --    B → B    EXH
  ('smooooch・∀・ KN mix'),                            --    B → B    XCD   【】
  ('snow storm -euphoria-'),                           --    B → B    EXH
  ('take a step forward'),                             --    B → B    HVN
  ('ΛΛemoria'),                                        --    B → B    EXH
  ('†:OLPHEUX:†'),                                     --    B → B    EXH
  ('うさぬこぬんぬんファンタジー！'),                  --    B → B    MXM
  ('おーまい！らぶりー！すうぃーてぃー！だーりん！'),  --    B → B    MXM
  ('ふ・れ・ん・ど・し・た・い(WEREHEREMIX)'),         --    B → B    MXM
  ('ゆりゆらららゆるゆり大事件 (yuzenリミ)'),          --    B → B    MXM
  ('イグジスタンス'),                                  --    B → B    미표기
  ('インドア系ならトラックメイカー'),                  --    B → B    MXM   【】
  ('ウバワレ'),                                        --    B → B    GRV
  ('キャプテン・マリンのケツアンカー'),                --    B → B    MXM
  ('キラメキ居残り大戦争'),                            --    B → B    MXM
  ('キリカ'),                                          --    B → B    MXM
  ('ケムマキunderground'),                             --    B → B    MXM
  ('コメット⇒スケイター'),                             --    B → B    MXM   【】
  ('シル・ヴ・プレジデント'),                          --    B → B    MXM
  ('セイレーン ～悲壮の竪琴～'),                       --    B → B    EXH
  ('セツナトリップ'),                                  --    B → B    HVN
  ('バンブーソード・ガール'),                          --    B → B    EXH
  ('フォニイ'),                                        --    B → B    MXM
  ('プラネタジャーニー'),                              --    B → B    MXM   【】
  ('ムーニャポヨポヨスッポコニャーゴ'),                --    B → B    EXH   ※
  ('ラブキラ☆スプラッシュ'),                           --    B → B    MXM
  ('ロプノールの商隊'),                                --    B → B    MXM
  ('ロンロンへ ライライライ！'),                       --    B → B    GRV
  ('信仰は儚き人間の為に～Arr.Demetori'),              --    B → B    미표기   【】
  ('卑弥呼'),                                          --    B → B    EXH   【】
  ('君は Fantasista'),                                 --    B → B    MXM
  ('夢の終わり、世界のはじまり。'),                    --    B → B    MXM
  ('少女綺想曲-G.X.N.Remix-'),                         --    B → B    MXM   ※
  ('常夏！！クリスタライズ・シャーベット'),            --    B → B    미표기   ※
  ('悪戯センセーション'),                              --    B → B    MXM
  ('感情の摩天楼～Arr.Demetori'),                      --    B → B    미표기
  ('機械仕掛けの魔法使い'),                            --    B → B    MXM
  ('焔 -MAGMA-'),                                      --    B → B    MXM
  ('物凄い狂っとるフランちゃんが物凄いうた'),          --    B → B    미표기
  ('獅子奮迅'),                                        --    B → B    MXM
  ('紫焔双穿'),                                        --    B → B    EXH
  ('羅生門'),                                          --    B → B    MXM
  ('赫焉'),                                            --    B → B    EXH
  ('遷'),                                              --    B → B    VVD
  ('金縛りの逢を'),                                    --    B → B    EXH   ※
  ('響く静寂'),                                        --    B → B    MXM
  ('鬼天'),                                            --    B → B    미표기
  ('黒髪乱れし修羅となりて ~凛 edition~'),             --    B → B    미표기
  ('０=Xerostrumental='),                              --    B → B    미표기
  ('.59 -BOOTH REMIX-'),                               --    C → C    HVN
  ('120秒のエンドロール'),                             --    C → C    MXM
  ('405nm(Shu※mix)'),                                  --    C → C    MXM
  ('ABSOLUTE(EUROBEAT REMIX)'),                        --    C → C    MXM
  ('Appliqué'),                                        --    C → C    GRV
  ('Avalanx'),                                         --    C → C    EXH
  ('Awakening'),                                       --    C → C    EXH
  ('BELOBOG'),                                         --    C → C    EXH
  ('BLIZZARD BEAT'),                                   --    C → C    MXM
  ('Blue Stream'),                                     --    C → C    MXM
  ('CENSORED!!'),                                      --    C → C    미표기
  ('CLOUDS FLYER'),                                    --    C → C    MXM
  ('CUDDLIE CUDDLIE'),                                 --    C → C    MXM
  ('Carry Me Away'),                                   --    C → C    MXM
  ('Chaotic Romance'),                                 --    C → C    MXM
  ('Clash of swords'),                                 --    C → C    미표기
  ('DEADLOCK XXX'),                                    --    C → C    미표기
  ('DESIRE'),                                          --    C → C    MXM
  ('Din Don Dan'),                                     --    C → C    XCD
  ('Discloze'),                                        --    C → C    미표기
  ('EDEN of TRUTH'),                                   --    C → C    MXM
  ('Elemental Creation'),                              --    C → C    EXH   ※
  ('Empty Backdoor'),                                  --    C → C    MXM
  ('Enter The Fire'),                                  --    C → C    MXM
  ('FIRE FIRE -DARK BLAZE REMIX-'),                    --    C → C    미표기
  ('FIRE FIRE(Kazmasa Remix)'),                        --    C → C    미표기
  ('FREEDOM DiVE'),                                    --    C → C    EXH   ※
  ('Fly Like You'),                                    --    C → C    EXH
  ('Follow up'),                                       --    C → C    미표기
  ('Foolish Again'),                                   --    C → C    MXM
  ('For.*tune'),                                       --    C → C    MXM   ※
  ('GODHEART'),                                        --    C → C    EXH
  ('Grip & Break down !!'),                            --    C → C    XCD
  ('HEAVENLY SMILE'),                                  --    C → C    MXM
  ('Heavenly Adventure'),                              --    C → C    MXM
  ('Hello World'),                                     --    C → C    XCD
  ('Help me,ERINNNNNN!! #幻想郷ホロイズムver'),        --    C → C    MXM
  ('Holy Legacy'),                                     --    C → C    VVD
  ('INFINITY OVERDRIVE'),                              --    C → C    GRV   【】
  ('Idola'),                                           --    C → C    EXH
  ('If'),                                              --    C → C    MXM
  ('Inscape'),                                         --    C → C    MXM
  ('KiLLeR MeRMaiD'),                                  --    C → C    미표기
  ('LIKE A VAMPIRE'),                                  --    C → C    MXM
  ('LaμreLs ~the Angelus~'),                           --    C → C    EXH
  ('LittleGameStar'),                                  --    C → C    GRV
  ('MARENOL'),                                         --    C → C    MXM
  ('MICHIZURE'),                                       --    C → C    MXM
  ('MOVE! (We Keep It Movin'')'),                      --    C → C    MXM
  ('Melty Sweets'),                                    --    C → C    MXM
  ('Mischievous theater'),                             --    C → C    MXM
  ('Never Fails'),                                     --    C → C    미표기
  ('No way'),                                          --    C → C    MXM
  ('One In A Billion(Hedonist Rimix)'),                --    C → C    MXM
  ('Opium and Purple haze'),                           --    C → C    EXH
  ('PIERROT KNIfE'),                                   --    C → C    MXM
  ('PRIDE of the FIREBALL'),                           --    C → C    MXM
  ('Parousia'),                                        --    C → C    미표기
  ('Pet Peeve'),                                       --    C → C    미표기   ※
  ('Poppin’Cats!!'),                                   --    C → C    MXM
  ('Record one''s Dream'),                             --    C → C    MXM
  ('Redshift 2nd Ignition'),                           --    C → C    EXH
  ('Reverenced Flower'),                               --    C → C    EXH
  ('S1CK_F41RY'),                                      --    C → C    미표기
  ('SHION -sublimation mix-'),                         --    C → C    MXM
  ('SPACE VILLAGE'),                                   --    C → C    MXM
  ('Sakura Fubuki'),                                   --    C → C    MXM   【】
  ('Screaming!!'),                                     --    C → C    VVD
  ('Space Diver Tama'),                                --    C → C    HVN
  ('Sparkling Laser Beam'),                            --    C → C    VVD
  ('Spider Dance / スパイダーダンス'),                 --    C → C    MXM
  ('TOXIC VIBRATION'),                                 --    C → C    미표기
  ('Tic Exe'),                                         --    C → C    MXM
  ('VIVID DEBUT!'),                                    --    C → C    MXM
  ('VIVIDWAVERS'),                                     --    C → C    MXM
  ('VOLAQUAS'),                                        --    C → C    EXH
  ('Vigor'),                                           --    C → C    MXM
  ('WICKeD CRΦSS'),                                    --    C → C    MXM
  ('WILD FIRE'),                                       --    C → C    MXM
  ('Wheel'),                                           --    C → C    HVN
  ('Xb10r'),                                           --    C → C    EXH
  ('Zelophilia'),                                      --    C → C    MXM
  ('choux à la crème'),                                --    C → C    GRV
  ('cobalt'),                                          --    C → C    MXM
  ('fantastic dreamer'),                               --    C → C    MXM
  ('floorkiller'),                                     --    C → C    VVD
  ('le coeur patissiere'),                             --    C → C    MXM
  ('perditus†paradisus'),                              --    C → C    EXH
  ('ultra turbo'),                                     --    C → C    MXM
  ('who I am'),                                        --    C → C    MXM
  ('αzalea'),                                          --    C → C    EXH
  ('Яegret of MemoRy'),                                --    C → C    MXM
  ('いでぃおで結構!'),                                 --    C → C    MXM
  ('おどりましょうよ！ドラゴンさん'),                  --    C → C    MXM
  ('じゅーじゅー♥焼肉の火からフェニックス'),           --    C → C    미표기
  ('すろぉもぉしょん'),                                --    C → C    MXM
  ('ぼくらの16bit戦争'),                               --    C → C    MXM
  ('もってけ！セーラーふく'),                          --    C → C    MXM
  ('ようこそジャパリパークへ'),                        --    C → C    MXM
  ('アルファ・スカイ'),                                --    C → C    MXM
  ('オリガミカル・スウィートラヴ'),                    --    C → C    MXM
  ('クレイジークレイジーダンサーズ'),                  --    C → C    MXM
  ('シープドリーミン'),                                --    C → C    MXM
  ('ステラレギア'),                                    --    C → C    MXM
  ('セイシュンライナー'),                              --    C → C    MXM
  ('チェイスチェイスジョーカーズのうた'),              --    C → C    MXM   【】
  ('デンデラパーティーナイト'),                        --    C → C    MXM
  ('トランスダンスアナーキー'),                        --    C → C    MXM
  ('ドゥサンコオデッセイ!!'),                          --    C → C    EXH
  ('ピアノ独奏無言歌 "灰燼"'),                         --    C → C    EXH
  ('プレインエイジア(MRM REMIX)'),                     --    C → C    MXM
  ('ベビーステップ'),                                  --    C → C    MXM
  ('マネマネサイコトロピック'),                        --    C → C    XCD
  ('メルヘン風紀委員会'),                              --    C → C    MXM
  ('人生リセットボタン'),                              --    C → C    VVD
  ('十の試煉'),                                        --    C → C    EXH
  ('十面相'),                                          --    C → C    VVD
  ('夏色DIARY -SD''VmiX-'),                            --    C → C    EXH
  ('幻想系世界修復少女'),                              --    C → C    HVN
  ('打打打打打打打打打打'),                            --    C → C    INF
  ('柳の下のデュラハン'),                              --    C → C    미표기
  ('泥の分際で私だけの大切を奪おうなんて'),            --    C → C    MXM   【】
  ('濁色踊るオートマタ'),                              --    C → C    MXM   【】
  ('無意識レクイエム'),                                --    C → C    MXM
  ('煙'),                                              --    C → C    MXM
  ('真夏の海の修道女'),                                --    C → C    MXM
  ('真夏の蜜と唇 fm. 希望の星は青霄に昇る'),           --    C → C    MXM
  ('穢れなきユーフォリア'),                            --    C → C    MXM   【】
  ('終点の先が在るとするならば'),                      --    C → C    MXM   【】
  ('蓬莱フェスティボー'),                              --    C → C    MXM
  ('逆月'),                                            --    C → C    EXH
  ('過食性:アイドル症候群'),                           --    C → C    INF
  ('銃弾は解を撃ち抜いて'),                            --    C → C    MXM
  ('雲の彼方'),                                        --    C → C    EXH
  ('革命パッショネイト'),                              --    C → C    MXM
  ('［E］'),                                           --    C → C    MXM
  ('#FairyJoke #SDVX_Edit'),                           --    D → D    미표기   ※【】
  ('444'),                                             --    D → D    MXM
  ('ALBIDA Powerless Mix'),                            --    D → D    INF
  ('ANTI THE∞HOLiC'),                                  --    D → D    미표기
  ('AXION'),                                           --    D → D    MXM
  ('All We Need is HAPPY END!!!'),                     --    D → D    EXH
  ('B.B.K.K.B.K.K.'),                                  --    D → D    EXH
  ('BREAKNECK NY☆N! NY★N!'),                           --    D → D    MXM
  ('Black or Red?'),                                   --    D → D    MXM
  ('Bye or not'),                                      --    D → D    MXM
  ('Colorless feat.ももかみ'),                         --    D → D    MXM
  ('Deadly Dolly Dance'),                              --    D → D    미표기
  ('Death by Glamour/華麗なる死闘'),                   --    D → D    MXM
  ('Dreaming feat. nomico'),                           --    D → D    MXM   【】
  ('Empathetic'),                                      --    D → D    MXM
  ('EncorE & cALL'),                                   --    D → D    EXH
  ('Erlung'),                                          --    D → D    GRV
  ('F.K.S.'),                                          --    D → D    미표기   ※
  ('FLOOR INFECTION Medley'),                          --    D → D    EXH
  ('Far Away'),                                        --    D → D    MXM
  ('Finale'),                                          --    D → D    MXM
  ('Flip Flap'),                                       --    D → D    MXM
  ('Fαtα∠ Ent∠mEnt'),                                  --    D → D    EXH
  ('Game Over'),                                       --    D → D    MXM
  ('HAELEQUIN'),                                       --    D → D    미표기
  ('Harmonia'),                                        --    D → D    MXM
  ('I Left for my Right'),                             --    D → D    MXM
  ('INDEPENDENT SKY'),                                 --    D → D    GRV   ※
  ('JULIAN'),                                          --    D → D    MXM
  ('Joyeuse'),                                         --    D → D    EXH   ※
  ('Last Resort'),                                     --    D → D    EXH
  ('Lisa-RICCIA'),                                     --    D → D    EXH
  ('Liévre -blanche-'),                                --    D → D    MXM
  ('Lord=Crossight'),                                  --    D → D    EXH
  ('Love Love Scarlet'),                               --    D → D    MXM
  ('OUTERHEΛVEN'),                                     --    D → D    EXH
  ('POSSESSION(Gowrock Remix)'),                       --    D → D    MXM
  ('PRESERVED VAMPIRE'),                               --    D → D    MXM
  ('Pixelated Platform（Superhoney）'),                --    D → D    MXM
  ('REGALIA'),                                         --    D → D    미표기
  ('Re:Rose Gun Shoooot!'),                            --    D → D    MXM
  ('Realize'),                                         --    D → D    MXM
  ('Resonant Gear'),                                   --    D → D    MXM
  ('SOUL EXPLOSION'),                                  --    D → D    XCD
  ('Secret Traveler'),                                 --    D → D    MXM   【】
  ('Sparky spark'),                                    --    D → D    MXM
  ('Staring at star'),                                 --    D → D    EXH
  ('Struggle for Revival'),                            --    D → D    MXM   【】
  ('THE凸GENERATOR'),                                  --    D → D    EXH
  ('THUNDERCRACK'),                                    --    D → D    미표기
  ('TYCOON'),                                          --    D → D    INF
  ('Technical Master'),                                --    D → D    MXM
  ('The Clown of 24stairs'),                           --    D → D    EXH
  ('The First Step'),                                  --    D → D    MXM
  ('The Sampling Paradise(P*Light Remix)'),            --    D → D    EXH
  ('True Blue'),                                       --    D → D    미표기
  ('VOLTEXES IV'),                                     --    D → D    MXM
  ('Verstärkt Killer'),                                --    D → D    MXM   【】
  ('WWW'),                                             --    D → D    MXM
  ('Wish upon Twin Stars'),                            --    D → D    EXH
  ('Xibercannon'),                                     --    D → D    MXM
  ('Xéroa'),                                           --    D → D    EXH
  ('ZEUS'),                                            --    D → D    EXH
  ('Zero-Day Exploit'),                                --    D → D    미표기
  ('[ ]DENTITY'),                                      --    D → D    EXH
  ('empty'),                                           --    D → D    MXM
  ('good high school'),                                --    D → D    INF
  ('voltississimo'),                                   --    D → D    EXH
  ('éclair au chocolat'),                              --    D → D    GRV
  ('θコトノハθカプセルθ'),                             --    D → D    EXH
  ('ぼくらしかしらない'),                              --    D → D    미표기
  ('みたらしプラトニック'),                            --    D → D    MXM
  ('イカサマライフゲイム'),                            --    D → D    HVN
  ('カシオペアノヒカリ'),                              --    D → D    MXM
  ('カミサマネジマキ'),                                --    D → D    GRV
  ('グッバイ宣言'),                                    --    D → D    MXM
  ('サクラノソバニ'),                                  --    D → D    MXM
  ('ステラ・イミグレーション'),                        --    D → D    MXM
  ('ストリーミングハート'),                            --    D → D    MXM
  ('スーパー戦湯ババンバーン'),                        --    D → D    MXM
  ('チクサクコールが懐かしい'),                        --    D → D    MXM   【】
  ('ディスコルディア'),                                --    D → D    EXH
  ('デュアルメモリ'),                                  --    D → D    MXM
  ('トウキョーサマーナイト（華金Remix）'),             --    D → D    MXM
  ('ネトゲ廃人シュプレヒコール'),                      --    D → D    XCD
  ('ヒトガタ'),                                        --    D → D    MXM
  ('ヒトリゴト'),                                      --    D → D    MXM
  ('ヒバナ-Reloaded-'),                                --    D → D    MXM
  ('ピアノ協奏曲第１番”蠍火”'),                        --    D → D    EXH
  ('フェアリーテイル・ラヴァーズ'),                    --    D → D    MXM
  ('ボーイミーツ・ブルー'),                            --    D → D    MXM
  ('メモリーズ'),                                      --    D → D    MXM   【】
  ('僕らの時間'),                                      --    D → D    MXM
  ('全力ハッピーライフ'),                              --    D → D    MXM
  ('勇者の卒業式'),                                    --    D → D    MXM
  ('叛逆のディスパレート'),                            --    D → D    MXM
  ('地球最後の告白を'),                                --    D → D    XCD
  ('夢見草奇譚'),                                      --    D → D    VVD
  ('孤月群雲に沈む'),                                  --    D → D    VVD
  ('幽玄の桜'),                                        --    D → D    MXM
  ('御伽噺に幕切れを'),                                --    D → D    MXM
  ('恋愛＝精度×認識力'),                               --    D → D    EXH   【】
  ('恋獄対刃'),                                        --    D → D    MXM
  ('患部で止まってすぐ溶ける'),                        --    D → D    INF
  ('斑咲花'),                                          --    D → D    MXM
  ('星座が恋した瞬間を。'),                            --    D → D    MXM
  ('月下の舞兎祭'),                                    --    D → D    MXM
  ('木洩れ日に咲く'),                                  --    D → D    MXM
  ('朱と碧のランページ'),                              --    D → D    미표기
  ('漆黒のスペシャルプリンセスサンデー'),              --    D → D    미표기
  ('無気力クーデター'),                                --    D → D    미표기
  ('神にした彼女が示す世界線'),                        --    D → D    MXM   【】
  ('竹'),                                              --    D → D    EXH   ※【】
  ('竹取飛翔'),                                        --    D → D    HVN
  ('赫焉のヴァルキュリア'),                            --    D → D    EXH
  ('運命超過乃巡合'),                                  --    D → D    MXM
  ('雲海'),                                            --    D → D    MXM
  ('音楽 -resolve-'),                                  --    D → D    EXH   【】
  ('黎明スケッチブック'),                              --    D → D    MXM
  ('9TH5IN'),                                          --    E → E    EXH
  ('ABSOLUTE (saminun mix)'),                          --    E → E    MXM
  ('ANGER of the GOD'),                                --    E → E    EXH
  ('Adrenaline Rush'),                                 --    E → E    MXM
  ('Aerial Skydive'),                                  --    E → E    MXM
  ('Apex of the World'),                               --    E → E    미표기
  ('Arcade Prison'),                                   --    E → E    MXM
  ('Backflow'),                                        --    E → E    미표기
  ('Borealis'),                                        --    E → E    미표기
  ('CARNIVOROUS'),                                     --    E → E    MXM
  ('CLAMARE'),                                         --    E → E    EXH
  ('Chakra'),                                          --    E → E    MXM
  ('Chronomia'),                                       --    E → E    EXH
  ('Coldlapse'),                                       --    E → E    MXM
  ('DEUX EX MĀXHINĀ'),                                 --    E → E    EXH
  ('Deadly force'),                                    --    E → E    EXH
  ('Decoy'),                                           --    E → E    MXM
  ('EBONY & IVORY'),                                   --    E → E    미표기
  ('EGOISM -Rebuild-'),                                --    E → E    MXM
  ('Enjoy This Time'),                                 --    E → E    MXM
  ('Four Leaves'),                                     --    E → E    MXM
  ('HALO'),                                            --    E → E    EXH
  ('Junk Mania'),                                      --    E → E    MXM
  ('Little princess has no identity.'),                --    E → E    미표기
  ('Lost Emotion feat.nomico'),                        --    E → E    MXM
  ('Lucky*Clover'),                                    --    E → E    미표기
  ('Made In Love'),                                    --    E → E    MXM
  ('NIN-NIN-NIN!!'),                                   --    E → E    MXM
  ('Pixelated Platform'),                              --    E → E    MXM
  ('Redo'),                                            --    E → E    MXM
  ('Rubeus'),                                          --    E → E    미표기
  ('STYX HELIX(Digi-Rock Remix)'),                     --    E → E    MXM
  ('SUPER BUBBLE JOURNEY'),                            --    E → E    MXM
  ('Sacrifce Escape: 不条理の模倣による感情と代償'),   --    E → E    MXM
  ('Second Game'),                                     --    E → E    MXM
  ('Sephirot'),                                        --    E → E    GRV
  ('Smoked Turkey Rag'),                               --    E → E    MXM
  ('Spear of Justice/正義の槍'),                       --    E → E    MXM
  ('Splash Underwater'),                               --    E → E    MXM
  ('Synergy For Angels'),                              --    E → E    MXM
  ('The setting sun'),                                 --    E → E    미표기   ※
  ('Triple Counter'),                                  --    E → E    EXH
  ('V.I.P.'),                                          --    E → E    EXH
  ('Voltage Higher'),                                  --    E → E    MXM
  ('VΛZiLiSQ'),                                        --    E → E    EXH
  ('Xymatic Scope'),                                   --    E → E    MXM   【】
  ('ZEPHYRANTHES'),                                    --    E → E    GRV
  ('akasha-assembly'),                                 --    E → E    미표기
  ('bistro twins☆☆☆'),                                 --    E → E    MXM
  ('charm♡you'),                                       --    E → E    MXM
  ('cloche(といぼっくすうぃんぐ　りみっくす)'),        --    E → E    MXM
  ('cloud'),                                           --    E → E    HVN
  ('impress(bansou Remix)'),                           --    E → E    MXM
  ('invisible Bullets'),                               --    E → E    MXM
  ('odds and ends'),                                   --    E → E    GRV
  ('sink into the dream'),                             --    E → E    MXM
  ('toy boxer'),                                       --    E → E    MXM
  ('β'),                                               --    E → E    MXM
  ('あれこれそれどれ'),                                --    E → E    미표기
  ('おにいちゃんハイテック'),                          --    E → E    MXM
  ('きらきらタイム☆'),                                 --    E → E    미표기
  ('ここからよろしく大作戦143'),                       --    E → E    MXM
  ('すべてが幻になった後で'),                          --    E → E    EXH
  ('ぶいちゅっばの歌'),                                --    E → E    MXM
  ('アワデコノヨヲ'),                                  --    E → E    MXM
  ('アンハッピーリフレイン'),                          --    E → E    MXM
  ('イゴモヨスのブヨブヨ・スケッチ'),                  --    E → E    미표기   ※
  ('ガヴリールドロップキック'),                        --    E → E    MXM
  ('ハートシェイプ・スピカ'),                          --    E → E    MXM
  ('バイナリスター'),                                  --    E → E    VVD
  ('ヒミツダイヤル'),                                  --    E → E    VVD   ※【】
  ('ブチ上げ候！現代忍者三姉妹'),                      --    E → E    MXM
  ('ボルテ体操第一'),                                  --    E → E    EXH   ※
  ('メテオライツ・プレリュード'),                      --    E → E    MXM
  ('メンタンピンドラドラ'),                            --    E → E    MXM
  ('ロキ'),                                            --    E → E    MXM
  ('ヴァンパイア'),                                    --    E → E    MXM
  ('凛として咲く花の如く'),                            --    E → E    MXM
  ('分けるな危険！モモモモモモーイズム'),              --    E → E    MXM
  ('創世ノート'),                                      --    E → E    MXM
  ('天ノ弱'),                                          --    E → E    INF
  ('少女暴動'),                                        --    E → E    미표기
  ('廃獄ドリームランド'),                              --    E → E    MXM
  ('御千手メディテーション'),                          --    E → E    INF
  ('悪性ロリィタマキャヴェリズム'),                    --    E → E    미표기
  ('断罪は遍く人間の元に'),                            --    E → E    미표기
  ('暴走'),                                            --    E → E    미표기
  ('水槽のクジラ'),                                    --    E → E    MXM
  ('炎夏の音'),                                        --    E → E    MXM
  ('神っぽいな'),                                      --    E → E    MXM
  ('轟け！恋のビーンボール！！'),                      --    E → E    EXH
  ('近未来百鬼夜行譚～死返之巻～'),                    --    E → E    MXM
  ('透明声彩'),                                        --    E → E    MXM
  ('鏡面の波(ramble mix)'),                            --    E → E    MXM   【】
  ('門門しましょ'),                                    --    E → E    MXM
  ('零の位相'),                                        --    E → E    MXM
  ('驪駒早鬼は馬並み☆プロテイン'),                     --    E → E    MXM
  ('黎明の情'),                                        --    E → E    MXM
  ('ASGORE/アズゴア'),                                 --    F → F    MXM
  ('Altale'),                                          --    F → F    MXM   【】
  ('Apocrypha'),                                       --   F- → F    MXM
  ('Awakening Wings'),                                 --   F- → F    MXM
  ('Blue Forest(NightBounce Remix)'),                  --    F → F    MXM
  ('Chrono Diver -PENDULUMs-'),                        --    F → F    EXH
  ('D1g1t1ze b0dy'),                                   --    F → F    MXM
  ('Drizzly Venom'),                                   --   F- → F    MXM
  ('Fly far bounce'),                                  --    F → F    MXM   【】
  ('Happy Sensation'),                                 --    F → F    미표기
  ('ILL-STARRED Diver'),                               --    F → F    MXM
  ('LUCKY CAT'),                                       --    F → F    MXM
  ('Last Battalion'),                                  --    F → F    GRV
  ('MA・TSU・RI'),                                     --    F → F    MXM
  ('Mist in Hell'),                                    --    F → F    미표기
  ('Oriens'),                                          --    F → F    MXM
  ('PLANISPHERE'),                                     --    F → F    MXM
  ('Paradisus-Paradoxum'),                             --   F- → F    MXM
  ('Phlox'),                                           --    F → F    MXM
  ('QUAKE'),                                           --   F- → F    MXM
  ('Re:call'),                                         --    F → F    MXM
  ('Sadistic Stabbing'),                               --    F → F    MXM
  ('Sleepless days'),                                  --    F → F    MXM
  ('Still Lonesome'),                                  --    F → F    MXM
  ('Trill auf G'),                                     --    F → F    EXH
  ('Twin Rocket'),                                     --    F → F    미표기
  ('cross the future'),                                --    F → F    미표기
  ('scary night'),                                     --    F → F    MXM
  ('↑↑↓↓←→←→BA'),                                      --   F- → F    MXM   【】
  ('インビジブル'),                                    --    F → F    MXM
  ('オンディーヌの泪'),                                --    F → F    MXM
  ('スノウイコン'),                                    --   F- → F    MXM   【】
  ('ツキアカリ'),                                      --    F → F    MXM
  ('ハレ トキドキ メランコリック'),                    --   F- → F    MXM
  ('ペタ靴と憂夜リムーバー'),                          --    F → F    MXM
  ('ポメグラネイト'),                                  --    F → F    GRV
  ('太陽曰く燃えよカオス'),                            --    F → F    MXM   【】
  ('失敗作少女'),                                      --    F → F    MXM
  ('星の詩'),                                          --    F → F    MXM
  ('無双'),                                            --    F → F    미표기
  ('片翼のディザイア'),                                --    F → F    MXM
  ('祭囃子'),                                          --    F → F    MXM
  ('色は匂えど散りぬるを'),                            --    F → F    XCD
  ('蟲の棲む処'),                                      --    F → F    MXM
  ('見世物ライフ'),                                    --   F- → F    MXM
  ('逆さま♥シンデレラパレード'),                       --    F → F    MXM
  ('音楽 -壊音楽 mix-'),                               --    F → F    미표기   【】
  ('Bioslaves'),                                       -- 超個人差 → 개인차  MXM
  ('The world of sound'),                              -- 超個人差 → 개인차  EXH
  ('大宇宙ステージ')                                   -- 超個人差 → 개인차  EXH
) AS v(title)
ON CONFLICT (machine_id, title) DO NOTHING;

-- ─── 4) 채보 681개 (Lv17) ─────────────────────────────────
INSERT INTO charts (song_id, mode, level)
SELECT s.id, v.mode, 17
FROM (VALUES
  ('2 MINUTES FIGHTERS', 'EXH'),                              -- S
  ('Aftermath', 'MXM'),                                       -- S
  ('Booths of Fighters', 'EXH'),                              -- S
  ('Candy Colored Hearts', 'EXH'),                            -- S
  ('Dyscontrolled Galaxy', 'EXH'),                            -- S
  ('Ghost Family Living In Graveyard', 'EXH'),                -- S
  ('Line 4 Ruin -kohumix-', 'MXM'),                           -- S
  ('Nofram', NULL::text),                                     -- S
  ('Sakura Mirage', NULL::text),                              -- S
  ('ULTRA B+K', 'MXM'),                                       -- S
  ('freaky freak', 'GRV'),                                    -- S
  ('ほおずき程度には赤い頭髪', NULL::text),                   -- S
  ('ケロ⑨destiny', 'HVN'),                                    -- S
  ('ネメシス SDVX Edit', NULL::text),                         -- S
  ('パ→ピ→プ→Yeah', NULL::text),                              -- S
  ('量子の海のリントヴルム', NULL::text),                     -- S
  ('2094', 'MXM'),                                            -- A+
  ('A Lasting Promise', 'EXH'),                               -- A+
  ('AYAKASHI', NULL::text),                                   -- A+
  ('Aliquam', NULL::text),                                    -- A+
  ('All Clear!!', 'MXM'),                                     -- A+
  ('Aragami', 'MXM'),                                         -- A+
  ('BAYONEX', 'EXH'),                                         -- A+
  ('BEAT-NEW-WORLD', NULL::text),                             -- A+
  ('BLAZE∞BREEZE', 'MXM'),                                    -- A+
  ('CODE -CRiMSON-', 'EXH'),                                  -- A+
  ('Chant du Cygne', 'EXH'),                                  -- A+
  ('Chewingood!!!', 'MXM'),                                   -- A+
  ('Cy-Bird', 'MXM'),                                         -- A+
  ('Destroy', 'GRV'),                                         -- A+
  ('Devastated Territory', 'VVD'),                            -- A+
  ('Dynasty', 'INF'),                                         -- A+
  ('ENDYMION', 'EXH'),                                        -- A+
  ('Emperors divide', NULL::text),                            -- A+
  ('Enigma', NULL::text),                                     -- A+
  ('Enigma II', 'MXM'),                                       -- A+
  ('FLYING OUT TO THE SKY', NULL::text),                      -- A+
  ('Garakuta Doll Play', 'EXH'),                              -- A+
  ('Gott', 'INF'),                                            -- A+
  ('Grand Chariot', 'GRV'),                                   -- A+
  ('HE4VEN ～天国へようこそ～', 'EXH'),                       -- A+
  ('Harpuia', 'EXH'),                                         -- A+
  ('Hexennacht', 'VVD'),                                      -- A+
  ('Life is beautiful', 'MXM'),                               -- A+
  ('M-O-R-F-I-N-E', 'MXM'),                                   -- A+
  ('NEON WORLD', NULL::text),                                 -- A+
  ('Non RolicK!!大冒険', 'MXM'),                              -- A+
  ('Poison AND÷OR Affection', 'MXM'),                         -- A+
  ('Pure Evil -Aya2g Drm`n Tech Rmx-', NULL::text),           -- A+
  ('Pure Evil(Kobaryo FTN-Remix)', NULL::text),               -- A+
  ('Royal Judgement', 'GRV'),                                 -- A+
  ('Shanghai Wu Long ～上海舞龍～', NULL::text),              -- A+
  ('StrayedCatz', 'GRV'),                                     -- A+
  ('Sulk', 'MXM'),                                            -- A+
  ('TENKAICHI ULTIMATE MEDLEY', 'EXH'),                       -- A+
  ('The End of War', NULL::text),                             -- A+
  ('Witch in Sweetsland', NULL::text),                        -- A+
  ('continew', NULL::text),                                   -- A+
  ('iLLness LiLin', 'EXH'),                                   -- A+
  ('rhythmology study', 'MXM'),                               -- A+
  ('vivid landscape', 'MXM'),                                 -- A+
  ('Μοῦσα', 'MXM'),                                           -- A+
  ('それは花火のような恋', 'MXM'),                            -- A+
  ('ウエンレラの氷華', 'GRV'),                                -- A+
  ('エンゲージ〆ント', 'MXM'),                                -- A+
  ('ナイト・オブ・ナイツ', 'INF'),                            -- A+
  ('少年は空を辿るProg Piano Remix', 'GRV'),                  -- A+
  ('放課後ストライド', 'HVN'),                                -- A+
  ('超越してしまった彼女と其を生み落した理由', 'EXH'),        -- A+
  ('雪月花 -さわわRemix-', NULL::text),                       -- A+
  ('香港功夫大旋風', 'GRV'),                                  -- A+
  ('777', 'EXH'),                                             -- A
  ('ABSOLUTE(ismk passionate mix)', 'MXM'),                   -- A
  ('Absolute Domination', 'EXH'),                             -- A
  ('AμreoLe ~for Triumph~', 'EXH'),                           -- A
  ('BabeL ～Next Story～', NULL::text),                       -- A
  ('Believe (y)our Wings{GRA5P WAVES}', 'MXM'),               -- A
  ('Believe (y)our Wings{V:VID RAYS}', 'MXM'),                -- A
  ('Bule Forest (Prog Key Remix)', 'MXM'),                    -- A
  ('CRITICAL LINE', NULL::text),                              -- A
  ('CUTE-Reflection', 'MXM'),                                 -- A
  ('Calamity Tempest', 'EXH'),                                -- A
  ('Chocolate Parade', 'MXM'),                                -- A
  ('Chocolate Planet', 'MXM'),                                -- A
  ('Circulator', 'MXM'),                                      -- A
  ('Cross Fire', 'EXH'),                                      -- A
  ('DIABLOSIS::Nāga', 'EXH'),                                 -- A
  ('Daisycutter', 'EXH'),                                     -- A
  ('Destruction & Qreation', 'MXM'),                          -- A
  ('Double Universe', 'GRV'),                                 -- A
  ('Dualive', NULL::text),                                    -- A
  ('Everlasting Message', 'EXH'),                             -- A
  ('Failnaught', 'EXH'),                                      -- A
  ('Fiat Lux', 'EXH'),                                        -- A
  ('GERBERA -For Finalists-', 'EXH'),                         -- A
  ('Got more raves？', 'EXH'),                                -- A
  ('HYENA', 'EXH'),                                           -- A
  ('Halcyon', NULL::text),                                    -- A
  ('Help me ERINNNNNN!! -Cranky remix-', NULL::text),         -- A
  ('Historia of Velnoti', 'VVD'),                             -- A
  ('Hoshizora Illumination', 'HVN'),                          -- A
  ('IX', 'EXH'),                                              -- A
  ('Innocent Floor', NULL::text),                             -- A
  ('Innocent tempest', 'EXH'),                                -- A
  ('JOMANDA', NULL::text),                                    -- A
  ('Jetcoaster Windy', 'MXM'),                                -- A
  ('Lancelot ～Flame of the Rebellion～', 'EXH'),             -- A
  ('Last Concerto', 'EXH'),                                   -- A
  ('Lost Wing at.0', 'MXM'),                                  -- A
  ('Mayohiga Spurt', NULL::text),                             -- A
  ('Metamorphobia', NULL::text),                              -- A
  ('Milk', 'MXM'),                                            -- A
  ('Musha Vibration', 'MXM'),                                 -- A
  ('NEON LOVE♥POTION!!!', 'MXM'),                             -- A
  ('Our Faith (Faithful MTL Remix)', NULL::text),             -- A
  ('Paradission', NULL::text),                                -- A
  ('Princess Lily', 'MXM'),                                   -- A
  ('Quietus Ray', 'EXH'),                                     -- A
  ('Rebuilding of Paradise Lost', 'MXM'),                     -- A
  ('Royal Action', 'MXM'),                                    -- A
  ('Sakura Mirage -Drum''n World-', 'MXM'),                   -- A
  ('Sharkbait', 'MXM'),                                       -- A
  ('Stleq', NULL::text),                                      -- A
  ('Sunflower Vibes', 'MXM'),                                 -- A
  ('TWO-TORIAL', 'EXH'),                                      -- A
  ('The star in eclipse', 'EXH'),                             -- A
  ('Time to Air -Fly High Remix-', NULL::text),               -- A
  ('Verse IV', 'EXH'),                                        -- A
  ('Virtual Bit', NULL::text),                                -- A
  ('Voynich:Manuscript', NULL::text),                         -- A
  ('XROSS INFECTION', 'EXH'),                                 -- A
  ('clear:wings', 'MXM'),                                     -- A
  ('infinite:youniverse', 'MXM'),                             -- A
  ('planetarium', 'MXM'),                                     -- A
  ('{albus}', NULL::text),                                    -- A
  ('ΕΛΠΙΣ', NULL::text),                                      -- A
  ('ΩBIRD', 'MXM'),                                           -- A
  ('ЯeviveR', 'EXH'),                                         -- A
  ('そして紫の幻想曲は全てを受け入れる', NULL::text),         -- A
  ('アキネイション', NULL::text),                             -- A
  ('オルターエゴ', 'MXM'),                                    -- A
  ('キモチコネクト', 'GRV'),                                  -- A
  ('ゲキツイムラサ', NULL::text),                             -- A
  ('ゴーストルール', 'MXM'),                                  -- A
  ('サヨナラ・ヘヴン(かめりあ`sRMX)', 'HVN'),                 -- A
  ('チルノとまりおのパーフェクト算数教室', NULL::text),       -- A
  ('ハレ晴レユカイ', 'MXM'),                                  -- A
  ('ホーンテッド★メイドランチ', NULL::text),                  -- A
  ('ラキラキ', 'MXM'),                                        -- A
  ('人形裁判 -THIRD IMPACT -', NULL::text),                   -- A
  ('伊邪那美白山姫大神', 'MXM'),                              -- A
  ('熱情のザパデアート', 'MXM'),                              -- A
  ('物凄いｽﾍﾟｰｽｼｬﾄﾙでこいしが物凄いうた', 'MXM'),             -- A
  ('紅の剣舞', NULL::text),                                   -- A
  ('色を喪った街', 'EXH'),                                    -- A
  ('超超光速スピードスターかなで', 'EXH'),                    -- A
  ('闇夜に舞うは紅の華', 'MXM'),                              -- A
  ('雪女', 'GRV'),                                            -- A
  ('零次元エクスプレス', 'MXM'),                              -- A
  ('飄える翼追い掛けて', 'EXH'),                              -- A
  ('- Jupiter -', 'MXM'),                                     -- B
  ('2 Beasts Unchained', 'EXH'),                              -- B
  ('3y3s (JMBS FUNKOT RMX)', 'MXM'),                          -- B
  ('50th Memorial Songs -The BEMANI History-', 'VVD'),        -- B
  ('AA BlackY mix', 'INF'),                                   -- B
  ('Afterimage d`automne', 'MXM'),                            -- B
  ('Another Chapter', 'MXM'),                                 -- B
  ('BLACK JACKAL', 'MXM'),                                    -- B
  ('Berry Go!!', 'MXM'),                                      -- B
  ('CUTIE☆EX-DREAM', NULL::text),                             -- B
  ('Chocolate Planet（いるちょこRemix）', 'MXM'),             -- B
  ('Continuous Moment', 'MXM'),                               -- B
  ('DEEP PSYCHEDELIC STRIKER', 'MXM'),                        -- B
  ('DO-IT-AMA-SITE!!!', 'VVD'),                               -- B
  ('Dark Matter', 'MXM'),                                     -- B
  ('Decretum', NULL::text),                                   -- B
  ('Dharma', 'MXM'),                                          -- B
  ('Distorted Floor', 'INF'),                                 -- B
  ('EGG', 'GRV'),                                             -- B
  ('FUJIMORI -祭- FESTIVAL', 'MXM'),                          -- B
  ('False Cross', NULL::text),                                -- B
  ('Fire Strike', 'HVN'),                                     -- B
  ('Fun walk!!', 'MXM'),                                      -- B
  ('Fáfnir', 'MXM'),                                          -- B
  ('Ganymede kamome mix', 'EXH'),                             -- B
  ('Get back here', 'GRV'),                                   -- B
  ('Gimme dreamin''', 'VVD'),                                 -- B
  ('Glory of Fighters', 'EXH'),                               -- B
  ('Hellfire', 'EXH'),                                        -- B
  ('Impress(siqlo`s Hi-Tech Veats)', 'MXM'),                  -- B
  ('Inixia', 'GRV'),                                          -- B
  ('Into The Madness', 'MXM'),                                -- B
  ('Iridescent Crouds', 'MXM'),                               -- B
  ('JUGGLE', 'MXM'),                                          -- B
  ('Jailbreaker', 'MXM'),                                     -- B
  ('Justitia Gladius', 'MXM'),                                -- B
  ('KAC 2012 ULTIMATE MEDLEY', 'EXH'),                        -- B
  ('Knights Assault', 'MXM'),                                 -- B
  ('Libera me', 'MXM'),                                       -- B
  ('LubedeR', 'EXH'),                                         -- B
  ('MAXIVCORD', 'MXM'),                                       -- B
  ('MILITARY R04D', 'EXH'),                                   -- B
  ('Max Burning!!', 'EXH'),                                   -- B
  ('Me:Tear', 'MXM'),                                         -- B
  ('PIZZATIME', 'MXM'),                                       -- B
  ('Pieces of a Dream', NULL::text),                          -- B
  ('Pure Evil', NULL::text),                                  -- B
  ('Quark', 'MXM'),                                           -- B
  ('Rapsodia d''amore', 'EXH'),                               -- B
  ('Rebellio', 'EXH'),                                        -- B
  ('Rejoin', 'MXM'),                                          -- B
  ('Revolution', 'MXM'),                                      -- B
  ('Rhapsody ⚙︎f Triumph', 'EXH'),                            -- B
  ('Sailing Force', 'EXH'),                                   -- B
  ('Six String Proof', 'MXM'),                                -- B
  ('Sparkle Smilin`', 'MXM'),                                 -- B
  ('TIEFSEE', NULL::text),                                    -- B
  ('Tribal Trial', 'MXM'),                                    -- B
  ('Twilight∞nighT', 'MXM'),                                  -- B
  ('U.N.オーエンは彼女なのか？haru_naba Remix', 'EXH'),       -- B
  ('UROBØROS', NULL::text),                                   -- B
  ('Vampire''s Territory', NULL::text),                       -- B
  ('WONDER_WOBBLER', 'MXM'),                                  -- B
  ('Whip☆Drip', 'MXM'),                                       -- B
  ('Xroniàl Xéro', 'EXH'),                                    -- B
  ('conflict', NULL::text),                                   -- B
  ('eXtridia', 'MXM'),                                        -- B
  ('gigadelic -stance xxxx-', NULL::text),                    -- B
  ('gigadelic(m3rkAb4# R3m!x)', NULL::text),                  -- B
  ('onslaught -Retaliation of Bahamūt-', 'EXH'),              -- B
  ('smooooch・∀・ KN mix', 'XCD'),                            -- B
  ('snow storm -euphoria-', 'EXH'),                           -- B
  ('take a step forward', 'HVN'),                             -- B
  ('ΛΛemoria', 'EXH'),                                        -- B
  ('†:OLPHEUX:†', 'EXH'),                                     -- B
  ('うさぬこぬんぬんファンタジー！', 'MXM'),                  -- B
  ('おーまい！らぶりー！すうぃーてぃー！だーりん！', 'MXM'),  -- B
  ('ふ・れ・ん・ど・し・た・い(WEREHEREMIX)', 'MXM'),         -- B
  ('ゆりゆらららゆるゆり大事件 (yuzenリミ)', 'MXM'),          -- B
  ('イグジスタンス', NULL::text),                             -- B
  ('インドア系ならトラックメイカー', 'MXM'),                  -- B
  ('ウバワレ', 'GRV'),                                        -- B
  ('キャプテン・マリンのケツアンカー', 'MXM'),                -- B
  ('キラメキ居残り大戦争', 'MXM'),                            -- B
  ('キリカ', 'MXM'),                                          -- B
  ('ケムマキunderground', 'MXM'),                             -- B
  ('コメット⇒スケイター', 'MXM'),                             -- B
  ('シル・ヴ・プレジデント', 'MXM'),                          -- B
  ('セイレーン ～悲壮の竪琴～', 'EXH'),                       -- B
  ('セツナトリップ', 'HVN'),                                  -- B
  ('バンブーソード・ガール', 'EXH'),                          -- B
  ('フォニイ', 'MXM'),                                        -- B
  ('プラネタジャーニー', 'MXM'),                              -- B
  ('ムーニャポヨポヨスッポコニャーゴ', 'EXH'),                -- B
  ('ラブキラ☆スプラッシュ', 'MXM'),                           -- B
  ('ロプノールの商隊', 'MXM'),                                -- B
  ('ロンロンへ ライライライ！', 'GRV'),                       -- B
  ('信仰は儚き人間の為に～Arr.Demetori', NULL::text),         -- B
  ('卑弥呼', 'EXH'),                                          -- B
  ('君は Fantasista', 'MXM'),                                 -- B
  ('夢の終わり、世界のはじまり。', 'MXM'),                    -- B
  ('少女綺想曲-G.X.N.Remix-', 'MXM'),                         -- B
  ('常夏！！クリスタライズ・シャーベット', NULL::text),       -- B
  ('悪戯センセーション', 'MXM'),                              -- B
  ('感情の摩天楼～Arr.Demetori', NULL::text),                 -- B
  ('機械仕掛けの魔法使い', 'MXM'),                            -- B
  ('焔 -MAGMA-', 'MXM'),                                      -- B
  ('物凄い狂っとるフランちゃんが物凄いうた', NULL::text),     -- B
  ('獅子奮迅', 'MXM'),                                        -- B
  ('紫焔双穿', 'EXH'),                                        -- B
  ('羅生門', 'MXM'),                                          -- B
  ('赫焉', 'EXH'),                                            -- B
  ('遷', 'VVD'),                                              -- B
  ('金縛りの逢を', 'EXH'),                                    -- B
  ('響く静寂', 'MXM'),                                        -- B
  ('鬼天', NULL::text),                                       -- B
  ('黒髪乱れし修羅となりて ~凛 edition~', NULL::text),        -- B
  ('０=Xerostrumental=', NULL::text),                         -- B
  ('.59 -BOOTH REMIX-', 'HVN'),                               -- C
  ('120秒のエンドロール', 'MXM'),                             -- C
  ('405nm(Shu※mix)', 'MXM'),                                  -- C
  ('ABSOLUTE(EUROBEAT REMIX)', 'MXM'),                        -- C
  ('Appliqué', 'GRV'),                                        -- C
  ('Avalanx', 'EXH'),                                         -- C
  ('Awakening', 'EXH'),                                       -- C
  ('BELOBOG', 'EXH'),                                         -- C
  ('BLIZZARD BEAT', 'MXM'),                                   -- C
  ('Blue Stream', 'MXM'),                                     -- C
  ('CENSORED!!', NULL::text),                                 -- C
  ('CLOUDS FLYER', 'MXM'),                                    -- C
  ('CUDDLIE CUDDLIE', 'MXM'),                                 -- C
  ('Carry Me Away', 'MXM'),                                   -- C
  ('Chaotic Romance', 'MXM'),                                 -- C
  ('Clash of swords', NULL::text),                            -- C
  ('DEADLOCK XXX', NULL::text),                               -- C
  ('DESIRE', 'MXM'),                                          -- C
  ('Din Don Dan', 'XCD'),                                     -- C
  ('Discloze', NULL::text),                                   -- C
  ('EDEN of TRUTH', 'MXM'),                                   -- C
  ('Elemental Creation', 'EXH'),                              -- C
  ('Empty Backdoor', 'MXM'),                                  -- C
  ('Enter The Fire', 'MXM'),                                  -- C
  ('FIRE FIRE -DARK BLAZE REMIX-', NULL::text),               -- C
  ('FIRE FIRE(Kazmasa Remix)', NULL::text),                   -- C
  ('FREEDOM DiVE', 'EXH'),                                    -- C
  ('Fly Like You', 'EXH'),                                    -- C
  ('Follow up', NULL::text),                                  -- C
  ('Foolish Again', 'MXM'),                                   -- C
  ('For.*tune', 'MXM'),                                       -- C
  ('GODHEART', 'EXH'),                                        -- C
  ('Grip & Break down !!', 'XCD'),                            -- C
  ('HEAVENLY SMILE', 'MXM'),                                  -- C
  ('Heavenly Adventure', 'MXM'),                              -- C
  ('Hello World', 'XCD'),                                     -- C
  ('Help me,ERINNNNNN!! #幻想郷ホロイズムver', 'MXM'),        -- C
  ('Holy Legacy', 'VVD'),                                     -- C
  ('INFINITY OVERDRIVE', 'GRV'),                              -- C
  ('Idola', 'EXH'),                                           -- C
  ('If', 'MXM'),                                              -- C
  ('Inscape', 'MXM'),                                         -- C
  ('KiLLeR MeRMaiD', NULL::text),                             -- C
  ('LIKE A VAMPIRE', 'MXM'),                                  -- C
  ('LaμreLs ~the Angelus~', 'EXH'),                           -- C
  ('LittleGameStar', 'GRV'),                                  -- C
  ('MARENOL', 'MXM'),                                         -- C
  ('MICHIZURE', 'MXM'),                                       -- C
  ('MOVE! (We Keep It Movin'')', 'MXM'),                      -- C
  ('Melty Sweets', 'MXM'),                                    -- C
  ('Mischievous theater', 'MXM'),                             -- C
  ('Never Fails', NULL::text),                                -- C
  ('No way', 'MXM'),                                          -- C
  ('One In A Billion(Hedonist Rimix)', 'MXM'),                -- C
  ('Opium and Purple haze', 'EXH'),                           -- C
  ('PIERROT KNIfE', 'MXM'),                                   -- C
  ('PRIDE of the FIREBALL', 'MXM'),                           -- C
  ('Parousia', NULL::text),                                   -- C
  ('Pet Peeve', NULL::text),                                  -- C
  ('Poppin’Cats!!', 'MXM'),                                   -- C
  ('Record one''s Dream', 'MXM'),                             -- C
  ('Redshift 2nd Ignition', 'EXH'),                           -- C
  ('Reverenced Flower', 'EXH'),                               -- C
  ('S1CK_F41RY', NULL::text),                                 -- C
  ('SHION -sublimation mix-', 'MXM'),                         -- C
  ('SPACE VILLAGE', 'MXM'),                                   -- C
  ('Sakura Fubuki', 'MXM'),                                   -- C
  ('Screaming!!', 'VVD'),                                     -- C
  ('Space Diver Tama', 'HVN'),                                -- C
  ('Sparkling Laser Beam', 'VVD'),                            -- C
  ('Spider Dance / スパイダーダンス', 'MXM'),                 -- C
  ('TOXIC VIBRATION', NULL::text),                            -- C
  ('Tic Exe', 'MXM'),                                         -- C
  ('VIVID DEBUT!', 'MXM'),                                    -- C
  ('VIVIDWAVERS', 'MXM'),                                     -- C
  ('VOLAQUAS', 'EXH'),                                        -- C
  ('Vigor', 'MXM'),                                           -- C
  ('WICKeD CRΦSS', 'MXM'),                                    -- C
  ('WILD FIRE', 'MXM'),                                       -- C
  ('Wheel', 'HVN'),                                           -- C
  ('Xb10r', 'EXH'),                                           -- C
  ('Zelophilia', 'MXM'),                                      -- C
  ('choux à la crème', 'GRV'),                                -- C
  ('cobalt', 'MXM'),                                          -- C
  ('fantastic dreamer', 'MXM'),                               -- C
  ('floorkiller', 'VVD'),                                     -- C
  ('le coeur patissiere', 'MXM'),                             -- C
  ('perditus†paradisus', 'EXH'),                              -- C
  ('ultra turbo', 'MXM'),                                     -- C
  ('who I am', 'MXM'),                                        -- C
  ('αzalea', 'EXH'),                                          -- C
  ('Яegret of MemoRy', 'MXM'),                                -- C
  ('いでぃおで結構!', 'MXM'),                                 -- C
  ('おどりましょうよ！ドラゴンさん', 'MXM'),                  -- C
  ('じゅーじゅー♥焼肉の火からフェニックス', NULL::text),      -- C
  ('すろぉもぉしょん', 'MXM'),                                -- C
  ('ぼくらの16bit戦争', 'MXM'),                               -- C
  ('もってけ！セーラーふく', 'MXM'),                          -- C
  ('ようこそジャパリパークへ', 'MXM'),                        -- C
  ('アルファ・スカイ', 'MXM'),                                -- C
  ('オリガミカル・スウィートラヴ', 'MXM'),                    -- C
  ('クレイジークレイジーダンサーズ', 'MXM'),                  -- C
  ('シープドリーミン', 'MXM'),                                -- C
  ('ステラレギア', 'MXM'),                                    -- C
  ('セイシュンライナー', 'MXM'),                              -- C
  ('チェイスチェイスジョーカーズのうた', 'MXM'),              -- C
  ('デンデラパーティーナイト', 'MXM'),                        -- C
  ('トランスダンスアナーキー', 'MXM'),                        -- C
  ('ドゥサンコオデッセイ!!', 'EXH'),                          -- C
  ('ピアノ独奏無言歌 "灰燼"', 'EXH'),                         -- C
  ('プレインエイジア(MRM REMIX)', 'MXM'),                     -- C
  ('ベビーステップ', 'MXM'),                                  -- C
  ('マネマネサイコトロピック', 'XCD'),                        -- C
  ('メルヘン風紀委員会', 'MXM'),                              -- C
  ('人生リセットボタン', 'VVD'),                              -- C
  ('十の試煉', 'EXH'),                                        -- C
  ('十面相', 'VVD'),                                          -- C
  ('夏色DIARY -SD''VmiX-', 'EXH'),                            -- C
  ('幻想系世界修復少女', 'HVN'),                              -- C
  ('打打打打打打打打打打', 'INF'),                            -- C
  ('柳の下のデュラハン', NULL::text),                         -- C
  ('泥の分際で私だけの大切を奪おうなんて', 'MXM'),            -- C
  ('濁色踊るオートマタ', 'MXM'),                              -- C
  ('無意識レクイエム', 'MXM'),                                -- C
  ('煙', 'MXM'),                                              -- C
  ('真夏の海の修道女', 'MXM'),                                -- C
  ('真夏の蜜と唇 fm. 希望の星は青霄に昇る', 'MXM'),           -- C
  ('穢れなきユーフォリア', 'MXM'),                            -- C
  ('終点の先が在るとするならば', 'MXM'),                      -- C
  ('蓬莱フェスティボー', 'MXM'),                              -- C
  ('逆月', 'EXH'),                                            -- C
  ('過食性:アイドル症候群', 'INF'),                           -- C
  ('銃弾は解を撃ち抜いて', 'MXM'),                            -- C
  ('雲の彼方', 'EXH'),                                        -- C
  ('革命パッショネイト', 'MXM'),                              -- C
  ('［E］', 'MXM'),                                           -- C
  ('#FairyJoke #SDVX_Edit', NULL::text),                      -- D
  ('444', 'MXM'),                                             -- D
  ('ALBIDA Powerless Mix', 'INF'),                            -- D
  ('ANTI THE∞HOLiC', NULL::text),                             -- D
  ('AXION', 'MXM'),                                           -- D
  ('All We Need is HAPPY END!!!', 'EXH'),                     -- D
  ('B.B.K.K.B.K.K.', 'EXH'),                                  -- D
  ('BREAKNECK NY☆N! NY★N!', 'MXM'),                           -- D
  ('Black or Red?', 'MXM'),                                   -- D
  ('Bye or not', 'MXM'),                                      -- D
  ('Colorless feat.ももかみ', 'MXM'),                         -- D
  ('Deadly Dolly Dance', NULL::text),                         -- D
  ('Death by Glamour/華麗なる死闘', 'MXM'),                   -- D
  ('Dreaming feat. nomico', 'MXM'),                           -- D
  ('Empathetic', 'MXM'),                                      -- D
  ('EncorE & cALL', 'EXH'),                                   -- D
  ('Erlung', 'GRV'),                                          -- D
  ('F.K.S.', NULL::text),                                     -- D
  ('FLOOR INFECTION Medley', 'EXH'),                          -- D
  ('Far Away', 'MXM'),                                        -- D
  ('Finale', 'MXM'),                                          -- D
  ('Flip Flap', 'MXM'),                                       -- D
  ('Fαtα∠ Ent∠mEnt', 'EXH'),                                  -- D
  ('Game Over', 'MXM'),                                       -- D
  ('HAELEQUIN', NULL::text),                                  -- D
  ('Harmonia', 'MXM'),                                        -- D
  ('I Left for my Right', 'MXM'),                             -- D
  ('INDEPENDENT SKY', 'GRV'),                                 -- D
  ('JULIAN', 'MXM'),                                          -- D
  ('Joyeuse', 'EXH'),                                         -- D
  ('Last Resort', 'EXH'),                                     -- D
  ('Lisa-RICCIA', 'EXH'),                                     -- D
  ('Liévre -blanche-', 'MXM'),                                -- D
  ('Lord=Crossight', 'EXH'),                                  -- D
  ('Love Love Scarlet', 'MXM'),                               -- D
  ('OUTERHEΛVEN', 'EXH'),                                     -- D
  ('POSSESSION(Gowrock Remix)', 'MXM'),                       -- D
  ('PRESERVED VAMPIRE', 'MXM'),                               -- D
  ('Pixelated Platform（Superhoney）', 'MXM'),                -- D
  ('REGALIA', NULL::text),                                    -- D
  ('Re:Rose Gun Shoooot!', 'MXM'),                            -- D
  ('Realize', 'MXM'),                                         -- D
  ('Resonant Gear', 'MXM'),                                   -- D
  ('SOUL EXPLOSION', 'XCD'),                                  -- D
  ('Secret Traveler', 'MXM'),                                 -- D
  ('Sparky spark', 'MXM'),                                    -- D
  ('Staring at star', 'EXH'),                                 -- D
  ('Struggle for Revival', 'MXM'),                            -- D
  ('THE凸GENERATOR', 'EXH'),                                  -- D
  ('THUNDERCRACK', NULL::text),                               -- D
  ('TYCOON', 'INF'),                                          -- D
  ('Technical Master', 'MXM'),                                -- D
  ('The Clown of 24stairs', 'EXH'),                           -- D
  ('The First Step', 'MXM'),                                  -- D
  ('The Sampling Paradise(P*Light Remix)', 'EXH'),            -- D
  ('True Blue', NULL::text),                                  -- D
  ('VOLTEXES IV', 'MXM'),                                     -- D
  ('Verstärkt Killer', 'MXM'),                                -- D
  ('WWW', 'MXM'),                                             -- D
  ('Wish upon Twin Stars', 'EXH'),                            -- D
  ('Xibercannon', 'MXM'),                                     -- D
  ('Xéroa', 'EXH'),                                           -- D
  ('ZEUS', 'EXH'),                                            -- D
  ('Zero-Day Exploit', NULL::text),                           -- D
  ('[ ]DENTITY', 'EXH'),                                      -- D
  ('empty', 'MXM'),                                           -- D
  ('good high school', 'INF'),                                -- D
  ('voltississimo', 'EXH'),                                   -- D
  ('éclair au chocolat', 'GRV'),                              -- D
  ('θコトノハθカプセルθ', 'EXH'),                             -- D
  ('ぼくらしかしらない', NULL::text),                         -- D
  ('みたらしプラトニック', 'MXM'),                            -- D
  ('イカサマライフゲイム', 'HVN'),                            -- D
  ('カシオペアノヒカリ', 'MXM'),                              -- D
  ('カミサマネジマキ', 'GRV'),                                -- D
  ('グッバイ宣言', 'MXM'),                                    -- D
  ('サクラノソバニ', 'MXM'),                                  -- D
  ('ステラ・イミグレーション', 'MXM'),                        -- D
  ('ストリーミングハート', 'MXM'),                            -- D
  ('スーパー戦湯ババンバーン', 'MXM'),                        -- D
  ('チクサクコールが懐かしい', 'MXM'),                        -- D
  ('ディスコルディア', 'EXH'),                                -- D
  ('デュアルメモリ', 'MXM'),                                  -- D
  ('トウキョーサマーナイト（華金Remix）', 'MXM'),             -- D
  ('ネトゲ廃人シュプレヒコール', 'XCD'),                      -- D
  ('ヒトガタ', 'MXM'),                                        -- D
  ('ヒトリゴト', 'MXM'),                                      -- D
  ('ヒバナ-Reloaded-', 'MXM'),                                -- D
  ('ピアノ協奏曲第１番”蠍火”', 'EXH'),                        -- D
  ('フェアリーテイル・ラヴァーズ', 'MXM'),                    -- D
  ('ボーイミーツ・ブルー', 'MXM'),                            -- D
  ('メモリーズ', 'MXM'),                                      -- D
  ('僕らの時間', 'MXM'),                                      -- D
  ('全力ハッピーライフ', 'MXM'),                              -- D
  ('勇者の卒業式', 'MXM'),                                    -- D
  ('叛逆のディスパレート', 'MXM'),                            -- D
  ('地球最後の告白を', 'XCD'),                                -- D
  ('夢見草奇譚', 'VVD'),                                      -- D
  ('孤月群雲に沈む', 'VVD'),                                  -- D
  ('幽玄の桜', 'MXM'),                                        -- D
  ('御伽噺に幕切れを', 'MXM'),                                -- D
  ('恋愛＝精度×認識力', 'EXH'),                               -- D
  ('恋獄対刃', 'MXM'),                                        -- D
  ('患部で止まってすぐ溶ける', 'INF'),                        -- D
  ('斑咲花', 'MXM'),                                          -- D
  ('星座が恋した瞬間を。', 'MXM'),                            -- D
  ('月下の舞兎祭', 'MXM'),                                    -- D
  ('木洩れ日に咲く', 'MXM'),                                  -- D
  ('朱と碧のランページ', NULL::text),                         -- D
  ('漆黒のスペシャルプリンセスサンデー', NULL::text),         -- D
  ('無気力クーデター', NULL::text),                           -- D
  ('神にした彼女が示す世界線', 'MXM'),                        -- D
  ('竹', 'EXH'),                                              -- D
  ('竹取飛翔', 'HVN'),                                        -- D
  ('赫焉のヴァルキュリア', 'EXH'),                            -- D
  ('運命超過乃巡合', 'MXM'),                                  -- D
  ('雲海', 'MXM'),                                            -- D
  ('音楽 -resolve-', 'EXH'),                                  -- D
  ('黎明スケッチブック', 'MXM'),                              -- D
  ('9TH5IN', 'EXH'),                                          -- E
  ('ABSOLUTE (saminun mix)', 'MXM'),                          -- E
  ('ANGER of the GOD', 'EXH'),                                -- E
  ('Adrenaline Rush', 'MXM'),                                 -- E
  ('Aerial Skydive', 'MXM'),                                  -- E
  ('Apex of the World', NULL::text),                          -- E
  ('Arcade Prison', 'MXM'),                                   -- E
  ('Backflow', NULL::text),                                   -- E
  ('Borealis', NULL::text),                                   -- E
  ('CARNIVOROUS', 'MXM'),                                     -- E
  ('CLAMARE', 'EXH'),                                         -- E
  ('Chakra', 'MXM'),                                          -- E
  ('Chronomia', 'EXH'),                                       -- E
  ('Coldlapse', 'MXM'),                                       -- E
  ('DEUX EX MĀXHINĀ', 'EXH'),                                 -- E
  ('Deadly force', 'EXH'),                                    -- E
  ('Decoy', 'MXM'),                                           -- E
  ('EBONY & IVORY', NULL::text),                              -- E
  ('EGOISM -Rebuild-', 'MXM'),                                -- E
  ('Enjoy This Time', 'MXM'),                                 -- E
  ('Four Leaves', 'MXM'),                                     -- E
  ('HALO', 'EXH'),                                            -- E
  ('Junk Mania', 'MXM'),                                      -- E
  ('Little princess has no identity.', NULL::text),           -- E
  ('Lost Emotion feat.nomico', 'MXM'),                        -- E
  ('Lucky*Clover', NULL::text),                               -- E
  ('Made In Love', 'MXM'),                                    -- E
  ('NIN-NIN-NIN!!', 'MXM'),                                   -- E
  ('Pixelated Platform', 'MXM'),                              -- E
  ('Redo', 'MXM'),                                            -- E
  ('Rubeus', NULL::text),                                     -- E
  ('STYX HELIX(Digi-Rock Remix)', 'MXM'),                     -- E
  ('SUPER BUBBLE JOURNEY', 'MXM'),                            -- E
  ('Sacrifce Escape: 不条理の模倣による感情と代償', 'MXM'),   -- E
  ('Second Game', 'MXM'),                                     -- E
  ('Sephirot', 'GRV'),                                        -- E
  ('Smoked Turkey Rag', 'MXM'),                               -- E
  ('Spear of Justice/正義の槍', 'MXM'),                       -- E
  ('Splash Underwater', 'MXM'),                               -- E
  ('Synergy For Angels', 'MXM'),                              -- E
  ('The setting sun', NULL::text),                            -- E
  ('Triple Counter', 'EXH'),                                  -- E
  ('V.I.P.', 'EXH'),                                          -- E
  ('Voltage Higher', 'MXM'),                                  -- E
  ('VΛZiLiSQ', 'EXH'),                                        -- E
  ('Xymatic Scope', 'MXM'),                                   -- E
  ('ZEPHYRANTHES', 'GRV'),                                    -- E
  ('akasha-assembly', NULL::text),                            -- E
  ('bistro twins☆☆☆', 'MXM'),                                 -- E
  ('charm♡you', 'MXM'),                                       -- E
  ('cloche(といぼっくすうぃんぐ　りみっくす)', 'MXM'),        -- E
  ('cloud', 'HVN'),                                           -- E
  ('impress(bansou Remix)', 'MXM'),                           -- E
  ('invisible Bullets', 'MXM'),                               -- E
  ('odds and ends', 'GRV'),                                   -- E
  ('sink into the dream', 'MXM'),                             -- E
  ('toy boxer', 'MXM'),                                       -- E
  ('β', 'MXM'),                                               -- E
  ('あれこれそれどれ', NULL::text),                           -- E
  ('おにいちゃんハイテック', 'MXM'),                          -- E
  ('きらきらタイム☆', NULL::text),                            -- E
  ('ここからよろしく大作戦143', 'MXM'),                       -- E
  ('すべてが幻になった後で', 'EXH'),                          -- E
  ('ぶいちゅっばの歌', 'MXM'),                                -- E
  ('アワデコノヨヲ', 'MXM'),                                  -- E
  ('アンハッピーリフレイン', 'MXM'),                          -- E
  ('イゴモヨスのブヨブヨ・スケッチ', NULL::text),             -- E
  ('ガヴリールドロップキック', 'MXM'),                        -- E
  ('ハートシェイプ・スピカ', 'MXM'),                          -- E
  ('バイナリスター', 'VVD'),                                  -- E
  ('ヒミツダイヤル', 'VVD'),                                  -- E
  ('ブチ上げ候！現代忍者三姉妹', 'MXM'),                      -- E
  ('ボルテ体操第一', 'EXH'),                                  -- E
  ('メテオライツ・プレリュード', 'MXM'),                      -- E
  ('メンタンピンドラドラ', 'MXM'),                            -- E
  ('ロキ', 'MXM'),                                            -- E
  ('ヴァンパイア', 'MXM'),                                    -- E
  ('凛として咲く花の如く', 'MXM'),                            -- E
  ('分けるな危険！モモモモモモーイズム', 'MXM'),              -- E
  ('創世ノート', 'MXM'),                                      -- E
  ('天ノ弱', 'INF'),                                          -- E
  ('少女暴動', NULL::text),                                   -- E
  ('廃獄ドリームランド', 'MXM'),                              -- E
  ('御千手メディテーション', 'INF'),                          -- E
  ('悪性ロリィタマキャヴェリズム', NULL::text),               -- E
  ('断罪は遍く人間の元に', NULL::text),                       -- E
  ('暴走', NULL::text),                                       -- E
  ('水槽のクジラ', 'MXM'),                                    -- E
  ('炎夏の音', 'MXM'),                                        -- E
  ('神っぽいな', 'MXM'),                                      -- E
  ('轟け！恋のビーンボール！！', 'EXH'),                      -- E
  ('近未来百鬼夜行譚～死返之巻～', 'MXM'),                    -- E
  ('透明声彩', 'MXM'),                                        -- E
  ('鏡面の波(ramble mix)', 'MXM'),                            -- E
  ('門門しましょ', 'MXM'),                                    -- E
  ('零の位相', 'MXM'),                                        -- E
  ('驪駒早鬼は馬並み☆プロテイン', 'MXM'),                     -- E
  ('黎明の情', 'MXM'),                                        -- E
  ('ASGORE/アズゴア', 'MXM'),                                 -- F
  ('Altale', 'MXM'),                                          -- F
  ('Apocrypha', 'MXM'),                                       -- F
  ('Awakening Wings', 'MXM'),                                 -- F
  ('Blue Forest(NightBounce Remix)', 'MXM'),                  -- F
  ('Chrono Diver -PENDULUMs-', 'EXH'),                        -- F
  ('D1g1t1ze b0dy', 'MXM'),                                   -- F
  ('Drizzly Venom', 'MXM'),                                   -- F
  ('Fly far bounce', 'MXM'),                                  -- F
  ('Happy Sensation', NULL::text),                            -- F
  ('ILL-STARRED Diver', 'MXM'),                               -- F
  ('LUCKY CAT', 'MXM'),                                       -- F
  ('Last Battalion', 'GRV'),                                  -- F
  ('MA・TSU・RI', 'MXM'),                                     -- F
  ('Mist in Hell', NULL::text),                               -- F
  ('Oriens', 'MXM'),                                          -- F
  ('PLANISPHERE', 'MXM'),                                     -- F
  ('Paradisus-Paradoxum', 'MXM'),                             -- F
  ('Phlox', 'MXM'),                                           -- F
  ('QUAKE', 'MXM'),                                           -- F
  ('Re:call', 'MXM'),                                         -- F
  ('Sadistic Stabbing', 'MXM'),                               -- F
  ('Sleepless days', 'MXM'),                                  -- F
  ('Still Lonesome', 'MXM'),                                  -- F
  ('Trill auf G', 'EXH'),                                     -- F
  ('Twin Rocket', NULL::text),                                -- F
  ('cross the future', NULL::text),                           -- F
  ('scary night', 'MXM'),                                     -- F
  ('↑↑↓↓←→←→BA', 'MXM'),                                      -- F
  ('インビジブル', 'MXM'),                                    -- F
  ('オンディーヌの泪', 'MXM'),                                -- F
  ('スノウイコン', 'MXM'),                                    -- F
  ('ツキアカリ', 'MXM'),                                      -- F
  ('ハレ トキドキ メランコリック', 'MXM'),                    -- F
  ('ペタ靴と憂夜リムーバー', 'MXM'),                          -- F
  ('ポメグラネイト', 'GRV'),                                  -- F
  ('太陽曰く燃えよカオス', 'MXM'),                            -- F
  ('失敗作少女', 'MXM'),                                      -- F
  ('星の詩', 'MXM'),                                          -- F
  ('無双', NULL::text),                                       -- F
  ('片翼のディザイア', 'MXM'),                                -- F
  ('祭囃子', 'MXM'),                                          -- F
  ('色は匂えど散りぬるを', 'XCD'),                            -- F
  ('蟲の棲む処', 'MXM'),                                      -- F
  ('見世物ライフ', 'MXM'),                                    -- F
  ('逆さま♥シンデレラパレード', 'MXM'),                       -- F
  ('音楽 -壊音楽 mix-', NULL::text),                          -- F
  ('Bioslaves', 'MXM'),                                       -- 개인차
  ('The world of sound', 'EXH'),                              -- 개인차
  ('大宇宙ステージ', 'EXH')                                   -- 개인차
) AS v(title, mode)
JOIN songs s ON s.machine_id = 3 AND s.title = v.title
ON CONFLICT DO NOTHING;

-- ─── 5) 집계 캐시 초기화 ──────────────────────────────────
-- 투표가 없으므로 전부 tier_code = 'undecided' 가 됩니다. 이 줄이 없으면
-- tier_code 가 NULL 로 남는데, 화면은 NULL 도 '미정' 으로 읽으므로 결과는
-- 같습니다. 그래도 캐시 컬럼의 뜻을 맞춰 둡니다 (031 과 같은 마무리).
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 3 AND c.level = 17;
