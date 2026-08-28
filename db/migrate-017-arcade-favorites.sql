-- ============================================================
-- 즐겨찾기 (arcade_favorites)
--
-- 사이드바를 처음 열었을 때 무엇을 보여 줄지가 이 테이블에서 갈립니다 —
-- 로그인했으면 내가 담아 둔 곳부터, 아니면 평점 높은 곳부터
-- (lib/arcades.ts listHighlightArcades).
--
-- 리뷰(arcade_reviews)와 달리 "1인 1행" 이면 그걸로 끝이라 본문도 수정도
-- 없습니다. 그래서 (player_id, arcade_id) 자체가 PK 이고, 토글은 INSERT ...
-- ON CONFLICT DO NOTHING / DELETE 두 줄로 끝납니다.
--
-- created_at 을 남기는 이유: 즐겨찾기가 5곳을 넘으면 무엇을 먼저 보여 줄지
-- 정할 근거가 필요합니다. 이름순은 "방금 담은 곳" 을 목록 밖으로 밀어냅니다.
-- ============================================================

CREATE TABLE IF NOT EXISTS arcade_favorites (
  player_id  INTEGER     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  arcade_id  INTEGER     NOT NULL REFERENCES arcades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, arcade_id)
);

-- "내 즐겨찾기, 최근에 담은 순" 이 유일한 조회 패턴이다.
CREATE INDEX IF NOT EXISTS arcade_favorites_player_idx
  ON arcade_favorites (player_id, created_at DESC);
