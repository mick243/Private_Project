-- ============================================================
-- 021 · 리믹스 문서 본문(텍스트)에 적힌 리믹스 곡 추가
--
-- ─── 출처 ───────────────────────────────────────────────
-- 나무위키 (CC BY-NC-SA 2.0 KR) · robots.txt 가 허용하는 /w/ 문서만.
--   · 펌프 잇 업/리믹스 수록 목록   (본문 텍스트)
--   · 펌프 잇 업/삭제곡             (제외 목록)
--
-- ─── 019 와 무엇이 다른가 ────────────────────────────────
-- 019 는 리믹스 문서의 **표**(PHOENIX 시대, 곡명/영문명 컬럼)만 읽어 17곡을
-- 얻었습니다. 그런데 이 문서의 본체는 1st Dance Floor ~ XX 까지의 **본문 텍스트**이고,
-- 거기에 리믹스가 126곡 더 적혀 있습니다. 이 파일이 그 126곡을 처리합니다.
--
--   본문 리믹스                                          126곡
--   삭제곡과 중복돼 제외                                 − 27곡
--   합계                                                   99곡
--
-- 표에서 온 16곡(019)과는 겹치지 않습니다. 문서 전체 리믹스 = 126 + 17 = 143곡.
--
-- ─── 비고가 '부활' 또는 '재수록' 이면 남깁니다 ───────────
-- 삭제곡 문서와 겹치더라도 비고에 그렇게 적힌 곡은 요청대로 제외하지 않았습니다.
--   · Novasonic Remix   (노바소닉 리믹스)
--   · Novarash Remix    (노바래쉬 리믹스)
--   · Ugly Duck Toccata (미운 오리 토카타)
-- 삭제곡 문서 전체에 '부활' 25행 · '재수록' 1행(conflict — 리믹스 아님)이 있습니다.
--
-- ─── 곡명 표기 ───────────────────────────────────────────
-- 본문은 `터보 리믹스 (Turbo Remix)` 처럼 「한글 이름 (영문 이름)」 형식입니다.
-- songs 는 원 표기를 쓰므로 **괄호 안 영문명을 title 로** 삼았습니다.
-- 삭제곡 대조는 한글·영문 **양쪽**으로 했습니다 (삭제곡 문서도 두 표기를 다 가짐).
--
-- 괄호가 중첩된 것(`B.P.M. 컬렉션 3 (펌트리스) (B.P.M. Collection 3 (Pumptris))`),
-- 패치 주석이 붙은 것(`... (1.05 패치 곡)`), 슬래시 병기(`.../Extra Hip-Hop Remix`)는
-- 끝에서부터 균형 잡힌 괄호를 찾아 떼는 방식으로 처리했습니다.
--
-- ⚠ 영문명이 없어 한글 이름 그대로 들어간 것 5곡:
--   1st 디바 리믹스 · 1st 디스코 리믹스 · 1st 테크노 리믹스 · 2nd 히든 리믹스 ·
--   엄정화 리믹스   — 문서에 영문 병기가 없습니다.
--
-- ⚠ **아티스트는 전부 NULL 입니다.** 본문은 리믹스의 아티스트를 적지 않고
--   '어떤 곡을 섞었는지'(원곡 아티스트 - 원곡명)만 나열합니다. 틀린 값을 넣는
--   것보다 비우는 쪽을 택했습니다 — 005 와 같은 판단입니다.
--
-- ─── 제외한 것 ───────────────────────────────────────────
-- 배틀 모드 4곡(배틀 1 힙합 ~ 배틀 4 하드코어)은 문서가 취소선으로 적고
-- "리믹스 곡은 아니고 배틀 모드 전용 곡" 이라고 명시해 뺐습니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- ON CONFLICT DO NOTHING.
--
-- 되돌리려면: MIGRATION_FILES 에서 빼고 schema_migrations 에서 지운 뒤
--   아래 목록의 title 을 DELETE 하세요 (채보가 붙지 않은 곡만 지워집니다).
-- ============================================================

