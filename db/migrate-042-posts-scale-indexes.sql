-- ============================================================
-- 042 · 글이 많아졌을 때를 위한 인덱스 두 개.
--
-- 글 5만 건을 임시 테이블에 넣고 EXPLAIN ANALYZE 로 재서 고른 것들입니다
-- (근거·수치는 PERFORMANCE.md).
--
--   검색 ILIKE '%말%'   416ms → 1.5ms    trigram GIN
--   '인기글' 정렬         9.0ms → 0.074ms  복합 인덱스
--
-- 30건일 때는 둘 다 티가 안 납니다. 어차피 전부 읽어도 순식간이라 플래너가
-- 인덱스를 쳐다보지도 않습니다. 글이 쌓인 뒤에 효과가 납니다.
-- ============================================================

-- ── '인기글' 정렬 ────────────────────────────────────────────
-- 최신순은 posts_recent_idx 가 받아 주는데 인기순은 받아 줄 인덱스가 없어서,
-- 조건에 맞는 글을 전부 읽고 정렬한 뒤 20건만 잘라내고 있었습니다.
-- 정렬 키 순서는 lib/board.ts 의 ORDER.popular 과 **같아야** 인덱스를 탑니다.
CREATE INDEX IF NOT EXISTS posts_popular_idx
  ON posts (like_count DESC, comment_count DESC, created_at DESC);

-- ── 제목·본문 검색 ───────────────────────────────────────────
-- `ILIKE '%말%'` 는 앞에 와일드카드가 있어 어떤 btree 도 못 탑니다. trigram GIN 은
-- 글자를 3개씩 쪼개 넣어 두므로 가운데 낀 말도 인덱스로 찾습니다.
-- 쿼리는 한 글자도 안 고칩니다 — 플래너가 알아서 Bitmap Index Scan 으로 바꿉니다.
--
-- PGlite(폴백 엔진)에는 pg_trgm 이 없을 수 있습니다. 그때는 인덱스를 건너뛰고
-- 지금까지처럼 전체 스캔으로 동작합니다 — 없으면 느릴 뿐 틀리지는 않습니다.
-- 확장을 못 만들어 마이그레이션 전체가 실패하면 폴백 DB 가 아예 안 뜹니다.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[042] pg_trgm 을 만들 수 없어 검색 인덱스를 건너뜁니다 (%)', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS posts_body_trgm_idx  ON posts USING gin (body  gin_trgm_ops);
  END IF;
END $$;

-- 운영 DB 가 이미 커진 뒤에 적용한다면 CREATE INDEX 가 쓰기를 막습니다.
-- 그때는 이 파일을 돌리지 말고 psql 에서 CONCURRENTLY 로 따로 만드세요
-- (CONCURRENTLY 는 트랜잭션 안에서 못 돌아서 여기에 넣을 수 없습니다).
