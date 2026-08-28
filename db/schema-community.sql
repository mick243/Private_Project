-- ============================================================
-- 커뮤니티 · 실시간 제보 · 채보 평가 · 스키마
--
-- schema.sql (오락실) 과 schema-tier.sql (서열표) 이 먼저 적용된 상태를 전제로 합니다
-- — arcades / machines / players / charts 를 참조합니다.
--
-- 설계 요지
--   1. 제보는 "덮어쓰기"가 아니라 append-only 이벤트 로그다.
--      대기인원처럼 5분 뒤 틀려지는 정보를 컬럼에 UPDATE 하면 언제 적인지,
--      몇 명이 같은 말을 했는지가 사라진다. 그래서 machine_reports 에 쌓고
--      "지금 상태"는 machine_live 뷰가 TTL 안의 제보만 모아서 만든다.
--   2. 유효기간은 종류마다 다르다. 대기인원은 분 단위, 컨디션은 주 단위.
--      두 값 모두 report_settings 에 있어 배포 없이 조정할 수 있다.
--   3. 있어요/없어졌어요는 서로 다른 제보자 N명이 모이면 arcade_machines 에
--      자동 반영한다 (lib/reports.ts). 승인자를 세워야만 굴러가는 구조를
--      만들면 제보가 쌓여도 지도가 갱신되지 않는다.
-- ============================================================

DROP VIEW  IF EXISTS machine_live      CASCADE;
DROP VIEW  IF EXISTS cabinet_condition CASCADE;
DROP VIEW  IF EXISTS cabinet_live      CASCADE;   -- cabinet_condition 의 옛 이름
DROP TABLE IF EXISTS chart_comments    CASCADE;
DROP TABLE IF EXISTS arcade_reviews    CASCADE;
DROP TABLE IF EXISTS machine_reports   CASCADE;
DROP TABLE IF EXISTS report_settings   CASCADE;
DROP TABLE IF EXISTS machine_modes     CASCADE;
DROP FUNCTION IF EXISTS recalc_arcade_rating(integer);

-- ─── 게임별 플레이 모드 ────────────────────────────────────
-- 서열표가 펌프 전용이던 시절에는 charts.mode 가 CHECK (S/D/CO) 로 고정돼 있었다.
-- 게임마다 모드 체계가 다르므로(사볼 NOV/ADV/EXH/MXM, EZ2AC 4K/5K/…) 코드에서
-- 빼내 테이블로 옮긴다. 아래에서 그 CHECK 를 떼어낸다.
CREATE TABLE machine_modes (
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,   -- charts.mode 에 들어가는 값
  label      TEXT    NOT NULL,   -- UI 표기
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (machine_id, code),
  UNIQUE (machine_id, sort_order)
);

-- charts.mode 는 이제 machine_modes 로 검증한다 (앱 레벨).
-- charts 에 machine_id 가 없어(songs 경유) 복합 FK 를 걸 수 없으므로 CHECK 만 제거.
ALTER TABLE charts DROP CONSTRAINT IF EXISTS charts_mode_check;

-- ─── 제보 유효기간/임계값 ──────────────────────────────────
CREATE TABLE report_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- 대기인원 제보의 수명. 이 시간이 지나면 machine_live 에서 빠질 뿐 아니라
  -- 행 자체가 지워진다 (lib/reports.ts purgeExpiredQueueReports).
  -- "20시간 전 대기 5명" 은 지금 아무에게도 쓸모가 없고, 피드에 남아 있으면
  -- 최신 정보를 밀어낸다. 컨디션·기종변동과 달리 되돌아볼 값이 아니다.
  queue_ttl_minutes     INTEGER  NOT NULL DEFAULT 240,
  -- 컨디션 제보 집계 구간(1달). 대기와 달리 천천히 변하는 값이라 훨씬 길게 본다.
  -- 다만 무한정 보지는 않는다 — 반년 전 평가가 오늘 값에 섞이면 정비된 기체가
  -- 계속 나쁜 점수를 단다. 행은 지우지 않고 집계에서만 뺀다 (기종변동과 달리
  -- 컨디션은 '지금 상태'를 주장하는 값이라 낡으면 근거가 되지 못한다).
  condition_window_days INTEGER  NOT NULL DEFAULT 30,
  -- 있어요/없어졌어요가 arcade_machines 에 자동 반영되는 서로 다른 제보자 수
  presence_threshold    INTEGER  NOT NULL DEFAULT 2
);

INSERT INTO report_settings (id) VALUES (1);

