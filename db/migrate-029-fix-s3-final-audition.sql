-- ============================================================
-- 029 · S3 서열표의 파이널 오디션 교정 (Episode 2-2 → Ep.2-X)
--
-- ─── 왜 ──────────────────────────────────────────────────
-- 028 은 서열표에 파이널 오디션 에피소드가 두 칸(상 · 중하) 있는데 두 재킷이
-- 모두 Yahpp · BPM 170 이라 어느 쪽인지 못 갈랐고, 헤더에 그렇게 적어 둔 채
-- `Episode 2-1` 과 `Episode 2-2` 로 넣었습니다.
--
-- 실제로는 **`Episode 2-1` 과 `Ep.2-X`** 입니다. 그 차이를 바로잡습니다.
--
--   Final Audition Episode 2-1  → 그대로 둠
--   Final Audition Episode 2-2  → S3 채보 제거
--   Final Audition Ep.2-X       → S3 채보 추가
--
-- S3 채보 수는 94개 그대로입니다.
--
-- ⚠ 두 채보 모두 투표·클리어 기록이 0건이라(028 이 채보만 만들었음) 지워도
--   잃는 데이터가 없습니다. 새로 붙는 Ep.2-X 채보도 투표가 없으므로 '미정'
--   으로 들어갑니다 — S3 는 여전히 전부 미정입니다.
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- DELETE 는 지울 것이 없으면 0행, INSERT 는 ON CONFLICT DO NOTHING.
--
-- 되돌리려면 위 두 줄을 반대로 실행하세요.
-- ============================================================

-- ─── 1) Episode 2-2 의 S3 채보 제거 ────────────────────────
DELETE FROM charts c
USING songs s
WHERE s.id = c.song_id
  AND s.machine_id = 1
  AND s.title = 'Final Audition Episode 2-2'
  AND c.mode = 'S' AND c.level = 3;

-- ─── 2) Ep.2-X 에 S3 채보 추가 ─────────────────────────────
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 3
FROM songs s
WHERE s.machine_id = 1 AND s.title = 'Final Audition Ep.2-X'
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND s.title = 'Final Audition Ep.2-X'
  AND c.mode = 'S' AND c.level = 3;
