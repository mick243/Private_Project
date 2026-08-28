'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChartDetail, TierBoard, TierGame } from '@/lib/tier-types';
import { usePlayerId } from '@/lib/use-player';
import ChartDetailPanel from './ChartDetailPanel';

interface LevelOption {
  /** null = 난이도 축인 게임 (사볼) → 레벨만으로 보드가 정해진다. migrate-045 */
  mode: string | null;
  level: number;
  chartCount: number;
}

/**
 * 요청하고 싶은 조합. mode/level 이 null 이면 "그 게임의 첫 조합" 을 서버가 고릅니다.
 * 화면에 실제로 그려진 조합은 board.mode / board.level 이 유일한 출처입니다 —
 * 요청값과 결과값을 양쪽에 두면 게임을 바꿀 때 둘이 어긋납니다.
 */
interface Selection {
  machineId: number | null;
  mode: string | null;
  level: number | null;
}

/**
 * 주소에 실린 선택을 읽는다 (?machineId=3&level=17 · 모드가 있는 게임이면 &mode=S).
 *
 * useSearchParams 가 아니라 window.location 을 직접 읽습니다 — 그쪽을 쓰면 이
 * 페이지가 Suspense 경계를 요구해서, 얻는 것 없이 트리가 하나 더 생깁니다.
 *
 * 값이 이상하면(정수가 아니면) null 로 둡니다. null 은 "서버가 알아서 고르라"는
 * 뜻이라, 주소를 손으로 고쳐 넣어도 화면이 깨지지 않고 기본 조합으로 갑니다.
 */
function selectionFromUrl(): Selection {
  // 서버 렌더에는 주소가 없다. 이때 값이 갈리지만 첫 렌더 출력('불러오는 중…')은
  // sel 과 무관해서 하이드레이션이 어긋나지 않는다.
  if (typeof window === 'undefined') return { machineId: null, mode: null, level: null };

  const q = new URLSearchParams(window.location.search);
  const int = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  };
  return { machineId: int('machineId'), mode: q.get('mode'), level: int('level') };
}

/**
 * 서열표 칩에 띄우는 평균 투표 (소수점 2자리).
 *
 * `toFixed(2)` 만 쓰면 -0.004 가 **'-0.00'** 이 된다 — 있지도 않은 음수 0 이라
 * 읽는 사람이 "0 보다 낮은 건가?" 하고 멈춘다. 한 번 숫자로 되돌려 -0 을 없앤다.
 * 정렬 키(SQL ROUND(avg_vote,2))와 같은 값이라 표시와 순서가 어긋나지 않는다.
 */
function avgLabel(avg: number): string {
  return Number(avg.toFixed(2)).toFixed(2);
}

