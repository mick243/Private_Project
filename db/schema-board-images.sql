-- ============================================================
-- 게시글 이미지 첨부 · 스키마
--
-- schema-board.sql 이 먼저 적용된 상태를 전제로 합니다.
--
-- ⚠ 왜 schema-board.sql 안에 넣지 않았나
--   스키마 그룹은 sentinel 테이블이 이미 있으면 그 그룹을 건너뜁니다(lib/db.ts).
--   post_images 를 schema-board.sql 에 넣으면 기존 DB 는 영원히 그 테이블을 못 받고,
--   sentinel 을 post_images 로 바꾸면 그룹 전체가 다시 적용되면서 이미 쓴 글이
--   삭제됩니다. 그래서 **새 그룹**으로 분리합니다 — 기존 DB 는 이 파일만 따라잡습니다.
-- ============================================================

DROP TABLE IF EXISTS post_images CASCADE;

CREATE TABLE post_images (
  id SERIAL PRIMARY KEY,

  -- NULL = 업로드는 됐지만 아직 어느 글에도 붙지 않은 상태.
  -- 이미지는 글보다 먼저 올라갑니다(작성 중에 업로드 → 저장할 때 붙임). 그래서
  -- post_id 가 NOT NULL 일 수 없습니다. 글을 지우면 CASCADE 로 함께 사라집니다.
  post_id   INTEGER          REFERENCES posts(id)   ON DELETE CASCADE,
  -- 올린 사람. 남의 업로드를 자기 글에 붙이지 못하게 확인하는 데 씁니다.
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- 스토리지 키. 로컬은 uploads/posts/<sha256>.<ext>, S3 로 가면 오브젝트 키.
  -- 내용 해시를 파일명으로 쓰므로 같은 이미지를 여러 사람이 올려도 파일은 하나입니다.
  -- (행은 각자 생깁니다 — 누가 어느 글에 붙였는지가 달라서 UNIQUE 를 걸지 않습니다.)
  storage_key TEXT    NOT NULL,
  mime        TEXT    NOT NULL,
  bytes       INTEGER NOT NULL,

  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX post_images_post_idx ON post_images (post_id, sort_order, id);

-- 글에 붙지 않고 남은 업로드를 찾는 인덱스.
-- 작성하다 그만두면 여기 쌓입니다. 지금은 청소하는 배치가 없습니다 — 넣을 때는
-- 이 인덱스로 created_at 이 오래된 것부터 파일과 함께 지우면 됩니다.
CREATE INDEX post_images_orphan_idx ON post_images (created_at) WHERE post_id IS NULL;
