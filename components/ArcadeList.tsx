'use client';

import { memo } from 'react';
import type { ScoredArcade } from '@/lib/recommend';
import { formatDistance } from '@/lib/geo';
import type { Arcade, ArcadeCabinet } from '@/lib/types';
import { WaitBadge } from './LiveBadge';
import StarRating from './StarRating';

interface Props {
  /** 거리까지 계산해 둔 목록 (lib/recommend.ts rankArcades) */
  items: ScoredArcade[];
  loading: boolean;
  selectedId: number | null;
  /** 관리자일 때만 행에 수정·삭제가 붙는다 (판정은 서버가 한 번 더 한다) */
  canEdit: boolean;
  /**
   * 로그인했을 때만 별이 붙는다. 비로그인에 회색 별을 띄우면 눌러도 아무 일이
   * 없는 버튼이 되고, 왜 안 되는지는 그 자리에 적을 곳이 없다 —
   * 대신 목록 머리글이 "로그인하면 즐겨찾기" 를 말한다 (ArcadeFinder).
   */
  canFavorite: boolean;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void;
  onSelect: (id: number) => void;
  /** 선택 해제 — 지도 강조(확대 핀)를 끄고 평범한 좌표 마커로 되돌린다 */
  onClearSelect: () => void;
  onEdit: (arcade: Arcade) => void;
  onDelete: (arcade: Arcade) => void;
  /**
   * 비어 있을 때 할 말. 기본값은 검색·필터를 걸었을 때의 말이라, 아무 조건도
   * 걸지 않은 첫 화면에서는 맞지 않는다 ("조건에 맞는" 조건이 없다).
   *
   * `null` 이면 아무것도 그리지 않는다 — 보여 줄 것이 없는 첫 화면은 빈 자리로
   * 둔다. 없는 것을 설명하는 한 줄이 그 자리를 채우면 그게 화면의 내용이 된다.
   */
  emptyMessage?: string | null;
}

/**
 * 목록에 찍을 기체 1대의 컨디션 — 등록값과 제보를 종합해 반올림한 값.
 * 종합·반올림은 db/views.sql 의 cabinet_condition 이 하므로 그대로 쓴다.
 */
function cabinetCondition(c: ArcadeCabinet): number | null {
  return c.conditionSummary?.value ?? null;
}

function hours(a: Arcade): string {
  if (a.is24h) return '24시간';
  if (a.openTime && a.closeTime) return `${a.openTime} ~ ${a.closeTime}`;
  return '영업시간 미등록';
}

/**
 * memo 인 이유: 부모(ArcadeFinder)는 검색어 타이핑·상세 패널 조작 등 목록과
 * 무관한 이유로도 다시 렌더된다. 줄마다 뱃지·별점·대기 표시가 달려 있어
 * 공짜가 아니다. items 는 부모가 useMemo 로, 콜백들은 useCallback 으로
 * 참조를 지켜 준다 — 여기만 memo 를 씌워서는 아무것도 아끼지 못한다.
 */
export default memo(ArcadeList);

function ArcadeList({
  items,
  loading,
  selectedId,
  canEdit,
  canFavorite,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onClearSelect,
  onEdit,
  onDelete,
  emptyMessage = '조건에 맞는 오락실이 없습니다.',
}: Props) {
  if (loading) return <p className="muted pad">불러오는 중…</p>;
  if (items.length === 0) {
    return emptyMessage === null ? null : <p className="muted pad">{emptyMessage}</p>;
  }

  return (
    <ul className="arcade-list">
      {items.map((scored) => {
        const a = scored.arcade;
        return (
          <li
            key={a.id}
            className={a.id === selectedId ? 'is-selected' : ''}
            onClick={() => onSelect(a.id)}
          >
            <div className="arcade-head">
              <h3>{a.name}</h3>
              {scored.distanceKm !== null && (
                <span className="distance">{formatDistance(scored.distanceKm)}</span>
              )}
              {canFavorite && (
                <button
                  type="button"
                  className={`fav-btn ${isFavorite(a.id) ? 'is-on' : ''}`}
                  aria-pressed={isFavorite(a.id)}
                  title={isFavorite(a.id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
                  onClick={(e) => {
                    // 행 전체가 '선택' 이다 — 별을 눌렀는데 상세까지 열리면
                    // 담기만 하려던 사람의 화면이 통째로 바뀐다.
                    e.stopPropagation();
                    onToggleFavorite(a.id);
                  }}
                >
                  {isFavorite(a.id) ? '★' : '☆'}
                </button>
              )}
            </div>

            <p className="address">{a.address}</p>
            <p className="hours">
              {hours(a)}
              {a.phone && <span className="dot-sep">{a.phone}</span>}
              {a.reviewCount > 0 && (
                <span className="dot-sep rating-inline">
                  <StarRating value={a.ratingAvg} />
                  {a.ratingAvg?.toFixed(1)} ({a.reviewCount})
                </span>
              )}
            </p>

            {a.machines.length > 0 && (
              <div className="badges">
                {/* 점 하나 = 기체 한 대. 2대인데 한 대만 빨간 점이면 목록에서
                    바로 보인다 — 기종당 점 하나로 뭉치면 그게 사라진다. */}
                {a.machines.map((m) => (
                  <span
                    key={m.id}
                    className={`badge badge-${m.category}`}
                    title={[
                      `${m.name} · ${m.cabinetCount}대`,
                      ...m.cabinets.map((c) => {
                        const v = cabinetCondition(c);
                        return `${c.cabinetNo}호기 ${v === null ? '컨디션 모름' : `${v}/5`}`;
                      }),
                    ].join(' · ')}
                  >
                    {m.shortName}
                    {m.cabinetCount > 1 && <em>×{m.cabinetCount}</em>}
                    {m.cabinets.map((c) => {
                      const v = cabinetCondition(c);
                      return v === null ? null : <i key={c.id} className={`cond cond-${v}`} />;
                    })}
                  </span>
                ))}
              </div>
            )}

            {/* TTL 안의 대기 제보가 있는 기종만. 목록에서 "지금 갈 수 있나"가 먼저 보여야 한다. */}
            {a.machines.some((m) => m.live && m.live.waitCount !== null) && (
              <div className="wait-row">
                {a.machines
                  .filter((m) => m.live && m.live.waitCount !== null)
                  .map((m) => (
                    <span key={m.id} className="wait-item">
                      <span className="wait-name">{m.shortName}</span>
                      <WaitBadge live={m.live} cabinets={m.cabinetCount} compact />
                    </span>
                  ))}
              </div>
            )}

            {a.note && <p className="note">{a.note}</p>}

            {/* 관리자의 수정·삭제와 선택 해제가 같은 줄에 앉는다. 해제는
                선택된 행에만, 오른쪽 끝에 — 행을 다시 눌러도 해제되지
                않으므로(재선택이다) 끄는 버튼이 따로 있어야 한다. 누르면
                지도 강조가 꺼지고 평범한 좌표 마커만 남는다. */}
            {(canEdit || a.id === selectedId) && (
              <div className="row-actions">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(a);
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(a);
                      }}
                    >
                      삭제
                    </button>
                  </>
                )}
                {a.id === selectedId && (
                  <button
                    type="button"
                    className="btn btn-sm unselect-btn"
                    title="선택 해제 — 지도의 강조 표시를 끕니다"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearSelect();
                    }}
                  >
                    위치 찾기 취소
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