export default function TierBoardView() {
  const playerId = usePlayerId();

  const [sel, setSel] = useState<Selection>(selectionFromUrl);
  const [games, setGames] = useState<TierGame[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [board, setBoard] = useState<TierBoard | null>(null);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<ChartDetail | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sel.machineId !== null) params.set('machineId', String(sel.machineId));
      if (sel.mode !== null) params.set('mode', sel.mode);
      if (sel.level !== null) params.set('level', String(sel.level));
      if (playerId) params.set('playerId', String(playerId));

      const data = await fetch(`/api/tier?${params}`).then((r) => r.json());
      setGames(data.games as TierGame[]);
      setLevels(data.levels as LevelOption[]);
      setBoard((data.board as TierBoard) ?? null);
    } finally {
      setLoading(false);
    }
  }, [sel, playerId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  /**
   * 그려진 조합을 주소에 남긴다 — 새로고침하면 보던 서열표가 그대로 나온다.
   *
   * 요청값(sel)이 아니라 **board** 를 씁니다. sel 은 게임만 고르고 모드·레벨은
   * 비워 두는 경우가 있어(그 게임의 첫 조합을 서버가 고른다), sel 을 주소에
   * 적으면 새로고침했을 때 레벨이 빠진 주소가 되어 다시 첫 조합으로 갑니다.
   * board 는 서버가 실제로 고른 결과라 그 자리를 정확히 가리킵니다.
   *
   * pushState 가 아니라 replaceState 입니다 — 레벨을 훑어보는 동안 히스토리가
   * 쌓이면 뒤로가기를 여러 번 눌러야 이 페이지를 벗어나게 됩니다.
   */
  useEffect(() => {
    if (!board) return;

    const q = new URLSearchParams();
    q.set('machineId', String(board.game.machineId));
    // 난이도 축인 게임(사볼)은 모드가 없다 — 빈 mode= 를 남기지 않는다.
    if (board.mode !== null) q.set('mode', board.mode);
    q.set('level', String(board.level));

    const next = `${window.location.pathname}?${q}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next);
    }
  }, [board]);

  // 플레이어를 바꾸면 열려 있는 상세도 그 사람 기준으로 다시 읽는다.
  useEffect(() => {
    if (!detail) return;
    const params = playerId ? `?playerId=${playerId}` : '';
    fetch(`/api/charts/${detail.id}${params}`)
      .then((r) => r.json())
      .then((d) => d.chart && setDetail(d.chart as ChartDetail))
      .catch(() => undefined);
    // detail.id 가 아니라 playerId 변경에만 반응해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const openChart = async (id: number) => {
    const params = playerId ? `?playerId=${playerId}` : '';
    const data = await fetch(`/api/charts/${id}${params}`).then((r) => r.json());
    if (data.chart) setDetail(data.chart as ChartDetail);
  };

  const handleChanged = (chart: ChartDetail) => {
    setDetail(chart);
    void loadBoard(); // 등급이 바뀌었을 수 있으므로 서열표를 다시 계산해 받는다
  };

  // 실제로 그려진 조합 기준으로 컨트롤을 맞춘다.
  const activeLevel = board?.level ?? '';
  const labelOf = (code: string) =>
    board?.game.modes.find((m) => m.code === code)?.label ?? code;

  /**
   * 사볼의 NOV/ADV/EXH/MXM 은 모드가 아니라 난이도다 (migrate-045).
   * 그런 게임은 레벨만으로 보드가 정해지므로 모드 버튼을 그리지 않고,
   * 난이도는 곡명 뒤 대괄호로 보여준다. 펌프의 Single/Double 은 그대로 버튼.
   *
   * 서버가 levels 의 mode 를 null 로 내려주는 것으로 이 구분을 알린다 —
   * board 가 아직 없을 때(첫 로딩)도 컨트롤을 맞춰야 하므로 settings 를 안 본다.
   */
  const modeIsDifficulty = levels.length > 0 && levels.every((l) => l.mode === null);
  const activeMode = board?.mode ?? '';
  const modeCodes = modeIsDifficulty
    ? []
    : [...new Set(levels.map((l) => l.mode).filter((m): m is string => m !== null))];
  const levelsForMode = modeIsDifficulty
    ? levels
    : levels.filter((l) => l.mode === activeMode);

  /**
   * 등급 색은 코드가 아니라 '위에서 몇 번째'로 정한다 (globals.css .tier-r*).
   * 코드로 칠하면 사볼 s(최상)와 펌프 s(위에서 둘째)가 같은 색이 되어 버린다.
   *
   * groups 는 [등급… , 개인차, 특수패턴, 미정] 순이고, 뒤의 셋은 등급이 아니라
   * 표시라서 anchor 가 없다 — 그걸로 등급 개수를 센다 (lib/tier.ts getTierBoard).
   * 맨 아래 등급은 언제나 회색(tier-rlast) 이라, 단계 수가 다른 게임끼리도
   * 위는 빨강 · 아래는 회색으로 끝이 맞는다.
   */
  const gradeCount = board?.groups.filter((g) => g.anchor !== null).length ?? 0;
  const rankClass = (i: number) => {
    if (i >= gradeCount) return ''; // 개인차 · 특수패턴 · 미정 — 자기 색이 따로 있다
    return i === gradeCount - 1 ? 'tier-rlast' : `tier-r${i + 1}`;
  };

  return (
    <div className="tier-layout">
      <section className="tier-main">
        <header className="tier-head">
          <div>
            <h1>
              {board
                ? // 난이도 축인 게임은 모드가 없으니 'Lv18' 로 (펌프는 'S15' 그대로)
                  `${board.game.name} ${board.mode === null ? 'Lv' : board.mode}${board.level}`
                : '서열표'}{' '}
              서열표
            </h1>
            {/* 채보 목록의 기준 버전. 게임마다 다르고 없을 수도 있어 DB 가 들고 있다
                (tier_settings.chart_basis · migrate-044). 없으면 줄을 그리지 않는다. */}
            {board?.settings.chartBasis && (
              <p className="tier-basis muted">
                해당 서열표는 {board.settings.chartBasis}를 기준으로 작성되었습니다.
              </p>
            )}
            <p className="muted small">
              같은 레벨 안에서의 체감 난이도를, 그 채보를 <strong>클리어한 사람들의</strong>{' '}
              투표 평균으로 배치합니다. 채보를 누르면 평가(코멘트)도 볼 수 있습니다.
            </p>
          </div>

          <div className="tier-controls">
            <select
              value={board?.game.machineId ?? ''}
              onChange={(e) =>
                // 게임을 바꾸면 모드·레벨은 비운다. 그 게임에 있는 첫 조합을 서버가 고른다.
                setSel({ machineId: Number(e.target.value), mode: null, level: null })
              }
              title="서열표가 등록된 게임"
            >
              {games.map((g) => (
                <option key={g.machineId} value={g.machineId}>
                  {g.name}
                </option>
              ))}
            </select>

            {/* 난이도 축인 게임에는 모드 버튼이 없다 (modeCodes 가 빈 배열) */}
            {modeCodes.length > 0 && (
              <div className="seg">
                {modeCodes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={m === activeMode ? 'is-on' : ''}
                    onClick={() =>
                      setSel((s) => ({ machineId: s.machineId, mode: m, level: null }))
                    }
                  >
                    {labelOf(m)}
                  </button>
                ))}
              </div>
            )}

            <select
              value={activeLevel}
              onChange={(e) =>
                setSel((s) => ({
                  machineId: s.machineId,
                  mode: modeIsDifficulty ? null : activeMode,
                  level: Number(e.target.value),
                }))
              }
            >
              {levelsForMode.map((l) => (
                <option key={l.level} value={l.level}>
                  {/* 난이도 축인 게임은 접두사 없이 레벨만 (사볼 1~20) */}
                  {modeIsDifficulty ? `Lv${l.level}` : `${l.mode}${l.level}`} ·{' '}
                  {l.chartCount}곡
                </option>
              ))}
            </select>
          </div>
        </header>

        {loading && !board ? (
          <p className="muted pad">불러오는 중…</p>
        ) : !board ? (
          <p className="muted pad">이 게임에는 아직 등록된 채보가 없습니다.</p>
        ) : (
          <div className="tier-rows">
            {board.groups.map((g, i) => (
              <div
                key={g.code}
                className={`tier-row tier-${g.code} ${rankClass(i)} ${
                  g.charts.length === 0 ? 'is-empty' : ''
                }`}
              >
                <div className="tier-label">
                  <strong>{g.label}</strong>
                  <span className="muted small">
                    {g.anchor !== null ? g.anchor.toFixed(2) : ''} · {g.charts.length}곡
                  </span>
                </div>

                <div className="tier-charts">
                  {g.charts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chart-chip ${detail?.id === c.id ? 'is-on' : ''}`}
                      onClick={() => openChart(c.id)}
                      title={[
                        `${c.voteCount}표`,
                        c.myVote !== null ? `내 투표 ${c.myVote.toFixed(1)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {c.myClear && <i className="clear-mark" title="클리어함" />}
                      <span className="chip-title">
                        {c.title}
                        {/* 난이도 축인 게임은 한 레벨에 여러 난이도가 섞이므로
                            어느 채보인지 곡명 뒤에 대괄호로 밝힌다 (예: [MXM]).
                            mode 가 null 이면 출처 표에 난이도가 없던 채보라
                            (migrate-047) 붙일 것이 없다 — 빈 대괄호를 그리지 않는다. */}
                        {modeIsDifficulty && c.mode !== null && (
                          <span className="chip-diff"> [{c.mode}]</span>
                        )}
                      </span>
                      {/* 칩에는 평균 투표를 띄운다 — 줄 세우기의 근거가 눈에 보여야
                          어떤 순서인지 알 수 있다. 정렬도 이 값(2자리) 기준이다.
                          내 투표는 툴팁으로 옮겼다. */}
                      {c.avgVote !== null && (
                        <em className="chip-vote">{avgLabel(c.avgVote)}</em>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {board && (
          <footer className="tier-foot muted small">
            {board.game.name} {board.modeLabel ?? `Lv${board.level}`} · 총 {board.totalCharts}곡 ·
            투표{' '}
            {board.settings.minVotes}건 미만은 &lsquo;미정&rsquo;, 수렴도{' '}
            {board.settings.minConvergence} 미만은 &lsquo;개인차&rsquo;로 분류됩니다. 투표 범위{' '}
            {board.settings.voteMin.toFixed(1)} ~ {board.settings.voteMax.toFixed(1)}. 등급 단계와 임계값은 게임마다
            다릅니다.
          </footer>
        )}
      </section>

      <aside className="tier-side">
        {detail ? (
          <ChartDetailPanel
            chart={detail}
            playerId={playerId}
            onChanged={handleChanged}
            onClose={() => setDetail(null)}
          />
        ) : (
          <div className="detail-empty muted">
            <p>채보를 선택하면 투표 분포 · 내 기록 · 채보 평가를 볼 수 있습니다.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
