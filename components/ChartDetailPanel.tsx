'use client';

import { useEffect, useState } from 'react';
import {
  UNDECIDED_CODE,
  UNIQUE_CODE,
  isSpecialChart,
  tierCodeOf,
} from '@/lib/tier-types';
import type { ChartDetail, TierGrade } from '@/lib/tier-types';
import ChartComments from './ChartComments';

interface Props {
  chart: ChartDetail;
  playerId: number | null;
  onChanged: (chart: ChartDetail) => void;
  onClose: () => void;
}

/**
 * 값에 가장 가까운 등급 anchor 의 인덱스.
 *
 * 정확히 두 anchor 의 중간이면 **0 에 가까운 쪽**(안쪽 등급)을 고른다. anchor 가
 * 좌우 대칭이므로 그래야 등급 띠도 좌우 대칭이 된다 — 펌프(anchor 0 · ±0.40)에서
 * '중' 은 -0.2 ~ 0.2 로 양 끝을 포함한다. sort_order 가 앞선 쪽을 집으면 동점이
 * 늘 '높은 등급' 으로 가서, 음수 쪽은 안쪽(-0.2 → 중)인데 양수 쪽은 바깥
 * (0.2 → 중상)으로 밀려 띠가 어긋난다.
 *
 * SQL 판정(recalc_chart_stats)도 같은 규칙이다 — 한쪽만 바꾸면 서열표에 배치된
 * 등급과 슬라이더가 보여주는 등급이 경계값에서 어긋난다.
 */
function nearestGradeIndex(grades: TierGrade[], value: number): number {
  let best = 0;
  for (let i = 1; i < grades.length; i++) {
    const gap = Math.abs(grades[i].anchor - value) - Math.abs(grades[best].anchor - value);
    const tie = Math.abs(gap) <= 1e-9;
    if (gap < -1e-9 || (tie && Math.abs(grades[i].anchor) < Math.abs(grades[best].anchor))) {
      best = i;
    }
  }
  return best;
}

/** 투표값을 가장 가까운 등급 anchor 로 버킷팅 (분포 히스토그램용) */
function bucketVotes(chart: ChartDetail): { label: string; count: number }[] {
  const buckets = chart.grades.map((g) => ({ label: g.label, count: 0 }));
  for (const v of chart.votes) buckets[nearestGradeIndex(chart.grades, v)].count += 1;
  return buckets;
}

function gradeLabelFor(chart: ChartDetail, value: number): string {
  return chart.grades[nearestGradeIndex(chart.grades, value)].label;
}

/** 투표로 계산된 등급 이름 (특수 패턴 여부와 무관) */
function voteGradeLabel(chart: ChartDetail): string {
  if (chart.tierCode === UNIQUE_CODE) return '개인차';
  if (chart.tierCode === UNDECIDED_CODE || chart.tierCode === null) return '미정';
  return chart.grades.find((g) => g.code === chart.tierCode)?.label ?? '미정';
}

/**
 * '현재 등급' 칸에 쓸 이름.
 *
 * 특수 패턴이면 **'특수패턴 / 투표등급'** 으로 둘 다 보여준다 — 서열표에서는
 * 특수패턴 칸에 있지만 투표로 계산된 등급도 그대로 살아 있어서, 한쪽만 보여주면
 * 정보가 사라진다. 칸을 가르는 규칙은 서버와 공유한다(tierCodeOf).
 */
function tierLabel(chart: ChartDetail): string {
  const grade = voteGradeLabel(chart);
  return isSpecialChart(chart, chart.settings) ? `특수패턴 / ${grade}` : grade;
}

