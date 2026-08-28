/**
 * 추천 엔진 — "지금 내 위치에서 어느 오락실에 갈까"를 점수 하나로 답합니다.
 *
 * 세 가지만 봅니다. 기체 컨디션 · 대기 인원 · 거리. 셋 다 이미 화면에 있는
 * 값이고(제보로 모입니다), 여기서 하는 일은 **저울질**뿐입니다 — 어떤 사람은
 * 5분 더 걸어도 발판 멀쩡한 곳을 가고, 어떤 사람은 컨디션이 어떻든 지금 바로
 * 할 수 있는 곳을 갑니다. 그 차이를 코드가 정하지 않고 사용자가 정합니다.
 *
 * 순수 함수만 둡니다 — DB 도 fetch 도 없습니다. GPS 좌표가 몇 초마다 바뀌는
 * 동안 서버를 다시 부르지 않고 순위만 다시 세우려면, 계산이 클라이언트에서
 * 끝나야 합니다 (조회 자체는 기준점이 크게 움직였을 때만 다시 합니다).
 *
 * ⚠ 이 파일은 클라이언트 번들에 들어갑니다. 서버 전용 모듈을 import 하지 마세요.
 */

import { WAIT_LEVELS, waitCountLabel, waitLevel, waitPerCabinet } from './community-types';
import { distanceKm, formatDistance, type Coord } from './geo';
import type { Arcade, ArcadeMachine } from './types';

// ─── 우선순위 ────────────────────────────────────────────────

export type FactorKey = 'condition' | 'wait' | 'distance';

/**
 * 항목별 무게. **화면에 나가지 않는 내부 값**입니다 — 사용자가 고르는 건
 * 1·2·3순위뿐이고, 그게 몇 점인지는 PRIORITY_POINTS 가 정합니다.
 */
export type Weights = Record<FactorKey, number>;

export const FACTORS: { key: FactorKey; label: string; hint: string }[] = [
  { key: 'condition', label: '기체 컨디션', hint: '발판·버튼 상태 (등록값 + 제보 종합)' },
  { key: 'wait', label: '대기 인원', hint: '지금 줄 서 있는 사람 수 제보' },
  { key: 'distance', label: '거리', hint: '현재 기준점에서의 직선 거리' },
];

/** 셋을 똑같이 봅니다 — 어느 하나를 기본값으로 밀어 줄 근거가 없습니다 */
export const DEFAULT_WEIGHTS: Weights = { condition: 3, wait: 3, distance: 3 };

// ─── 순위 → 점수 ────────────────────────────────────────────

/**
 * 사용자가 고르는 것은 **1·2·3순위** 세 칸뿐입니다. 그 순위가 몇 점짜리
 * 무게인지는 여기서만 정해지고 화면에는 나가지 않습니다.
 *
 * 슬라이더나 %를 걷어낸 이유: 저울의 눈금을 보여 주면 "컨디션 63%" 가 무슨
 * 뜻인지 설명할 자리가 필요해집니다. 정작 사람이 답할 수 있는 질문은
 * "뭐가 제일 중요하세요?" 하나입니다.
 *
 * 5·3·2 인 이유 — 1등과 2등의 간격(2)이 2등과 3등의 간격(1)보다 큽니다.
 * 1순위는 확실히 이기되 나머지 둘이 뒤집을 여지는 남깁니다. 5·3·2 는 합이
 * 10 이라 1순위가 딱 절반이고, 3순위도 20% 는 쥡니다 — 0 으로 두면 "3순위"
 * 라는 말이 "안 본다" 와 같아집니다.
 */
export const PRIORITY_POINTS = [5, 3, 2] as const;

/** 1순위 → 2순위 → 3순위. 세 항목이 겹치지 않게 한 번씩 들어갑니다 */
export type PriorityOrder = [FactorKey, FactorKey, FactorKey];

/** 순위가 아직 다 안 정해졌을 때의 한 칸 */
export type PartialOrder = (FactorKey | null)[];

/** 세 칸이 모두 채워졌고 서로 겹치지 않는지 */
export function isCompleteOrder(order: PartialOrder): order is PriorityOrder {
  if (order.length !== 3 || order.some((k) => k === null)) return false;
  return new Set(order).size === 3;
}

/** 1·2·3순위를 내부 가중치로. 화면에는 이 값이 나가지 않습니다 */
export function weightsFromOrder(order: PriorityOrder): Weights {
  const weights = { condition: 0, wait: 0, distance: 0 } as Weights;
  order.forEach((key, i) => {
    weights[key] = PRIORITY_POINTS[i];
  });
  return weights;
}