-- ─── 기종 제보 (append-only) ───────────────────────────────
CREATE TABLE machine_reports (
  id         SERIAL PRIMARY KEY,
  arcade_id  INTEGER NOT NULL REFERENCES arcades(id)  ON DELETE CASCADE,
  machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  -- 컨디션 제보만 기체 1대를 가리킨다. 대기는 기종 단위이고(줄은 게임 앞에 선다),
  -- 있어요/없어졌어요는 기종 자체에 대한 제보라 기체가 없다.
  --
  -- 기체가 지워져도(대수를 줄이는 등) 제보 이력은 남긴다 — CASCADE 로 지우면
  -- "4대였다가 3대가 된" 오락실의 과거 컨디션 기록이 통째로 사라진다.
  -- 대신 cabinet_id 가 NULL 이 되어 cabinet_live 집계에서만 빠진다.
  cabinet_id INTEGER          REFERENCES arcade_cabinets(id) ON DELETE SET NULL,
  -- 익명 제보를 허용하되 흔적은 남긴다. 플레이어가 지워져도 제보 자체는 보존.
  player_id  INTEGER          REFERENCES players(id)  ON DELETE SET NULL,

  kind       TEXT     NOT NULL CHECK (kind IN ('presence', 'absence', 'queue', 'condition')),
  wait_count SMALLINT          CHECK (wait_count BETWEEN 0 AND 99),  -- kind='queue'
  condition  SMALLINT          CHECK (condition  BETWEEN 1 AND 5),   -- kind='condition'
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 종류별 필수 필드를 DB 가 강제한다. "대기 제보인데 인원이 없는" 행이 생기면
  -- machine_live 의 집계가 조용히 틀려지므로 앱 검증만 믿지 않는다.
  CONSTRAINT machine_reports_payload_check CHECK (
    (kind = 'queue'     AND wait_count IS NOT NULL AND condition  IS NULL) OR
    (kind = 'condition' AND condition  IS NOT NULL AND wait_count IS NULL) OR
    (kind IN ('presence', 'absence') AND wait_count IS NULL AND condition IS NULL)
  ),

  -- 컨디션이 아닌 제보에 기체가 붙어 있으면 "이 기체 대기 3명" 같은, 화면에
  -- 그릴 곳이 없는 행이 된다. 반대 방향(컨디션인데 기체 없음)은 막지 않는다 —
  -- 기체가 지워진 옛 제보(위 SET NULL)가 그 상태로 남기 때문이다.
  CONSTRAINT machine_reports_cabinet_check CHECK (
    kind = 'condition' OR cabinet_id IS NULL
  )
);

-- machine_live 집계용 (오락실+기종+종류로 좁힌 뒤 최신순)
CREATE INDEX machine_reports_live_idx ON machine_reports (arcade_id, machine_id, kind, created_at DESC);
-- cabinet_live 집계용 (기체별 컨디션)
CREATE INDEX machine_reports_cabinet_idx ON machine_reports (cabinet_id, created_at DESC);
-- 전국 실시간 피드용
CREATE INDEX machine_reports_feed_idx ON machine_reports (created_at DESC);

-- ─── "지금 이 기종" ────────────────────────────────────────
-- 정의는 [`db/views.sql`](views.sql) 에 있습니다 — 이 파일이 아니라 그쪽입니다.
--
-- 뷰는 데이터를 갖지 않는 파생 객체라서 언제 다시 만들어도 안전합니다. 반면 이 파일은
-- sentinel(chart_comments) 이 이미 있으면 다시 적용되지 않으므로, 여기 두면 집계식을
-- 고쳐도 기존 DB 가 옛 정의를 계속 씁니다. 그래서 views.sql 로 빼서 **매번 재적용**합니다
-- (lib/db.ts 참고).

-- ─── 오락실 리뷰 / 평점 ────────────────────────────────────
CREATE TABLE arcade_reviews (
  id         SERIAL PRIMARY KEY,
  arcade_id  INTEGER  NOT NULL REFERENCES arcades(id)  ON DELETE CASCADE,
  player_id  INTEGER  NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1인 1리뷰. 수정은 UPSERT 로 처리해 평점 물타기를 막는다.
  UNIQUE (arcade_id, player_id)
);

CREATE INDEX arcade_reviews_arcade_idx ON arcade_reviews (arcade_id, created_at DESC);

-- 평점은 목록에서 매번 읽히고 쓰기는 드물다 → charts 의 집계 캐시와 같은 방식.
ALTER TABLE arcades ADD COLUMN IF NOT EXISTS rating_avg   NUMERIC(3,2);
ALTER TABLE arcades ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;

-- p_arcade_id 가 NULL 이면 전체 재계산(배치용), 값이 있으면 그 오락실만.
CREATE FUNCTION recalc_arcade_rating(p_arcade_id integer) RETURNS void
LANGUAGE sql AS $fn$
  UPDATE arcades a SET
    rating_avg   = s.avg_rating,
    review_count = s.n
  FROM (
    SELECT a2.id                AS arcade_id,
           COUNT(r.rating)::int AS n,
           AVG(r.rating)        AS avg_rating
    FROM arcades a2
    LEFT JOIN arcade_reviews r ON r.arcade_id = a2.id
    WHERE p_arcade_id IS NULL OR a2.id = p_arcade_id
    GROUP BY a2.id
  ) s
  WHERE a.id = s.arcade_id;
$fn$;

-- ─── 채보 평가 ─────────────────────────────────────────────
-- 서열표의 숫자 하나로는 "왜 어려운지"가 안 보인다. 폭타인지 틀기인지 체력인지는
-- 평균값이 아니라 문장으로만 전달된다. 투표(difficulty_votes)와 분리된 이유.
--
-- 클리어 게이트를 걸지 않는다 — 못 깬 사람의 "여기서 막힌다"도 정보다.
-- 대신 목록에 클리어 여부를 함께 내보내 읽는 쪽이 가중치를 판단한다.
CREATE TABLE chart_comments (
  id         SERIAL PRIMARY KEY,
  chart_id   INTEGER NOT NULL REFERENCES charts(id)  ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  -- 채보 성향 태그 (폭타 / 틀기 / 체력 …). 앱의 화이트리스트로 검증한다.
  tags       TEXT[]  NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1인 1평가. 수정은 UPSERT.
  UNIQUE (chart_id, player_id)
);

CREATE INDEX chart_comments_chart_idx ON chart_comments (chart_id, created_at DESC);