export default function ChartDetailPanel({ chart, playerId, onChanged, onClose }: Props) {
  const { settings } = chart;
  // 눈금은 tier_step(등급 간격)이 아니라 vote_step 을 따른다. 등급 판정은
  // anchor 최근접이라 눈금을 잘게 해도 판정 구간은 그대로다.
  const step = settings.voteStep;

  const [draft, setDraft] = useState<number>(chart.myVote ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 채보를 고르면 슬라이더를 그 채보의 내 투표값으로 되돌린다.
  useEffect(() => {
    setDraft(chart.myVote ?? 0);
    setError(null);
  }, [chart.id, chart.myVote]);

  const post = async (url: string, body: unknown) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '요청에 실패했습니다');
        return;
      }
      onChanged(data.chart as ChartDetail);
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  const buckets = bucketVotes(chart);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <h2>{chart.title}</h2>
          <p className="muted small">
            {/* modeLabel 이 null 이면 난이도 미표기라 레벨만 붙인다 (migrate-047) */}
            {chart.artist ?? '아티스트 미상'} · {chart.machineName}{' '}
            {chart.modeLabel === null ? '' : `${chart.modeLabel} `}
            {chart.level}
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>현재 등급</span>
          <strong className={`tier-mark tier-${tierCodeOf(chart, chart.settings)}`}>
            {tierLabel(chart)}
          </strong>
        </div>
        <div className="stat">
          <span>평균 투표</span>
          <strong>{chart.avgVote === null ? '—' : chart.avgVote.toFixed(2)}</strong>
        </div>
        <div className="stat">
          <span>투표 수</span>
          <strong>{chart.voteCount}</strong>
        </div>
        <div className="stat">
          <span>수렴도</span>
          <strong>{chart.convergence === null ? '—' : chart.convergence.toFixed(2)}</strong>
        </div>
      </div>

      {chart.tierCode === 'undecided' && (
        <p className="hint">
          투표가 {settings.minVotes}건 미만이라 아직 등급이 정해지지 않았습니다.
        </p>
      )}
      {chart.tierCode === 'unique' && (
        <p className="hint">
          수렴도가 {settings.minConvergence} 미만 — 사람마다 체감이 크게 갈리는 채보입니다.
        </p>
      )}

      <div className="section">
        <h3>투표 분포</h3>
        {chart.votes.length === 0 ? (
          <p className="muted small">아직 투표가 없습니다.</p>
        ) : (
          <div className="histogram">
            {buckets.map((b) => (
              <div key={b.label} className="hist-col">
                <div className="hist-bar-wrap">
                  <div
                    className="hist-bar"
                    style={{ height: `${(b.count / maxCount) * 100}%` }}
                    title={`${b.label} ${b.count}표`}
                  />
                </div>
                <span className="hist-count">{b.count || ''}</span>
                <span className="hist-label">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h3>내 기록</h3>

        {!playerId ? (
          <p className="muted small">로그인하면 내 기록을 남길 수 있습니다.</p>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={chart.myClear}
                disabled={busy}
                onChange={(e) =>
                  post(`/api/charts/${chart.id}/clear`, {
                    playerId,
                    cleared: e.target.checked,
                  })
                }
              />
              <span>이 채보를 클리어했습니다</span>
            </label>

            {!chart.myClear ? (
              <p className="hint">
                클리어 기록이 있어야 체감 난이도에 투표할 수 있습니다. 클리어를 해제하면
                남긴 투표도 함께 삭제됩니다.
              </p>
            ) : (
              <div className="vote-box">
                <div className="vote-head">
                  <span className="muted small">체감 난이도</span>
                  <strong>
                    {draft.toFixed(2)}
                    <em className="vote-grade">{gradeLabelFor(chart, draft)}</em>
                  </strong>
                </div>

                <input
                  type="range"
                  min={settings.voteMin}
                  max={settings.voteMax}
                  step={step}
                  value={draft}
                  disabled={busy}
                  onChange={(e) => setDraft(Number(e.target.value))}
                />
                <div className="vote-scale">
                  <span>쉬움 {settings.voteMin.toFixed(1)}</span>
                  <span>{settings.voteMax.toFixed(1)} 어려움</span>
                </div>

                <div className="form-actions vote-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || draft === chart.myVote}
                    onClick={() => post(`/api/charts/${chart.id}/vote`, { playerId, value: draft })}
                  >
                    {chart.myVote === null ? '투표' : '수정'}
                  </button>
                  {chart.myVote !== null && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busy}
                      onClick={() => post(`/api/charts/${chart.id}/vote`, { playerId, value: null })}
                    >
                      투표 취소
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="warn">{error}</p>}
      </div>

      <div className="section">
        <h3>특수 패턴</h3>
        {!playerId ? (
          <p className="muted small">로그인하면 특수 패턴으로 표시할 수 있습니다.</p>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={chart.mySpecial}
                disabled={busy}
                onChange={(e) =>
                  post(`/api/charts/${chart.id}/special`, {
                    playerId,
                    special: e.target.checked,
                  })
                }
              />
              <span>특수 패턴 채보입니다</span>
            </label>
            <p className="hint">
              기믹·연출로 난이도가 정해지는 채보는 체감 난이도로 줄 세우기 어렵습니다.{' '}
              <strong>
                {settings.specialMin}명 이상
              </strong>
              이 표시하면 서열표의 &lsquo;특수패턴&rsquo; 칸으로 옮겨집니다 (지금{' '}
              {chart.specialCount}명). 투표 등급은 그대로 계산되고, 표시가 줄면 원래 등급으로
              돌아갑니다.
            </p>
          </>
        )}
      </div>

      <ChartComments chart={chart} playerId={playerId} onChanged={onChanged} />
    </div>
  );
}