/** '거리 → 기체 컨디션 → 대기 인원' — 확인 문구용 */
export function describeOrder(order: PriorityOrder): string {
  return order
    .map((key, i) => `${i + 1}순위 ${FACTORS.find((f) => f.key === key)!.label}`)
    .join(' · ');
}

// ─── 점수 ────────────────────────────────────────────────────

/**
 * 근거가 없을 때 쓰는 값.
 *
 * 0 을 주면 "제보가 아직 없는 곳"이 "제보로 최악이 확인된 곳"과 같아지고,
 * 1 을 주면 아무도 안 가본 곳이 1등이 됩니다. 둘 다 없는 정보를 지어내는
 * 쪽이라, 모르는 항목은 순위를 밀지도 당기지도 않게 가운데에 둡니다.
 * 대신 그 사실을 confidence 로 따로 내보내 화면이 "정보 부족"을 말하게 합니다.
 */
const NEUTRAL = 0.5;

export interface FactorScore {
  /** 0~1, 클수록 좋음 */
  score: number;
  /** 근거 데이터가 있었는지. false 면 score 는 NEUTRAL 입니다 */
  known: boolean;
  /** 화면에 그대로 찍는 근거 한 줄 */
  label: string;
}

export interface ScoredArcade {
  arcade: Arcade;
  /** 1위부터 */
  rank: number;
  /** 0~100 */
  score: number;
  /** 기준점에서 다시 잰 거리(km). 기준점이 없으면 null */
  distanceKm: number | null;
  factors: Record<FactorKey, FactorScore>;
  /**
   * 가중치가 실린 항목 중 **실제 데이터가 있던** 비율(0~1).
   * 1 이면 세 항목 모두 근거가 있고, 0 이면 전부 추측입니다.
   */
  confidence: number;
  /** 이 오락실을 밀어 올린 항목 — "왜 이 순위인지" 한 줄의 재료 */
  topFactor: FactorKey | null;
}

