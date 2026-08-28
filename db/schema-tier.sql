-- ============================================================
-- 체감 난이도 서열표 · 스키마
--
-- 핵심 규칙
--   1. 투표는 "그 채보를 클리어한 사람"만 할 수 있다.
--      → difficulty_votes 가 clear_records 를 복합 FK 로 참조해 DB 레벨에서 강제.
--        클리어 기록을 지우면 투표도 함께 사라진다 (ON DELETE CASCADE).
--   2. 등급은 투표 평균값과 가장 가까운 anchor 로 자동 배치.
--   3. 투표가 갈리는 채보(수렴도 낮음)는 '개인차', 표본이 적으면 '미정'.
--
-- schema.sql (오락실) 이 먼저 적용된 상태를 전제로 합니다 — machines 를 참조합니다.
-- ============================================================

DROP TABLE IF EXISTS difficulty_votes CASCADE;
DROP TABLE IF EXISTS clear_records   CASCADE;
DROP TABLE IF EXISTS charts          CASCADE;
DROP TABLE IF EXISTS songs           CASCADE;
DROP TABLE IF EXISTS tier_grades     CASCADE;
DROP TABLE IF EXISTS tier_settings   CASCADE;
DROP TABLE IF EXISTS players         CASCADE;
DROP FUNCTION IF EXISTS recalc_chart_stats(integer);

-- ─── 플레이어 ──────────────────────────────────────────────
-- 프로토타입이라 인증 없이 닉네임만. 실제로는 카카오 OAuth 계정에 연결됩니다.
--
-- 예외가 관리자입니다 — 오락실 정보 수정과 제보 삭제는 아무나 하면 안 되므로
-- 그 계정만 비밀번호를 갖습니다 (db/migrate-004-admin.sql · lib/auth.ts).
CREATE TABLE players (
  id            SERIAL PRIMARY KEY,
  nickname      TEXT NOT NULL UNIQUE,
  -- 관리자만 값이 있습니다 (scrypt). 일반 플레이어는 NULL — 로그인 자체가 없습니다.
  password_hash TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 게임별 집계 설정 ──────────────────────────────────────
-- 임계값을 코드가 아니라 DB 에 두면 배포 없이 튜닝할 수 있고,
-- SQL(집계 함수)과 앱(투표 UI 범위)이 같은 값을 보게 됩니다.
CREATE TABLE tier_settings (
  machine_id      INTEGER PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
  vote_min        NUMERIC(4,2) NOT NULL,   -- 투표 스케일 하한
  vote_max        NUMERIC(4,2) NOT NULL,   -- 투표 스케일 상한
  -- 투표 슬라이더의 눈금 간격. 화면 입력 단위일 뿐이어서 집계 SQL 은 쓰지 않습니다
  -- (tier_step 과 별개 — 그쪽은 수렴도 기준이라 등급 간격이어야 합니다).
  vote_step       NUMERIC(4,2) NOT NULL DEFAULT 0.10,
  tier_step       NUMERIC(4,2) NOT NULL,   -- 등급 간 간격 (수렴도 계산 기준)
  min_votes       INTEGER      NOT NULL,   -- 이 수 미만이면 '미정'
  min_convergence NUMERIC(4,2) NOT NULL,   -- 이 값 미만이면 '개인차'
  -- 이 수 이상이 표시하면 '특수패턴'. min_votes 와 따로 둡니다 — 투표 표본과
  -- 특수 패턴 합의는 성격이 다르므로 한쪽을 올릴 때 다른 쪽이 끌려가면 안 됩니다.
  special_min     INTEGER      NOT NULL DEFAULT 3
);

-- ─── 등급 구간표 ───────────────────────────────────────────
-- PIU 7단계 / maimai 11단계처럼 게임마다 단계 수가 다르므로 machine_id 로 분리.
CREATE TABLE tier_grades (
  machine_id INTEGER      NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  code       TEXT         NOT NULL,
  label      TEXT         NOT NULL,
  anchor     NUMERIC(4,2) NOT NULL,  -- 이 등급의 대표값. 평균이 여기 가장 가까우면 배치됨
  sort_order INTEGER      NOT NULL,  -- 1 = 최상
  PRIMARY KEY (machine_id, code),
  UNIQUE (machine_id, sort_order)
);

-- ─── 곡 / 채보 ─────────────────────────────────────────────
CREATE TABLE songs (
  id         SERIAL PRIMARY KEY,
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  artist     TEXT,
  UNIQUE (machine_id, title)
);

CREATE TABLE charts (
  id      SERIAL  PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  -- ⚠ 이 CHECK 는 schema-community.sql 에서 제거되고 machine_modes 테이블로 대체됩니다
  --   (게임마다 모드 체계가 달라서 — 사볼 NOV/ADV/EXH/MXM, EZ2AC 4K/5K/…).
  --   기존 .pglite 도 따라잡히도록 여기서 지우지 않고 그쪽에서 ALTER 로 뗍니다.
  mode    TEXT    NOT NULL CHECK (mode IN ('S', 'D', 'CO')),  -- Single / Double / Co-op
  level   INTEGER NOT NULL CHECK (level BETWEEN 1 AND 30),

  -- ── 집계 캐시 ──
  -- 티어표는 읽기가 압도적으로 많고 쓰기(투표)는 드뭅니다. 조회할 때마다
  -- 재계산하지 않도록 결과를 여기 저장하고, 투표가 바뀔 때만 갱신합니다.
  vote_count       INTEGER NOT NULL DEFAULT 0,
  avg_vote         NUMERIC(6,3),
  convergence      NUMERIC(6,3),
  tier_code        TEXT,          -- tier_grades.code | 'unique' | 'undecided'
  stats_updated_at TIMESTAMPTZ,

  -- 특수 패턴(기믹·연출로 난이도가 정해지는 채보) 표시 인원.
  -- special_marks 의 개수 캐시 — tier_settings.special_min 이상이면 서열표가
  -- 이 채보를 '특수패턴' 칸으로 보냅니다.
  --
  -- ⚠ tier_code 를 덮지 않습니다. 등급은 투표대로 계산돼 그대로 남고, 칸을
  --   가르는 것은 **읽을 때** 입니다. 그래서 표시가 임계값 아래로 내려가면
  --   원래 등급이 재계산 없이 돌아오고, 특수패턴이어도 투표 등급을 함께
  --   보여줄 수 있습니다 ('특수패턴 / 중상').
  special_count    INTEGER NOT NULL DEFAULT 0,

  UNIQUE (song_id, mode, level)
);

CREATE INDEX charts_lookup_idx ON charts (mode, level);

-- ─── 클리어 기록 ───────────────────────────────────────────
-- 투표 자격의 근거. 이게 없으면 투표할 수 없습니다.
CREATE TABLE clear_records (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chart_id   INTEGER NOT NULL REFERENCES charts(id)  ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, chart_id)
);

