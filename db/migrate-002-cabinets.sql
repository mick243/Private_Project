-- ============================================================
-- 002 · 대수 컬럼 → 기체 행
--
--   전:  arcade_machines (arcade_id, machine_id, cabinet_count, condition)
--        "펌프 2대, 컨디션 5" — 두 대의 상태가 다르면 담을 자리가 없습니다.
--   후:  arcade_machines (arcade_id, machine_id)          있다/없다만
--        arcade_cabinets (…, cabinet_no, condition)        기체 1대 = 1행
--
--   컨디션 제보(machine_reports.kind='condition')도 기체를 가리키게 됩니다.
--   대기 제보는 그대로 기종 단위입니다 — 줄은 게임 앞에 서지, 호기별로
--   서지 않기 때문입니다 (db/views.sql 참고).
--
-- ⚠ 여러 번 실행해도 결과가 같아야 합니다 (lib/db.ts runMigrations 주석 참고).
--   새로 만든 DB 는 schema.sql/seed.sql 에 이미 최종 상태가 들어 있으므로
--   여기서는 아무 일도 일어나지 않고 적용 이력만 남습니다.
-- ============================================================

-- ─── 1. 기체 테이블 ────────────────────────────────────────
-- 정의는 db/schema.sql 과 같아야 합니다 (새 DB 는 그쪽에서 만들어집니다).
CREATE TABLE IF NOT EXISTS arcade_cabinets (
  id          SERIAL   PRIMARY KEY,
  arcade_id   INTEGER  NOT NULL,
  machine_id  INTEGER  NOT NULL,
  cabinet_no  SMALLINT NOT NULL CHECK (cabinet_no > 0),
  condition   SMALLINT CHECK (condition BETWEEN 1 AND 5),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arcade_id, machine_id, cabinet_no),
  FOREIGN KEY (arcade_id, machine_id)
    REFERENCES arcade_machines (arcade_id, machine_id) ON DELETE CASCADE
);

-- ─── 2. 대수를 행으로 펼친다 ───────────────────────────────
-- 2대 = 1호기·2호기 두 행. 컨디션은 옛 값을 두 기체에 그대로 복사합니다 —
-- 기존 데이터로는 어느 쪽이 더 나빴는지 알 방법이 없고, 모르는 값을 NULL 로
-- 비우면 이미 들어와 있던 정보까지 사라집니다.
--
-- cabinet_count 가 이미 없는 DB(새로 만든 DB)에서는 이 문장 자체가 파싱될 수
-- 없으므로 EXECUTE 로 감싸 컬럼이 있을 때만 실행합니다.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'arcade_machines'
      AND column_name  = 'cabinet_count'
  ) THEN
    EXECUTE
      'INSERT INTO arcade_cabinets (arcade_id, machine_id, cabinet_no, condition) '
      || 'SELECT am.arcade_id, am.machine_id, g.n, am.condition '
      || 'FROM arcade_machines am, '
      || '     generate_series(1, GREATEST(am.cabinet_count, 1)) AS g(n) '
      || 'ON CONFLICT (arcade_id, machine_id, cabinet_no) DO NOTHING';
  END IF;
END
$mig$;

-- ─── 3. 옛 컬럼 제거 ───────────────────────────────────────
-- 남겨 두면 "대수는 여기, 기체는 저기" 두 벌이 되어 반드시 어긋납니다.
ALTER TABLE arcade_machines DROP COLUMN IF EXISTS cabinet_count;
ALTER TABLE arcade_machines DROP COLUMN IF EXISTS condition;

-- ─── 4. 기체가 한 대도 없는 기종 ───────────────────────────
-- "이 게임 있어요" 제보가 임계값을 채워 자동 등록된 행은 대수 정보 없이
-- 만들어졌습니다. 카드가 0개면 화면에서 그 기종이 통째로 사라지므로 1호기를 답니다.
INSERT INTO arcade_cabinets (arcade_id, machine_id, cabinet_no)
SELECT am.arcade_id, am.machine_id, 1
FROM arcade_machines am
WHERE NOT EXISTS (
  SELECT 1 FROM arcade_cabinets c
  WHERE c.arcade_id = am.arcade_id AND c.machine_id = am.machine_id
)
ON CONFLICT (arcade_id, machine_id, cabinet_no) DO NOTHING;

-- ─── 5. 제보에 기체 칸 ─────────────────────────────────────
ALTER TABLE machine_reports
  ADD COLUMN IF NOT EXISTS cabinet_id INTEGER REFERENCES arcade_cabinets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS machine_reports_cabinet_idx
  ON machine_reports (cabinet_id, created_at DESC);

-- ─── 6. 옛 컨디션 제보를 1호기에 붙인다 ────────────────────
-- 어느 기체였는지는 기록이 없습니다. 1호기로 몰면 실제와 다를 수 있지만,
-- NULL 로 두면 cabinet_live 집계에서 빠져 "최근 컨디션" 이 통째로 비어 버립니다.
-- 새 제보가 쌓이면 60일(condition_window_days) 안에 자연히 밀려납니다.
UPDATE machine_reports r
SET cabinet_id = c.id
FROM arcade_cabinets c
WHERE r.kind       = 'condition'
  AND r.cabinet_id IS NULL
  AND c.arcade_id  = r.arcade_id
  AND c.machine_id = r.machine_id
  AND c.cabinet_no = 1;

-- ─── 7. 종류별 기체 규칙 ───────────────────────────────────
-- 정의는 db/schema-community.sql 과 같아야 합니다.
ALTER TABLE machine_reports DROP CONSTRAINT IF EXISTS machine_reports_cabinet_check;
ALTER TABLE machine_reports ADD CONSTRAINT machine_reports_cabinet_check
  CHECK (kind = 'condition' OR cabinet_id IS NULL);
