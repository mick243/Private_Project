'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COMMENTS_PAGE_SIZE, type PostDetail } from '@/lib/board-types';
import { timeAgo } from '@/lib/community-types';
import { usePlayerId } from '@/lib/use-player';
import { useIsAdmin } from '@/lib/use-session';
import Pagination from './Pagination';
import PostBody from './PostBody';

interface Props {
  postId: number;
  onBack: () => void;
  onEdit: (post: PostDetail) => void;
  onDeleted: () => void;
}

export default function PostDetailView({ postId, onBack, onEdit, onDeleted }: Props) {
  const playerId = usePlayerId();
  /** 관리자는 남의 글·댓글도 지울 수 있다. 수정은 본인만 — 삭제와 달리 남의
   *  이름으로 남는 글의 내용이 바뀌는 일이라서. 판정은 서버가 한 번 더 한다. */
  const isAdmin = useIsAdmin();

  const [post, setPost] = useState<PostDetail | null>(null);
  /** 1-based. 서버가 범위를 벗어난 페이지를 당겨 주면 그 값으로 맞춘다 */
  const [commentPage, setCommentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 조회수는 글 하나를 처음 열 때만 올린다 (페이지 이동·추천에는 올리지 않음) */
  const viewedPostId = useRef<number | null>(null);

  /** 응답의 post 를 반영하고, 서버가 조정한 댓글 페이지로 맞춘다 */
  const applyPost = useCallback(
    (next: PostDetail) => {
      setPost(next);
      const serverPage = Math.floor(next.commentOffset / COMMENTS_PAGE_SIZE) + 1;
      setCommentPage((prev) => (prev === serverPage ? prev : serverPage));
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        commentOffset: String((commentPage - 1) * COMMENTS_PAGE_SIZE),
      });
      if (playerId) params.set('playerId', String(playerId));
      if (viewedPostId.current !== postId) {
        params.set('view', '1');
        viewedPostId.current = postId;
      }

      const data = await fetch(`/api/posts/${postId}?${params}`).then((r) => r.json());
      if (data.post) applyPost(data.post as PostDetail);
      else setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId, commentPage, playerId, applyPost]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (res.status === 204) return true;
      const data = await res.json();
      if (!res.ok) {
        setError(data.details?.[0] ?? data.error ?? '요청에 실패했습니다');
        return false;
      }
      if (data.post) applyPost(data.post as PostDetail);
      return true;
    } catch {
      setError('네트워크 오류');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const currentOffset = (commentPage - 1) * COMMENTS_PAGE_SIZE;

  const toggleLike = () =>
    send(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 추천을 눌렀다고 댓글이 1페이지로 돌아가지 않게 현재 페이지를 알려준다
      body: JSON.stringify({ playerId, commentOffset: currentOffset }),
    });

  const addComment = async () => {
    // 서버가 방금 쓴 댓글이 있는 마지막 페이지를 담아 돌려준다.
    const ok = await send(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, body: comment.trim() }),
    });
    if (ok) setComment('');
  };

  // 관리자는 playerId 없이도 지울 수 있으므로(근거가 세션 쿠키) 없으면 뺀다 —
  // playerId=null 이라는 문자열을 서버에 보내지 않기 위해서.
  const withPlayer = (params: URLSearchParams) => {
    if (playerId) params.set('playerId', String(playerId));
    return params;
  };

  const removeComment = (commentId: number) =>
    send(
      `/api/posts/${postId}/comments?${withPlayer(
        new URLSearchParams({
          commentId: String(commentId),
          commentOffset: String(currentOffset),
        }),
      )}`,
      { method: 'DELETE' },
    );

  const removePost = async () => {
    if (!confirm('이 글을 삭제할까요? 댓글도 함께 지워지고 되돌릴 수 없습니다.')) return;
    const ok = await send(`/api/posts/${postId}?${withPlayer(new URLSearchParams())}`, {
      method: 'DELETE',
    });
    if (ok) onDeleted();
  };

  if (loading && !post) return <p className="muted pad">불러오는 중…</p>;
  if (!post) return <p className="muted pad">글을 찾을 수 없습니다.</p>;

  const isMine = playerId !== null && post.playerId === playerId;

  return (
    <article className="post-detail">
      <div className="post-detail-nav">
        <button type="button" className="btn btn-sm" onClick={onBack}>
          글 목록
        </button>
        {(isMine || isAdmin) && (
          <div className="row-actions">
            {isMine && (
              <button type="button" className="btn btn-sm" onClick={() => onEdit(post)}>
                수정
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busy}
              title={!isMine && isAdmin ? '관리자 권한으로 남의 글을 삭제합니다' : undefined}
              onClick={removePost}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      <header className="post-detail-head">
        <div className="post-row-head">
          {/* 게임 없는 공지에는 뱃지가 없다 (lib/board-types.ts machineId 주석) */}
          {post.machineShortName && (
            <span className="badge badge-rhythm" title={post.machineName ?? undefined}>
              {post.machineShortName}
            </span>
          )}
          <span className={`cat cat-${post.category}`}>{post.categoryLabel}</span>
        </div>
        <h1>{post.title}</h1>
        <p className="muted small">
          {post.nickname} · {timeAgo(post.createdAt)}
          {post.updatedAt !== post.createdAt && ` (수정 ${timeAgo(post.updatedAt)})`} · 조회{' '}
          {post.viewCount}
        </p>
      </header>

      {/* 첨부는 본문 안 마커 위치에 들어간다 (components/PostBody.tsx) */}
      <PostBody body={post.body} bodyDoc={post.bodyDoc} attachments={post.attachments} />

      <div className="post-actions">
        <button
          type="button"
          className={post.myLike ? 'btn btn-on btn-sm' : 'btn btn-sm'}
          disabled={busy || !playerId}
          title={playerId ? undefined : '로그인이 필요합니다'}
          onClick={toggleLike}
        >
          추천 {post.likeCount}
        </button>
      </div>

      {error && <p className="warn">{error}</p>}

      <section className="section">
        <h3>댓글 {post.commentCount}개</h3>

        {post.commentCount === 0 ? (
          <p className="muted small">아직 댓글이 없습니다.</p>
        ) : (
          <>
            <ul className="comment-list">
              {post.comments.map((c, i) => (
                <li key={c.id} className={c.playerId === playerId ? 'is-mine' : ''}>
                  <div className="comment-head">
                    <span className="comment-no muted small">{post.commentOffset + i + 1}</span>
                    <strong>{c.nickname}</strong>
                    <span className="muted small">{timeAgo(c.createdAt)}</span>
                    {(c.playerId === playerId || isAdmin) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger comment-del"
                        disabled={busy}
                        title={
                          c.playerId !== playerId && isAdmin
                            ? '관리자 권한으로 남의 댓글을 삭제합니다'
                            : undefined
                        }
                        onClick={() => removeComment(c.id)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="comment-body">{c.body}</p>
                </li>
              ))}
            </ul>

            <Pagination
              page={commentPage}
              total={post.commentCount}
              pageSize={COMMENTS_PAGE_SIZE}
              onChange={setCommentPage}
            />
          </>
        )}

        {/* 댓글 목록과 작성 폼은 구분선으로 떼어 놓는다 — 붙어 있으면 마지막 댓글이
            입력창의 일부처럼 읽힌다 (.comment-write 의 border-top / margin) */}
        {!playerId ? (
          <p className="comment-write muted small">
            로그인하면 댓글을 쓸 수 있습니다.
          </p>
        ) : (
          <div className="comment-write">
            <div className="comment-form">
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="댓글 남기기"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || comment.trim().length === 0}
                  onClick={addComment}
                >
                  등록
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
