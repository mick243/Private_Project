'use client';

import { POPULAR_MIN_LIKES, type PostSummary } from '@/lib/board-types';
import { timeAgo } from '@/lib/community-types';

interface Props {
  posts: PostSummary[];
  /**
   * 맨 위에 고정되는 공지. `posts` 와 겹치지 않고 페이지를 넘겨도 그대로 붙어
   * 있습니다 (lib/board.ts listPosts). 공지 말머리를 직접 고른 목록에서는
   * 비어 있습니다 — 그 목록 자체가 공지라서 고정할 이유가 없습니다.
   */
  notices: PostSummary[];
  loading: boolean;
  total: number;
  /** '전체' 탭에서만 게임 뱃지를 보여준다 */
  showGame: boolean;
  /**
   * 인기글 필터가 걸린 상태. 목록이 비었을 때 "첫 글을 남겨 보세요" 라고 하면
   * 거짓말이 된다 — 글은 있고, 추천 기준을 넘은 게 없을 뿐이다.
   */
  popularOnly: boolean;
  /** 검색어가 걸린 상태. popularOnly 와 같은 이유로 빈 목록 문구가 달라진다. */
  searching: boolean;
  onOpen: (postId: number) => void;
}

interface RowProps {
  post: PostSummary;
  showGame: boolean;
  notice?: boolean;
  onOpen: (postId: number) => void;
}

function PostRow({ post: p, showGame, notice = false, onOpen }: RowProps) {
  return (
    <li className={notice ? 'is-notice' : undefined} onClick={() => onOpen(p.id)}>
      <div className="post-row-head">
        {/* 게임 없는 글(공지)은 뱃지 자리를 비워 둔다 — machineShortName 이 null 이다 */}
        {showGame && p.machineShortName && (
          <span className="badge badge-rhythm">{p.machineShortName}</span>
        )}
        <span className={`cat cat-${p.category}`}>{p.categoryLabel}</span>
        <h3>{p.title}</h3>
      </div>

      <p className="post-excerpt">{p.excerpt}</p>

      <div className="post-meta muted small">
        <span>{p.nickname}</span>
        <span>{timeAgo(p.createdAt)}</span>
        <span className={p.myLike ? 'stat-like is-on' : 'stat-like'}>추천 {p.likeCount}</span>
        <span>댓글 {p.commentCount}</span>
        <span>조회 {p.viewCount}</span>
      </div>
    </li>
  );
}

/**
 * 목록이 비었을 때 뭐라고 할지. 걸린 조건마다 이유가 다르므로 문구도 달라야
 * 한다 — 어느 경우든 "아직 글이 없습니다" 로 뭉치면, 사용자는 조건을 풀어 보는
 * 대신 게시판이 비었다고 믿고 나간다.
 */
function emptyMessage(searching: boolean, popularOnly: boolean): string {
  if (searching && popularOnly)
    return `추천 ${POPULAR_MIN_LIKES}개 이상 받은 글 중에는 검색 결과가 없습니다.`;
  if (searching) return '검색 결과가 없습니다.';
  if (popularOnly) return `추천 ${POPULAR_MIN_LIKES}개 이상 받은 글이 아직 없습니다.`;
  return '아직 글이 없습니다. 이 게시판의 첫 글을 남겨 보세요.';
}

export default function PostList({
  posts,
  notices,
  loading,
  total,
  showGame,
  popularOnly,
  searching,
  onOpen,
}: Props) {
  if (loading && posts.length === 0 && notices.length === 0)
    return <p className="muted pad">불러오는 중…</p>;

  return (
    <>
      {notices.length > 0 && (
        <>
          {/* 고정 공지는 게임 뱃지를 달지 않는다 — 모든 게임 탭에 같이 뜨므로
              "어느 게시판에 썼는지" 는 읽는 사람에게 뜻이 없고, 다른 게임 탭에서는
              엉뚱한 뱃지로 보인다. */}
          <ul className="post-list">
            {notices.map((p) => (
              <PostRow key={p.id} post={p} showGame={false} notice onOpen={onOpen} />
            ))}
          </ul>

          {/* 공지와 일반 글을 가르는 굵은 선 */}
          <div className="notice-rule" />
        </>
      )}

      {posts.length === 0 ? (
        <p className="muted pad">{emptyMessage(searching, popularOnly)}</p>
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} showGame={showGame} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </>
  );
}
