-- ============================================================
-- 커뮤니티 게시판 · 스키마
--
-- 게임별 탭으로 나뉩니다. "펌프 게시판", "사볼 게시판" 처럼 테이블을 나누지 않고
-- posts.machine_id 로 구분합니다 — 게임이 늘어날 때마다 테이블을 만들면 "전체"
-- 탭이 10-way UNION 이 되고, 새 게임을 붙이는 데 마이그레이션이 필요해집니다.
--
-- 글은 게임 하나에 속하고, '전체' 탭은 저장 구조가 아니라 **필터를 걸지 않은
-- 조회**입니다. 예외는 공지입니다 — 커뮤니티 전체의 알림이라 게임에 속하지 않을
-- 수 있고(machine_id NULL), 그 규칙은 코드가 지킵니다
-- (db/migrate-017-notice-without-game.sql · lib/validation.ts).
--
-- schema.sql (machines) 과 schema-tier.sql (players) 이 먼저 적용된 상태를 전제로 합니다.
-- ============================================================

DROP TABLE IF EXISTS post_likes       CASCADE;
DROP TABLE IF EXISTS post_comments    CASCADE;
DROP TABLE IF EXISTS posts            CASCADE;
DROP TABLE IF EXISTS board_categories CASCADE;
DROP FUNCTION IF EXISTS recalc_post_stats(integer);

-- ─── 말머리 ────────────────────────────────────────────────
-- 코드가 아니라 테이블에 두면 배포 없이 말머리를 늘릴 수 있습니다.
-- CHECK 제약으로 박아 두면 '대회' 하나 추가하는 데 마이그레이션이 필요합니다.
CREATE TABLE board_categories (
  code       TEXT    PRIMARY KEY,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE
);

-- ─── 글 ────────────────────────────────────────────────────
CREATE TABLE posts (
  id         SERIAL  PRIMARY KEY,
  -- NULL = 게임에 속하지 않는 글 (지금은 공지만).
  machine_id INTEGER          REFERENCES machines(id)        ON DELETE CASCADE,
  category   TEXT    NOT NULL REFERENCES board_categories(code),
  player_id  INTEGER NOT NULL REFERENCES players(id)         ON DELETE CASCADE,

  title TEXT NOT NULL,
  -- 평문 본문. 서식 있는 글에서도 채워집니다 — 목록 미리보기·검색·챗봇이 이 값을
  -- 보고, 이미지가 어디 붙는지의 근거인 `[[image:N]]` 마커도 여기 있습니다.
  body  TEXT NOT NULL,
  -- 서식 있는 본문(JSON 문서 트리). NULL = 서식 없이 쓰인 글 → 화면이 body 를
  -- 그대로 그립니다. 저장 전에 스키마 밖의 노드·속성이 버려집니다
  -- (lib/rich-text.ts normalizeDoc). db/migrate-016-post-body-doc.sql 참고.
  body_doc JSONB,

  -- ── 집계 캐시 ──
  -- 목록 화면은 글 30건마다 "댓글 수 / 추천 수"를 함께 보여줍니다. 매번 COUNT 를
  -- 돌리면 목록 조회가 글 수 × 2 번의 집계가 되므로, charts 의 vote_count 와 같은
  -- 방식으로 캐시하고 댓글·추천이 바뀔 때만 갱신합니다.
  comment_count INTEGER NOT NULL DEFAULT 0,
  like_count    INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 게임 탭 + 최신순. '전체' 탭은 machine_id 조건 없이 created_at 만 탑니다.
CREATE INDEX posts_board_idx    ON posts (machine_id, created_at DESC);
CREATE INDEX posts_recent_idx   ON posts (created_at DESC);
CREATE INDEX posts_category_idx ON posts (machine_id, category, created_at DESC);

-- ─── 댓글 ──────────────────────────────────────────────────
-- 채보 평가(chart_comments)와 달리 1인 1건 제약이 없습니다 — 대화니까요.
CREATE TABLE post_comments (
  id         SERIAL  PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id)   ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX post_comments_post_idx ON post_comments (post_id, created_at);

-- ─── 추천 ──────────────────────────────────────────────────
-- 1인 1추천. 카운터 컬럼만 두고 +1 하면 같은 사람이 반복 추천할 수 있고,
-- "내가 이미 추천했나"를 표시할 수도 없습니다.
CREATE TABLE post_likes (
  post_id    INTEGER NOT NULL REFERENCES posts(id)   ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, player_id)
);

-- ─── 집계 함수 ─────────────────────────────────────────────
-- p_post_id 가 NULL 이면 전체 재계산(배치/시드용), 값이 있으면 그 글만.
-- recalc_chart_stats / recalc_arcade_rating 과 같은 패턴입니다.
--
-- view_count 는 여기서 건드리지 않습니다 — 파생값이 아니라 누적 카운터라서
-- 다시 계산할 원본이 없습니다 (조회 로그를 남기지 않기로 했으므로).
CREATE FUNCTION recalc_post_stats(p_post_id integer) RETURNS void
LANGUAGE sql AS $fn$
  UPDATE posts p SET
    comment_count = s.comments,
    like_count    = s.likes
  FROM (
    SELECT p2.id AS post_id,
           (SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id = p2.id) AS comments,
           (SELECT COUNT(*)::int FROM post_likes    l WHERE l.post_id = p2.id) AS likes
    FROM posts p2
    WHERE p_post_id IS NULL OR p2.id = p_post_id
  ) s
  WHERE p.id = s.post_id;
$fn$;
