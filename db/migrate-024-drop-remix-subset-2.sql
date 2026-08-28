-- ============================================================
-- 024 · 리믹스 8곡 추가 제거
--
-- 023 에 이어 8곡을 더 뺍니다. 남는 리믹스는 27곡입니다.
--   리믹스 보유 35곡 − 8곡 = 27곡
--
-- ─── 확인한 것 ───────────────────────────────────────────
--   · 8곡 모두 songs 에 실재하고 제목이 정확히 일치합니다.
--   · 8곡 모두 채보가 붙어 있지 않아 서열표에는 영향이 없습니다.
--
-- 이로써 EXTRA 시대 리믹스(Extra Hip-Hop / Disco / Deux)는 `Extra Banya Remix`
-- 하나만 남습니다.
--
-- 여러 번 실행해도 결과가 같습니다 — 지울 것이 없으면 0행입니다.
--
-- 되돌리려면 021 의 해당 VALUES 를 다시 INSERT 하세요 (아티스트는 NULL).
-- ============================================================

DELETE FROM songs
WHERE machine_id = 1
  AND title IN (
  'E-Paksa Remix',
  'Extra Disco Remix',
  'Extra Deux Remix',
  'Money Fingers',
  'Sechskies Remix',
  'Extra Hip-Hop Remix',
  '1TYM Lexy Remix',
  'Tream Vook of the war'
);
