-- ============================================================
-- 045 · 사볼의 NOV/ADV/EXH/MXM 은 모드가 아니라 난이도
--
-- ─── 왜 ──────────────────────────────────────────────────
-- 지금까지 machine_modes 를 게임 구분 없이 "모드" 로 다뤄, 사볼도 펌프처럼
-- 화면 위에 EXHAUST · MAXIMUM 버튼이 생기고 보드가 (모드, 레벨) 단위로
-- 쪼개졌습니다. 그런데 둘은 성질이 다릅니다.
--
--   펌프 Single / Double / Co-op  → **진짜 모드**. 발판 쓰는 방식이 달라
--                                   S15 와 D15 는 비교 대상이 아니다.
--   사볼 NOV / ADV / EXH / MXM    → **난이도**. 같은 곡의 다른 채보이고,
--                                   레벨 18 이면 EXH18 과 MXM18 이 같은
--                                   난이도대라 한 표에서 비교해야 한다.
--
-- 그래서 게임이 "모드 축이 난이도인가" 를 스스로 말하게 합니다.
--   true  → 보드는 **레벨만으로** 정해지고, 난이도는 곡명 뒤 대괄호로 표시
--            (예: `Xronièr [MXM]`). 모드 버튼은 그리지 않습니다.
--   false → 지금까지와 같음 (모드 버튼 + (모드, 레벨) 보드).
--
-- 기본값 false 라 펌프는 아무것도 바뀌지 않습니다.
--
-- ─── machine_modes 는 그대로 둡니다 ──────────────────────
-- 난이도 코드(EXH·MXM)와 표기(EXHAUST·MAXIMUM)가 여전히 필요합니다 —
-- 대괄호에 코드를, 상세 패널에 표기를 씁니다. 테이블 이름이 '모드' 인 것은
-- 남지만, 이름을 바꾸면 펌프 쪽 참조까지 전부 손봐야 해서 두었습니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- ADD COLUMN IF NOT EXISTS + machine_id 를 명시한 UPDATE.
-- ============================================================

ALTER TABLE tier_settings
  ADD COLUMN IF NOT EXISTS mode_is_difficulty BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tier_settings.mode_is_difficulty IS
  'true 면 machine_modes 가 모드가 아니라 난이도다 → 보드는 레벨만으로 정해지고 난이도는 곡명 뒤 대괄호로 표시한다.';

UPDATE tier_settings
   SET mode_is_difficulty = true
 WHERE machine_id = 3;