CREATE INDEX clear_records_chart_idx ON clear_records (chart_id);

-- ─── 특수 패턴 표시 ───────────────────────────────────────
-- 투표와 달리 값이 없습니다 — "기믹이 있다/없다" 뿐이라 셀 것은 사람 수입니다.
-- 클리어 게이트도 없습니다 (평가란과 같은 이유 — 못 깨도 기믹은 보입니다).
CREATE TABLE special_marks (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chart_id   INTEGER NOT NULL REFERENCES charts(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, chart_id)
);

CREATE INDEX special_marks_chart_idx ON special_marks (chart_id);

-- ─── 체감 난이도 투표 ──────────────────────────────────────
CREATE TABLE difficulty_votes (
  player_id  INTEGER      NOT NULL,
  chart_id   INTEGER      NOT NULL,
  value      NUMERIC(4,2) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, chart_id),

  -- ★ 클리어 게이트. 애플리케이션 검증이 뚫려도 DB 가 막습니다.
  FOREIGN KEY (player_id, chart_id)
    REFERENCES clear_records (player_id, chart_id) ON DELETE CASCADE
);

CREATE INDEX difficulty_votes_chart_idx ON difficulty_votes (chart_id);

-- ─── 집계 함수 ─────────────────────────────────────────────
-- p_chart_id 가 NULL 이면 전체 재계산(배치용), 값이 있으면 그 채보만(투표 시).
--
-- 수렴도 = max(0, 1 - 표준편차 / tier_step)
--   투표가 완전히 일치하면 1.0, 등급 간격(tier_step)만큼 흩어지면 0.0.
--   즉 "한 등급 폭 안에서 의견이 모이는가"를 0~1 로 정규화한 값입니다.
CREATE FUNCTION recalc_chart_stats(p_chart_id integer) RETURNS void
LANGUAGE sql AS $fn$
  WITH stats AS (
    SELECT c.id                                AS chart_id,
           s.machine_id,
           COUNT(v.value)                      AS n,
           AVG(v.value)                        AS avg_vote,
           COALESCE(STDDEV_SAMP(v.value), 0)   AS sd,
           (SELECT COUNT(*) FROM special_marks sm WHERE sm.chart_id = c.id) AS special_n
    FROM charts c
    JOIN songs s ON s.id = c.song_id
    LEFT JOIN difficulty_votes v ON v.chart_id = c.id
    WHERE p_chart_id IS NULL OR c.id = p_chart_id
    GROUP BY c.id, s.machine_id
  ),
  scored AS (
    SELECT st.*,
           ts.min_votes,
           ts.min_convergence,
           CASE WHEN st.n < 2 THEN NULL
                ELSE GREATEST(0, 1 - st.sd / ts.tier_step)
           END AS convergence
    FROM stats st
    JOIN tier_settings ts ON ts.machine_id = st.machine_id
  )
  UPDATE charts c SET
    vote_count    = sc.n,
    special_count = sc.special_n,
    avg_vote    = CASE WHEN sc.n = 0 THEN NULL ELSE sc.avg_vote END,
    convergence = sc.convergence,
    tier_code   = CASE
                    WHEN sc.n < sc.min_votes THEN 'undecided'
                    WHEN sc.convergence < sc.min_convergence THEN 'unique'
                    ELSE (
                      SELECT g.code FROM tier_grades g
                      WHERE g.machine_id = sc.machine_id
                      -- 동점(정확히 두 anchor 의 중간)이면 0 에 가까운 안쪽 등급.
                      -- anchor 가 좌우 대칭이므로 그래야 등급 띠도 대칭이 된다
                      -- (펌프에서 '중' = -0.2 ~ 0.2). 화면 쪽
                      -- ChartDetailPanel.nearestGradeIndex 와 같은 규칙이어야 한다.
                      ORDER BY abs(g.anchor - sc.avg_vote) ASC, abs(g.anchor) ASC,
                               g.sort_order ASC
                      LIMIT 1
                    )
                  END,
    stats_updated_at = now()
  FROM scored sc
  WHERE c.id = sc.chart_id;
$fn$;
