'use client';

import { useCallback, useEffect, useState } from 'react';
import { timeAgo, type ArcadeReview } from '@/lib/community-types';
import type { Arcade } from '@/lib/types';
import { usePlayerId } from '@/lib/use-player';
import StarRating from './StarRating';

interface Props {
  arcade: Arcade;
  onArcadeChanged: (arcade: Arcade) => void;
}

export default function ArcadeReviews({ arcade, onArcadeChanged }: Props) {
  const playerId = usePlayerId();

  const [reviews, setReviews] = useState<ArcadeReview[]>([]);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetch(`/api/arcades/${arcade.id}/reviews`).then((r) => r.json());
    setReviews((data.reviews as ArcadeReview[]) ?? []);
  }, [arcade.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 오락실이나 플레이어가 바뀌면 내가 이미 쓴 리뷰를 폼에 채워 "수정" 이 되게 한다.
  const mine = playerId ? reviews.find((r) => r.playerId === playerId) : undefined;
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? '');
    setError(null);
  }, [mine?.id, mine?.rating, mine?.body]);

  const save = async () => {
    if (!playerId || rating === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/arcades/${arcade.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, rating, body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      setReviews(data.reviews as ArcadeReview[]);
      if (data.arcade) onArcadeChanged(data.arcade as Arcade);
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!playerId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/arcades/${arcade.id}/reviews?playerId=${playerId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setReviews(data.reviews as ArcadeReview[]);
        setRating(0);
        setBody('');
        if (data.arcade) onArcadeChanged(data.arcade as Arcade);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <h3>
        리뷰
        {arcade.reviewCount > 0 && (
          <span className="rating-inline">
            <StarRating value={arcade.ratingAvg} />
            <strong>{arcade.ratingAvg?.toFixed(1)}</strong>
            <span className="muted small">{arcade.reviewCount}개</span>
          </span>
        )}
      </h3>

      {!playerId ? (
        <p className="muted small">로그인하면 리뷰를 남길 수 있습니다.</p>
      ) : (
        <div className="review-form">
          <div className="review-form-head">
            <StarRating value={rating === 0 ? null : rating} onChange={setRating} disabled={busy} />
            <span className="muted small">{mine ? '내 리뷰 수정' : '평점을 선택하세요'}</span>
          </div>
          <textarea
            rows={3}
            maxLength={1000}
            placeholder="기체 상태, 대기, 접근성 등 다음 사람에게 도움될 내용"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || rating === 0}
              onClick={save}
            >
              {mine ? '수정' : '등록'}
            </button>
            {mine && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={remove}
              >
                삭제
              </button>
            )}
          </div>
          {error && <p className="warn">{error}</p>}
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="muted small">아직 리뷰가 없습니다.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className={r.playerId === playerId ? 'is-mine' : ''}>
              <div className="review-head">
                <StarRating value={r.rating} />
                <strong>{r.nickname}</strong>
                <span className="muted small">{timeAgo(r.updatedAt)}</span>
              </div>
              {r.body && <p className="review-body">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
