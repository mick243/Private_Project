-- ============================================================
-- 오락실 파인더 · 스키마
-- 표준 PostgreSQL 문법만 사용합니다 (PGlite / 실제 Postgres 공용).
--
-- [PostGIS 업그레이드 경로]
--   CREATE EXTENSION postgis;
--   ALTER TABLE arcades ADD COLUMN geom geography(Point, 4326)
--     GENERATED ALWAYS AS (ST_MakePoint(lng, lat)::geography) STORED;
--   CREATE INDEX arcades_geom_idx ON arcades USING GIST (geom);
--   → 반경 검색이 ST_DWithin(geom, ST_MakePoint($lng,$lat)::geography, $m)
--     로 바뀌고 인덱스를 타게 됩니다. 지금은 haversine 계산식을 씁니다.
-- ============================================================

DROP TABLE IF EXISTS arcade_cabinets CASCADE;
DROP TABLE IF EXISTS arcade_machines CASCADE;
DROP TABLE IF EXISTS machines CASCADE;
DROP TABLE IF EXISTS arcades CASCADE;

-- ─── 오락실 ────────────────────────────────────────────────
CREATE TABLE arcades (
  id          SERIAL PRIMARY KEY,
  name        TEXT             NOT NULL,
  address     TEXT             NOT NULL,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  open_time   TEXT,                      -- 'HH:MM' · NULL 이면 정보 없음
  close_time  TEXT,                      -- 'HH:MM' · '24:00' 이상은 익일 영업
  is_24h      BOOLEAN          NOT NULL DEFAULT FALSE,
  phone       TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- 지도 뷰포트(bbox) 조회용. PostGIS 도입 전까지의 대체 인덱스.
CREATE INDEX arcades_lat_lng_idx ON arcades (lat, lng);
CREATE INDEX arcades_name_idx    ON arcades (name);

-- ─── 기종 마스터 ───────────────────────────────────────────
CREATE TABLE machines (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,   -- 정식 명칭
  short_name TEXT NOT NULL,          -- UI 뱃지용 축약 명칭
  category   TEXT NOT NULL           -- 'rhythm' | 'etc'
             CHECK (category IN ('rhythm', 'etc')),
  -- 목록 표시 순서. id 순으로 두면 순서를 바꾸려고 데이터를 다시 심어야 하는데,
  -- id 는 오락실 보유 기종·제보·서열표가 참조하는 키라서 손댈 수 없습니다.
  -- 10 단위로 띄워 사이에 끼워 넣을 자리를 남겨 둡니다.
  sort_order INTEGER NOT NULL DEFAULT 999
);

-- ─── 오락실 ↔ 기종 (M:N) ───────────────────────────────────
-- "이 오락실에 이 게임이 있다" 는 사실만 담습니다. 몇 대인지·상태가 어떤지는
-- arcade_cabinets 의 행 수와 각 행의 condition 이 답합니다.
-- 크라우드소싱 대상 — "있어요 / 없어졌어요" 제보가 이 행을 만들고 지웁니다.
CREATE TABLE arcade_machines (
  arcade_id     INTEGER  NOT NULL REFERENCES arcades(id)  ON DELETE CASCADE,
  machine_id    INTEGER  NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (arcade_id, machine_id)
);

CREATE INDEX arcade_machines_machine_idx ON arcade_machines (machine_id);

-- ─── 기체 1대 = 1행 ────────────────────────────────────────
-- 같은 게임이 2대 있으면 두 대의 상태는 서로 다릅니다 — 한쪽 발판만 죽어 있는
-- 오락실이 흔합니다. cabinet_count 숫자 + condition 한 칸으로는 그 차이를 담을
-- 자리가 없어서, 대수를 행으로 펼치고 컨디션을 기체마다 답니다.
--
-- cabinet_no 는 같은 (오락실, 기종) 안에서의 표시 번호(1호기·2호기)입니다.
-- 항상 1..N 으로 빈틈 없이 유지합니다 (lib/arcades.ts replaceMachines).
-- id 를 따로 두는 이유: 컨디션 제보(machine_reports.cabinet_id)가 이 행을
-- 가리키므로, 대수를 바꿔도 살아남는 안정된 키가 필요합니다.
CREATE TABLE arcade_cabinets (
  id          SERIAL   PRIMARY KEY,
  arcade_id   INTEGER  NOT NULL,
  machine_id  INTEGER  NOT NULL,
  cabinet_no  SMALLINT NOT NULL CHECK (cabinet_no > 0),
  condition   SMALLINT CHECK (condition BETWEEN 1 AND 5),  -- 5 = 컨디션 최상
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arcade_id, machine_id, cabinet_no),
  -- 기종이 통째로 빠지면(없어졌어요) 그 기체들도 함께 사라져야 합니다.
  FOREIGN KEY (arcade_id, machine_id)
    REFERENCES arcade_machines (arcade_id, machine_id) ON DELETE CASCADE
);