INSERT INTO songs (machine_id, title, artist)
SELECT 1, v.title, NULL
FROM (VALUES
  ('1st 디바 리믹스'),
  ('1st 디스코 리믹스'),
  ('1st 테크노 리믹스'),
  ('Jo Sung Mo Remix'),
  ('엄정화 리믹스'),
  ('SM Town Remix'),
  ('Techno Repeatorment'),
  ('2nd 히든 리믹스'),
  ('3rd O.B.G. Diva Remix'),
  ('Park Mee Kyung Remix'),
  ('Banya Hiphop Remix'),
  ('Park Jin Young Remix'),
  ('Novasonic Remix'),
  ('BanYa Hard Mix'),
  ('Sechskies Remix'),
  ('Extra Hip-Hop Remix'),
  ('E-Paksa Remix'),
  ('Extra Disco Remix'),
  ('Extra Deux Remix'),
  ('Extra Banya Remix'),
  ('Novarash Remix'),
  ('1TYM Lexy Remix'),
  ('Tream Vook of the war'),
  ('Banya Classic Remix'),
  ('Exceed 2 Diva''s Remix'),
  ('World Remix'),
  ('Love is A Danger Zone 2 Try To B.P.M'),
  ('K-House Mix'),
  ('Groove Party'),
  ('WI-EX-DOC-VA'),
  ('Bemera'),
  ('BanYa-P Classic Remix'),
  ('Banya-P Guitar Remix'),
  ('Money Fingers'),
  ('NX2 K-Pop Remix 1'),
  ('NX2 K-Pop Remix 2'),
  ('NX2 Diva Remix'),
  ('Final Audition 3 & Chimera Remix'),
  ('Yasangma'),
  ('Mr. Fire Fighter & Beat of the War 2'),
  ('45RPM & Eun Ji Won Mix'),
  ('The People Didn''t Know "Pumping Up"'),
  ('Ugly Duck Toccata'),
  ('Caprice of DJ Otada'),
  ('Dr. K.O.A'),
  ('Novasonic Mix ver. 3'),
  ('Turkey Virus'),
  ('Scream Song'),
  ('B.P Classic Remix 1'),
  ('K-Pop Mix (Old & New)'),
  ('PaPa Helloizing'),
  ('B.P Classic Remix 2'),
  ('Set Up Me 2 Mix'),
  ('msgoon RMX pt. 6'),
  ('msgoon RMX pt. 7'),
  ('History: We Are The Zest'),
  ('Pump It Up With You'),
  ('Get Up (And Go) 180'),
  ('Danger Zone Twins'),
  ('Horse Mix'),
  ('Witch Core'),
  ('B.P.M. Collection 3 (Pumptris)'),
  ('Monkey-rang'),
  ('Whimera'),
  ('Trato X4'),
  ('Solitary Elise'),
  ('Turkey Mix'),
  ('Beatreme of the Wisp'),
  ('Pumping Jam'),
  ('4-X'),
  ('Chicken Doctor'),
  ('Cannon X-Tree'),
  ('DJ. Moon'),
  ('KM Pop Mix'),
  ('Final Danger Sticks'),
  ('To.Jam.Fa'),
  ('B.P.M. Collection 2 (Solitaries)'),
  ('Amadeustreme'),
  ('B.P.M. Collection 1 (Auditions)'),
  ('Pumpster Zone 2-1'),
  ('Hamera'),
  ('Bee-Mera'),
  ('World Pop Mix'),
  ('Ladimera'),
  ('B.P.M. Collection 4 (etc. Mix)'),
  ('K-Pop Girl Group RMX'),
  ('K-Pop Boy Group RMX'),
  ('Vacuum Cleaner'),
  ('Everybody Got 2 Know'),
  ('The Historic Classic Remix A'),
  ('The Historic Classic Remix B'),
  ('Armakitten 2-X'),
  ('Blowin'' It Up'),
  ('Dawgs in Da Revolution'),
  ('Destroy Them!'),
  ('Final Audition Infinity'),
  ('MAWARU INFINITY'),
  ('Napalmancy'),
  ('WI-EX-DOC-VACUUM')
) AS v(title)
ON CONFLICT (machine_id, title) DO NOTHING;
