-- ============================================================
-- 020 · 사랑가 S1 채보 복구
--
-- ─── 왜 ──────────────────────────────────────────────────
-- 019 가 `사랑가` 곡 행을 지우면서 거기 붙어 있던 S1 채보가 CASCADE 로 함께
-- 사라져 S1 서열표가 18곡 → 17곡이 됐습니다. 그 자리를 되돌립니다.
--
-- ─── ⚠ `사랑가` 행을 다시 만들지 않습니다 ────────────────
-- 수록곡 문서 영문명 컬럼 기준 `사랑가` 의 원 표기는 **`Betrayer`** 이고,
-- 그 행은 songs 에 이미 있습니다 (id 3841 · BanYa). 012 가 음차로 한 번 더
-- 넣은 것이 019 에서 지워진 그 행입니다.
--
-- 그래서 음차 행을 되살리는 대신 **기존 `Betrayer` 행에 S1 채보를 붙입니다.**
-- 서열표에 곡이 돌아오는 결과는 같고, 같은 곡이 두 표기로 흩어지지 않습니다.
-- 화면에는 `사랑가` 가 아니라 `Betrayer` 로 표시됩니다.
--
-- ─── 클리어 기록도 함께 ──────────────────────────────────
-- 012 는 S1 채보마다 가장 오래된 계정 7명의 클리어 기록을 넣었습니다. 이 채보만
-- 클리어가 0건이면 나머지 17개와 어긋나므로 같은 방식으로 되돌립니다.
--
-- **투표는 넣지 않습니다.** 014 가 Bad Apple 을 뺀 펌프 투표를 전부 지웠으므로,
-- 지금 S1 에서 등급이 붙은 채보는 Bad Apple 하나뿐입니다. 이 채보도 그 상태에
-- 맞춰 '미정' 으로 들어갑니다 (S1 = Bad Apple 중상 1곡 + 미정 17곡).
--
-- ─── 여러 번 실행해도 결과가 같습니다 ────────────────────
-- 채보·클리어 모두 ON CONFLICT DO NOTHING.
--
-- 되돌리려면:
--   DELETE FROM charts WHERE mode='S' AND level=1
--     AND song_id = (SELECT id FROM songs WHERE machine_id=1 AND title='Betrayer');
-- ============================================================

-- ─── 1) 채보 ───────────────────────────────────────────────
INSERT INTO charts (song_id, mode, level)
SELECT s.id, 'S', 1
FROM songs s
WHERE s.machine_id = 1 AND s.title = 'Betrayer'
ON CONFLICT (song_id, mode, level) DO NOTHING;

-- ─── 2) 클리어 기록 (012 와 같은 7명) ──────────────────────
INSERT INTO clear_records (player_id, chart_id)
SELECT p.id, c.id
FROM charts c
JOIN songs s ON s.id = c.song_id
CROSS JOIN (SELECT id FROM players ORDER BY id LIMIT 7) p
WHERE s.machine_id = 1 AND s.title = 'Betrayer' AND c.mode = 'S' AND c.level = 1
ON CONFLICT DO NOTHING;

-- ─── 3) 집계 ───────────────────────────────────────────────
-- 투표가 0건이므로 tier_code = 'undecided' 가 됩니다.
SELECT recalc_chart_stats(c.id)
FROM charts c JOIN songs s ON s.id = c.song_id
WHERE s.machine_id = 1 AND s.title = 'Betrayer' AND c.mode = 'S' AND c.level = 1;
