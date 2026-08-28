'use client';

import { useEffect, useState } from 'react';
import { chartTagsFor, timeAgo } from '@/lib/community-types';
import type { ChartDetail } from '@/lib/tier-types';

interface Props {
  chart: ChartDetail;
  playerId: number | null;
  onChanged: (chart: ChartDetail) => void;
}

const MAX_TAGS = 4;

/**
 * 채보 평가.
 *
 * 투표(슬라이더)가 "얼마나 어렵냐" 라면 이쪽은 "왜 어렵냐" 입니다.
 * 태그를 고정 목록으로 두는 이유는 lib/community-types.ts CHART_TAGS 주석 참고.
 */
export default function ChartComments({ chart, playerId, onChanged }: Props) {
  const mine = playerId ? chart.comments.find((c) => c.playerId === playerId) : undefined;

  // 고를 수 있는 태그는 게임마다 다르다 — 펌프는 발판(떨기·틀기…), 사볼은 손(지력·건반…).
  const tagOptions = chartTagsFor(chart.machineId);

  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // 채보를 바꾸거나 내 평가가 바뀌면 폼을 그 상태로 되돌린다.
  useEffect(() => {
    setBody(mine?.body ?? '');
    setTags(mine?.tags ?? []);
    setEditing(false);
    setError(null);
  }, [chart.id, mine?.id, mine?.updatedAt]);

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length >= MAX_TAGS
          ? prev
          : [...prev, tag],
    );

  const save = async () => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/charts/${chart.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, body: body.trim(), tags }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details?.[0] ?? data.error ?? '저장에 실패했습니다');
        return;
      }
      onChanged(data.chart as ChartDetail);
      setEditing(false);
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
      const res = await fetch(`/api/charts/${chart.id}/comments?playerId=${playerId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        onChanged(data.chart as ChartDetail);
        setBody('');
        setTags([]);
      }
    } finally {
      setBusy(false);
    }
  };

  const showForm = !mine || editing;

  return (
    <div className="section">
      <h3>
        채보 평가 <span className="muted small">{chart.comments.length}개</span>
      </h3>

      {!playerId ? (
        <p className="muted small">로그인하면 평가를 남길 수 있습니다.</p>
      ) : showForm ? (
        <div className="comment-form">
          <div className="tag-row">
            {tagOptions.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip ${tags.includes(t) ? 'is-on' : ''}`}
                disabled={busy || (!tags.includes(t) && tags.length >= MAX_TAGS)}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            maxLength={1000}
            placeholder="어디가 어떻게 어려운지 (예: 후반 폭타에서 체력이 빠진다)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || body.trim().length < 2}
              onClick={save}
            >
              {mine ? '수정' : '등록'}
            </button>
            {mine && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                취소
              </button>
            )}
          </div>
          {error && <p className="warn">{error}</p>}
          <p className="hint">
            클리어하지 않아도 남길 수 있습니다 — 막힌 지점도 정보입니다. 목록에는 클리어 여부가
            함께 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            내 평가 수정
          </button>
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={remove}>
            삭제
          </button>
        </div>
      )}

      {chart.comments.length === 0 ? (
        <p className="muted small">아직 평가가 없습니다.</p>
      ) : (
        <ul className="comment-list">
          {chart.comments.map((c) => (
            <li key={c.id} className={c.playerId === playerId ? 'is-mine' : ''}>
              <div className="comment-head">
                <strong>{c.nickname}</strong>
                {c.cleared ? (
                  <span className="tag tag-clear">클리어</span>
                ) : (
                  <span className="tag tag-noclear">미클리어</span>
                )}
                <span className="muted small">{timeAgo(c.updatedAt)}</span>
              </div>
              {c.tags.length > 0 && (
                <div className="tag-row">
                  {c.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="comment-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
