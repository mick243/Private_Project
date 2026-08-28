-- ============================================================
-- 001 · 기종 목록 정리
--
--   1. EZ2 를 EZ2DJ / EZ2AC 로 분리 (기존 행이 EZ2AC, EZ2DJ 를 새로 추가)
--   2. machines.sort_order 추가 — 목록 순서를 id 에서 떼어낸다
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석 참고).
--   새로 만든 DB 는 seed.sql 에 이미 최종 상태가 들어 있으므로 여기서는
--   아무 일도 일어나지 않고 적용 이력만 남습니다.
-- ============================================================

-- ─── 3. 목록 순서 ──────────────────────────────────────────
-- 지금까지 목록 순서는 id 순이었는데, id 는 참조 키라서 순서를 바꾸려면
-- 데이터를 다시 심어야 했습니다. 표시 순서를 별도 컬럼으로 뺍니다.
-- 10 단위로 띄워 두면 사이에 끼워 넣을 때 뒤를 건드리지 않아도 됩니다.
ALTER TABLE machines ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE machines SET sort_order = id * 10 WHERE sort_order IS NULL;

-- ─── 2. EZ2 분리 ───────────────────────────────────────────
-- 기존 행(name='EZ2AC')은 축약명만 'EZ2' → 'EZ2AC' 로 고칩니다.
-- 이 행을 그대로 쓰는 이유: 오락실 보유 기종·제보가 이미 이 id 를 참조합니다.
UPDATE machines SET short_name = 'EZ2AC' WHERE name = 'EZ2AC';

-- EZ2DJ 는 새 행. sort_order 를 EZ2AC(20) 바로 앞에 둬서 목록에서 나란히 보이게 합니다.
INSERT INTO machines (name, short_name, category, sort_order)
VALUES ('EZ2DJ', 'EZ2DJ', 'rhythm', 15)
ON CONFLICT (name) DO NOTHING;

-- 수동 INSERT 이후로 시퀀스를 맞춥니다 (안 하면 다음 등록이 중복 id 로 실패).
SELECT setval('machines_id_seq', (SELECT MAX(id) FROM machines));

-- 남은 기종의 sort_order 를 확정합니다. 새 DB(시드에 이미 값이 있음)와
-- 기존 DB(위에서 id*10 으로 채운 값)가 같은 순서가 되도록 이름으로 지정합니다.
UPDATE machines SET sort_order = v.ord
FROM (VALUES
  ('Pump It Up',            10),
  ('EZ2DJ',                 15),
  ('EZ2AC',                 20),
  ('SOUND VOLTEX',          30),
  ('beatmania IIDX',        40),
  ('太鼓の達人 (태고의 달인)', 50),
  ('DanceDanceRevolution',  60),
  ('maimai DX',             70),
  ('CHUNITHM',              80),
  ('jubeat',                90)
) AS v(name, ord)
WHERE machines.name = v.name;

-- 목록에 새로 추가되는 기종이 순서를 못 받고 맨 앞으로 튀지 않게 기본값을 준다.
UPDATE machines SET sort_order = id * 10 WHERE sort_order IS NULL;
ALTER TABLE machines ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE machines ALTER COLUMN sort_order SET DEFAULT 999;
