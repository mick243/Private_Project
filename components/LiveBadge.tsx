'use client';

import {
  timeAgo,
  waitCountLabel,
  waitLevel,
  type CabinetCondition,
  type MachineLive,
} from '@/lib/community-types';

/**
 * "지금 대기" 뱃지.
 *
 * 유효한 제보가 없으면 아무것도 그리지 않습니다 — 빈 자리는 "정보 없음"이고,
 * '0명' 은 "가면 바로 할 수 있다"는 전혀 다른 주장입니다.
 */
export function WaitBadge({
  live,
  cabinets,
  compact,
}: {
  live: MachineLive | null;
  /**
   * 그 기종의 기체 대수. 구간('보통'·'많음')은 **기체당 인원**으로 정해지므로
   * (lib/community-types.ts WAIT_LEVELS) 대수를 넘겨야 같은 값이 나옵니다.
   * 넘기지 않으면 1대로 봅니다 — 모를 때는 불리하게 잡습니다.
   */
  cabinets?: number | null;
  compact?: boolean;
}) {
  if (!live || live.waitCount === null) return null;

  const count = live.waitCount;
  const { label, tone } = waitLevel(count, cabinets);

  return (
    <span
      className={`wait wait-${tone}`}
      title={
        live.waitReports > 1
          ? `제보 ${live.waitReports}건 중 가장 많이 본 값`
          : '제보 1건'
      }
    >
      {/* 뷰가 고른 최대값이 그대로 내려온다 (machine_live.wait_count) */}
      <strong>{waitCountLabel(count)}</strong>
      <em>{label}</em>
      {!compact && live.waitReportedAt && (
        <span className="wait-time">{timeAgo(live.waitReportedAt)}</span>
      )}
    </span>
  );
}

/**
 * **기체 1대**의 컨디션. 등록값과 제보를 한 덩어리로 종합한 값이라 뱃지가 하나뿐이다
 * — 예전에는 제보가 있으면 "컨디션 4.7", 없으면 "등록 컨디션 5/5" 로 같은 자리에
 * 뜻이 다른 두 숫자가 번갈아 나왔다. 집계·반올림은 db/views.sql cabinet_condition
 * 이 하므로 여기서 다시 가공하지 않는다.
 */
export function ConditionBadge({ summary }: { summary: CabinetCondition | null }) {
  if (!summary) return null;

  const { value, reports, reportedAt } = summary;
  return (
    <span
      className={`cond-live cond-${value}`}
      title={
        reports > 0
          ? `등록 컨디션 + 제보 ${reports}건 종합${
              reportedAt ? ` · 최근 제보 ${timeAgo(reportedAt)}` : ''
            }`
          : '등록 컨디션 (아직 제보 없음)'
      }
    >
      컨디션 {value}/5
      {/* 몇 사람이 확인한 값인지가 숫자만큼 중요하다. 등록값뿐이면 그렇다고 적는다. */}
      <em>{reports > 0 ? `${reports}건` : '등록값'}</em>
    </span>
  );
}