export interface RankParams {
  arcades: Arcade[];
  /** 현재 기준점 (GPS 또는 수동 선택). 없으면 거리 항목이 통째로 '모름' */
  origin: Coord | null;
  /** 관심 기종. 비어 있으면 그 오락실이 가진 기종 전체를 봅니다 */
  machineIds?: number[];
  weights: Weights;
  /** 거리 만점의 기준 — 이 거리를 넘으면 거리 점수 0점 */
  radiusKm: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 관심 기종으로 좁힌 목록. 필터가 없으면 보유 기종 전부 */
function targetMachines(arcade: Arcade, machineIds: number[]): ArcadeMachine[] {
  if (machineIds.length === 0) return arcade.machines;
  const wanted = new Set(machineIds);
  return arcade.machines.filter((m) => wanted.has(m.id));
}

/**
 * 기종 1개의 컨디션 = **가장 좋은 기체**의 컨디션.
 *
 * 평균이 아닌 이유: 2대 중 1대만 멀쩡하면 사람은 멀쩡한 쪽에서 칩니다.
 * 평균(예: 5와 1 → 3)은 실제로 하게 될 경험보다 낮게 잡습니다.
 * 죽어 있는 기체는 대기 항목에서 간접적으로 드러납니다 — 쓸 수 있는 기체가
 * 하나뿐이면 줄이 길어지기 때문입니다.
 */
function machineCondition(machine: ArcadeMachine): number | null {
  let best: number | null = null;
  for (const cab of machine.cabinets) {
    const v = cab.conditionSummary?.value;
    if (v === undefined || v === null) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

function scoreCondition(machines: ArcadeMachine[]): FactorScore {
  const values = machines.map(machineCondition).filter((v): v is number => v !== null);

  if (values.length === 0) {
    return { score: NEUTRAL, known: false, label: '컨디션 정보 없음' };
  }

  // 관심 기종이 여러 개면 **평균**입니다. 셋 중 하나만 좋은 곳보다 셋 다
  // 괜찮은 곳을 위로 올려야, 여러 기종을 고른 의도와 순위가 맞습니다.
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    // 1~5 눈금을 0~1 로. 최저값 1 이 0점이어야 5칸이 고르게 벌어집니다.
    score: clamp01((avg - 1) / 4),
    known: true,
    label: `컨디션 ${avg.toFixed(1)}/5`,
  };
}

/**
 * 대기 점수는 **가장 붐비는 기종** 기준입니다. 고른 기종을 다 하려면 제일 긴
 * 줄을 서게 되고, 평균을 내면 그 줄이 짧아 보입니다.
 *
 * '가장 붐비는' 은 머릿수가 아니라 **기체당 인원**으로 셉니다 (대기 ÷ 대수).
 * 3대에 6명(기체당 2명)과 1대에 4명(기체당 4명)이면 뒤쪽이 훨씬 오래 걸립니다 —
 * 머릿수로 고르면 앞쪽이 '더 붐비는 곳' 이 되어 점수가 거꾸로 섭니다.
 *
 * 점수는 인원수가 아니라 WAIT_LEVELS 구간으로 냅니다 — 화면에는 '대기 있음'·'보통'
 * 이라는 구간 문구가 뜨는데 순위는 숫자로 매기면, 둘 다 '대기 있음'인 두 곳의
 * 순서가 화면상 아무 근거 없이 갈립니다. 같은 구간이면 같은 점수를 주고,
 * 나머지는 다른 항목이 가르게 둡니다.
 */
function scoreWait(machines: ArcadeMachine[]): FactorScore {
  let worst: { count: number; cabinets: number; per: number } | null = null;
  for (const m of machines) {
    const c = m.live?.waitCount;
    if (c === undefined || c === null) continue;
    const per = waitPerCabinet(c, m.cabinetCount);
    if (worst === null || per > worst.per) {
      worst = { count: c, cabinets: m.cabinetCount, per };
    }
  }

  if (worst === null) {
    return { score: NEUTRAL, known: false, label: '대기 정보 없음' };
  }

  const level = waitLevel(worst.count, worst.cabinets);

  return {
    score: clamp01(1 - level.index / (WAIT_LEVELS.length - 1)),
    known: true,
    label:
      worst.count === 0
        ? '대기 없음'
        : `대기 ${waitCountLabel(worst.count)} · ${level.label}`,
  };
}

function scoreDistance(km: number | null, radiusKm: number): FactorScore {
  if (km === null) {
    return { score: NEUTRAL, known: false, label: '기준점 없음' };
  }
  // 반경 안에서만 줄을 세웁니다. "10km 대비 몇 %" 같은 고정 기준을 쓰면
  // 반경 1km 로 좁혀 놨을 때 후보들의 거리 점수가 전부 0.9 대로 뭉쳐
  // 거리 가중치를 아무리 올려도 순위가 안 움직입니다.
  const base = radiusKm > 0 ? radiusKm : 1;
  return {
    score: clamp01(1 - km / base),
    known: true,
    label: formatDistance(km),
  };
}

/**
 * 순위를 매깁니다. 입력 배열은 건드리지 않습니다.
 *
 * 동점 처리: 점수 → 거리 → 이름. 마지막을 이름으로 닫는 이유는 GPS 가 1m
 * 흔들릴 때마다 같은 점수의 두 곳이 자리를 바꾸면 목록이 깜빡이기 때문입니다.
 */
export function rankArcades({
  arcades,
  origin,
  machineIds = [],
  weights,
  radiusKm,
}: RankParams): ScoredArcade[] {
  const total = FACTORS.reduce((acc, f) => acc + Math.max(0, weights[f.key]), 0);

  // 셋 다 0 으로 내려놓으면 저울이 없습니다. 아무 순서나 주는 대신 거리만
  // 봅니다 — 조건을 안 걸었을 때 사람이 기대하는 순서가 "가까운 순"입니다.
  const effective: Weights =
    total === 0
      ? { condition: 0, wait: 0, distance: 1 }
      : {
          condition: Math.max(0, weights.condition),
          wait: Math.max(0, weights.wait),
          distance: Math.max(0, weights.distance),
        };
  const sum = effective.condition + effective.wait + effective.distance;

  const scored: ScoredArcade[] = arcades.map((arcade) => {
    const machines = targetMachines(arcade, machineIds);
    const km = origin ? distanceKm(origin, { lat: arcade.lat, lng: arcade.lng }) : null;

    const factors: Record<FactorKey, FactorScore> = {
      condition: scoreCondition(machines),
      wait: scoreWait(machines),
      distance: scoreDistance(km, radiusKm),
    };

    let weighted = 0;
    let knownWeight = 0;
    let topFactor: FactorKey | null = null;
    let topContribution = 0;

    for (const { key } of FACTORS) {
      const w = effective[key] / sum;
      const contribution = w * factors[key].score;
      weighted += contribution;
      if (factors[key].known) knownWeight += w;
      // 가중치가 0 인 항목은 이유가 될 수 없습니다 (기여도도 0 입니다).
      if (w > 0 && factors[key].known && contribution > topContribution) {
        topContribution = contribution;
        topFactor = key;
      }
    }

    return {
      arcade,
      rank: 0,
      score: Math.round(weighted * 100),
      distanceKm: km,
      factors,
      confidence: knownWeight,
      topFactor,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.arcade.name.localeCompare(b.arcade.name, 'ko');
  });

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

/** "가까워서 1위" — 순위의 근거를 한 마디로. 근거가 없으면 그렇다고 말합니다 */
export function rankReason(scored: ScoredArcade): string {
  if (scored.topFactor === null) return '비교할 정보가 아직 없습니다';
  const reason: Record<FactorKey, string> = {
    condition: '기체 상태가 좋아서',
    wait: '지금 바로 할 수 있어서',
    distance: '가까워서',
  };
  return reason[scored.topFactor];
}

// ─── 목록 순서 · 페이지 ──────────────────────────────────────

/** 가까운 순. 거리가 같거나 둘 다 모르면 이름순으로 갈라 순서가 흔들리지 않게 합니다 */
export function byDistanceThenName(a: ScoredArcade, b: ScoredArcade): number {
  const da = a.distanceKm ?? Infinity;
  const db = b.distanceKm ?? Infinity;
  if (da !== db) return da - db;
  return a.arcade.name.localeCompare(b.arcade.name, 'ko');
}

/**
 * 평점 높은 순. 평점이 없는 곳은 **뒤로** 갑니다 (0점이 아니라 '모름' 입니다).
 *
 * 같은 평점이면 리뷰가 많은 쪽이 먼저입니다 — 5.0(1건)과 4.8(40건) 중 앞에
 * 둘 것은 후자에 가깝지만, 그 판단까지 여기서 하지는 않습니다. 리뷰 수는
 * 같은 점수 안에서만 씁니다. 마지막은 이름으로 닫아 순서가 흔들리지 않게 합니다.
 */
export function byRatingThenName(a: ScoredArcade, b: ScoredArcade): number {
  const ra = a.arcade.reviewCount > 0 ? (a.arcade.ratingAvg ?? -1) : -1;
  const rb = b.arcade.reviewCount > 0 ? (b.arcade.ratingAvg ?? -1) : -1;
  if (ra !== rb) return rb - ra;
  if (a.arcade.reviewCount !== b.arcade.reviewCount) {
    return b.arcade.reviewCount - a.arcade.reviewCount;
  }
  return a.arcade.name.localeCompare(b.arcade.name, 'ko');
}

/**
 * 선택한 곳을 맨 위로 올립니다 — **즐겨찾기보다 위**입니다.
 *
 * 지금 상세 패널에 열려 있는 그 한 곳이라, 목록에서 어느 줄인지 바로 짚여야
 * 합니다. 즐겨찾기가 여러 곳이면 선택한 줄이 그 아래로 밀려 페이지 어딘가에
 * 섞이는데, 사람은 방금 누른 것을 화면에서 다시 찾게 됩니다.
 *
 * favoritesFirst 다음에 부릅니다 — 안정 분할이라 나머지(즐겨찾기 → 정렬순)의
 * 순서는 그대로 유지됩니다.
 */
export function selectedFirst(
  scored: ScoredArcade[],
  selectedId: number | null,
): ScoredArcade[] {
  if (selectedId === null) return scored;
  const at = scored.findIndex((s) => s.arcade.id === selectedId);
  if (at <= 0) return scored; // 없거나 이미 맨 위
  return [scored[at], ...scored.slice(0, at), ...scored.slice(at + 1)];
}

/**
 * 즐겨찾기를 맨 위로 올립니다. **그 안의 순서는 건드리지 않습니다**
 * (안정 분할이라 들어온 순서가 그대로 유지됩니다).
 *
 * 목록이 화면 안으로 좁혀지고 페이지로 잘리므로, 담아 둔 곳이 3페이지에 있으면
 * 사실상 없는 것과 같습니다. 그래서 순서를 정하는 마지막 단계에서 한 번 더
 * 앞으로 당깁니다 — "내가 담아 둔 곳부터" 는 정렬 기준과 무관하게 지켜야 합니다.
 */
export function favoritesFirst(
  scored: ScoredArcade[],
  favoriteIds: ReadonlySet<number>,
): ScoredArcade[] {
  if (favoriteIds.size === 0) return scored;
  const fav: ScoredArcade[] = [];
  const rest: ScoredArcade[] = [];
  for (const s of scored) (favoriteIds.has(s.arcade.id) ? fav : rest).push(s);
  return fav.length === 0 ? scored : [...fav, ...rest];
}

/** 사이드바 한 페이지에 들어가는 곳 수 */
export const SIDEBAR_PAGE_SIZE = 10;

/**
 * 조건을 걸었을 때 사이드바가 내놓는 **최대** 곳 수 (= 3페이지).
 *
 * 검색어 하나에 250곳이 걸리는 일이 흔한데, 32페이지를 넘겨 가며 오락실을
 * 고르는 사람은 없습니다. 뒤쪽 페이지는 "있지만 아무도 안 보는 목록" 이고,
 * 그걸 다 그리려고 개수 표시가 거짓이 되면(잘렸는데 잘린 줄 모르면) 더 나쁩니다.
 * 그래서 앞의 이만큼만 내놓고, 분모를 함께 적어 잘렸다는 사실을 밝힙니다.
 *
 * ⚠ 지도는 자르지 않습니다 — 반경 안의 전부를 그립니다. 목록이 3페이지로
 *   끝나는 건 화면 사정이고, 주변에 뭐가 있는지 훑는 일은 지도가 합니다.
 */
export const SIDEBAR_MAX_ITEMS = 30;

/**
 * 목록을 늘어놓는 기준.
 *
 *   score    챗봇이 1·2·3순위로 탐색을 마친 뒤 (사용자가 방금 고른 순서다)
 *   distance 기준점이 있을 때 (내 위치를 켠 사람이 기대하는 순서)
 *   rating   그 둘이 아닐 때 — 거리를 모르면 '가까운 순' 은 성립하지 않고,
 *            이름순은 첫 글자가 순위인 척하는 목록이 된다
 */
export type ListSort = 'score' | 'distance' | 'rating';

/**
 * 정렬 모드대로 늘어놓습니다 — **자르지 않습니다**.
 *
 * 예전에는 이 자리에서 목록을 N곳으로 자르기까지 했습니다(pickForList). 그때는
 * 잘려 나간 곳을 볼 방법이 아예 없었기 때문에 "무엇을 남길지" 가 중요했지만,
 * 지금은 페이지를 넘겨 다 볼 수 있습니다. 자르는 일은 페이지가 하고
 * (pageSlice) 여기서는 순서만 정합니다.
 *
 * 입력(scored)은 점수순으로 정렬돼 있다고 봅니다 (rankArcades 의 출력).
 * 원본 배열은 건드리지 않습니다.
 */
export function sortForList(scored: ScoredArcade[], sort: ListSort): ScoredArcade[] {
  // 추천순은 rankArcades 가 이미 세워 둔 순서다 — 다시 세우면 동점 처리
  // 규칙(점수 → 거리 → 이름)을 두 곳에 적는 셈이 된다.
  if (sort === 'score') return [...scored];
  return [...scored].sort(sort === 'rating' ? byRatingThenName : byDistanceThenName);
}

/** 1-based page 의 한 페이지 분량. 범위를 벗어난 page 는 양 끝으로 붙입니다 */
export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return [];
  const last = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, Math.trunc(page) || 1), last);
  return items.slice((safe - 1) * pageSize, safe * pageSize);
}

/**
 * 그 오락실이 몇 페이지에 있는지 (목록에 없으면 null).
 *
 * 지도는 반경 안 **전부**를 그리므로 목록의 이 페이지에 없는 핀을 누르는 일이
 * 흔합니다. 예전에는 선택한 곳을 목록 맨 위로 끌어올려 그 문제를 덮었는데,
 * 그러면 그 줄이 목록의 원래 자리에서는 사라져 순서가 거짓이 됩니다.
 * 페이지가 있으니 이제는 **그 줄이 있는 페이지로 넘겨** 줄 수 있습니다.
 */
export function pageOfArcade(
  items: ScoredArcade[],
  arcadeId: number | null,
  pageSize: number,
): number | null {
  if (arcadeId === null || pageSize <= 0) return null;
  const at = items.findIndex((s) => s.arcade.id === arcadeId);
  return at < 0 ? null : Math.floor(at / pageSize) + 1;
}
