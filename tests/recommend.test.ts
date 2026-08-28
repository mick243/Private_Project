import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  PRIORITY_POINTS,
  favoritesFirst,
  isCompleteOrder,
  pageOfArcade,
  pageSlice,
  rankArcades,
  rankReason,
  selectedFirst,
  sortForList,
  weightsFromOrder,
  type PriorityOrder,
  type ScoredArcade,
  type Weights,
} from '@/lib/recommend';
import type { Arcade, ArcadeCabinet, ArcadeMachine } from '@/lib/types';

// ─── 픽스처 ──────────────────────────────────────────────────

const ORIGIN = { lat: 37.5, lng: 127.0 };
/** 위도 0.009도 ≈ 1km */
const KM = 0.009;

function cabinet(no: number, value: number | null): ArcadeCabinet {
  return {
    id: no,
    cabinetNo: no,
    condition: null,
    conditionSummary: value === null ? null : { value, reports: 1, reportedAt: null },
  };
}

function machine(
  id: number,
  opts: { conditions?: (number | null)[]; wait?: number | null } = {},
): ArcadeMachine {
  const conditions = opts.conditions ?? [null];
  const wait = opts.wait ?? null;
  return {
    id,
    name: `기종 ${id}`,
    shortName: `M${id}`,
    category: 'rhythm',
    cabinetCount: conditions.length,
    cabinets: conditions.map((c, i) => cabinet(i + 1, c)),
    live:
      wait === null
        ? null
        : { waitCount: wait, waitReports: 1, waitReportedAt: '2026-01-01T00:00:00Z' },
  };
}

let nextId = 1;
function arcade(
  name: string,
  opts: { km?: number; machines?: ArcadeMachine[] } = {},
): Arcade {
  return {
    id: nextId++,
    name,
    address: '주소',
    lat: ORIGIN.lat + (opts.km ?? 0) * KM,
    lng: ORIGIN.lng,
    openTime: null,
    closeTime: null,
    is24h: true,
    phone: null,
    note: null,
    machines: opts.machines ?? [],
    distanceKm: null,
    ratingAvg: null,
    reviewCount: 0,
  };
}

const ONLY = (key: keyof Weights): Weights => ({
  condition: 0,
  wait: 0,
  distance: 0,
  [key]: 5,
});

const names = (arcades: Arcade[], w: Weights, radiusKm = 5) =>
  rankArcades({ arcades, origin: ORIGIN, weights: w, radiusKm }).map((s) => s.arcade.name);

// ─── 세 항목이 각각 순위를 움직이는가 ────────────────────────

describe('우선순위 가중치', () => {
  it('거리만 보면 가까운 곳이 1위다', () => {
    const near = arcade('가까움', { km: 0.5, machines: [machine(1, { conditions: [1] })] });
    const far = arcade('멂', { km: 4, machines: [machine(1, { conditions: [5] })] });
    expect(names([far, near], ONLY('distance'))).toEqual(['가까움', '멂']);
  });

  it('컨디션만 보면 멀어도 상태 좋은 곳이 1위다', () => {
    const near = arcade('가까움', { km: 0.5, machines: [machine(1, { conditions: [1] })] });
    const far = arcade('멂', { km: 4, machines: [machine(1, { conditions: [5] })] });
    expect(names([near, far], ONLY('condition'))).toEqual(['멂', '가까움']);
  });

  it('대기만 보면 줄 없는 곳이 1위다', () => {
    const busy = arcade('붐빔', { km: 0.5, machines: [machine(1, { wait: 8 })] });
    const free = arcade('한산', { km: 4, machines: [machine(1, { wait: 0 })] });
    expect(names([busy, free], ONLY('wait'))).toEqual(['한산', '붐빔']);
  });

  it('가중치를 바꾸면 같은 후보의 순위가 뒤집힌다 — 저울이 실제로 작동한다', () => {
    const near = arcade('가까움', { km: 0.5, machines: [machine(1, { conditions: [1] })] });
    const good = arcade('상태좋음', { km: 4, machines: [machine(1, { conditions: [5] })] });

    expect(names([near, good], { condition: 1, wait: 0, distance: 5 })[0]).toBe('가까움');
    expect(names([near, good], { condition: 5, wait: 0, distance: 1 })[0]).toBe('상태좋음');
  });

  it('가중치 0 인 항목은 순위에 영향을 주지 않는다', () => {
    const a = arcade('A', { km: 1, machines: [machine(1, { conditions: [5] })] });
    const b = arcade('B', { km: 1, machines: [machine(1, { conditions: [1] })] });
    const ranked = rankArcades({
      arcades: [a, b],
      origin: ORIGIN,
      weights: ONLY('distance'),
      radiusKm: 5,
    });
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('셋 다 0 이면 가까운 순으로 떨어진다 (아무 순서나 주지 않는다)', () => {
    const near = arcade('가까움', { km: 0.5, machines: [machine(1, { conditions: [1] })] });
    const far = arcade('멂', { km: 4, machines: [machine(1, { conditions: [5] })] });
    const zero: Weights = { condition: 0, wait: 0, distance: 0 };
    expect(names([far, near], zero)).toEqual(['가까움', '멂']);
  });
});

// ─── 모르는 값 ───────────────────────────────────────────────

describe('정보가 없을 때', () => {
  it('제보 없는 곳이 "최악으로 확인된 곳"보다 위, "최고로 확인된 곳"보다 아래다', () => {
    const unknown = arcade('모름', { km: 1, machines: [machine(1)] });
    const worst = arcade('최악', { km: 1, machines: [machine(1, { conditions: [1] })] });
    const best = arcade('최고', { km: 1, machines: [machine(1, { conditions: [5] })] });
    expect(names([worst, unknown, best], ONLY('condition'))).toEqual([
      '최고',
      '모름',
      '최악',
    ]);
  });

  it('"대기 0명 확인" 이 "대기 정보 없음" 을 이긴다', () => {
    const confirmed = arcade('확인됨', { km: 1, machines: [machine(1, { wait: 0 })] });
    const unknown = arcade('모름', { km: 1, machines: [machine(1)] });
    expect(names([unknown, confirmed], ONLY('wait'))).toEqual(['확인됨', '모름']);
  });

  it('근거가 없는 항목은 known:false 로 표시되고 confidence 에서 빠진다', () => {
    const a = arcade('A', { km: 1, machines: [machine(1, { conditions: [4] })] });
    const [s] = rankArcades({
      arcades: [a],
      origin: ORIGIN,
      weights: DEFAULT_WEIGHTS,
      radiusKm: 5,
    });

    expect(s.factors.condition.known).toBe(true);
    expect(s.factors.wait.known).toBe(false);
    expect(s.factors.wait.label).toBe('대기 정보 없음');
    // 컨디션·거리만 근거가 있으므로 2/3
    expect(s.confidence).toBeCloseTo(2 / 3, 6);
  });

  it('기준점이 없으면 거리 항목이 통째로 모름이 된다', () => {
    const a = arcade('A', { km: 1, machines: [machine(1, { conditions: [4], wait: 0 })] });
    const [s] = rankArcades({
      arcades: [a],
      origin: null,
      weights: DEFAULT_WEIGHTS,
      radiusKm: 5,
    });

    expect(s.distanceKm).toBeNull();
    expect(s.factors.distance.known).toBe(false);
    expect(s.confidence).toBeCloseTo(2 / 3, 6);
  });

  it('아무 근거도 없으면 이유를 지어내지 않는다', () => {
    const a = arcade('A', { km: 1, machines: [machine(1)] });
    const [s] = rankArcades({
      arcades: [a],
      origin: null,
      weights: { condition: 3, wait: 3, distance: 0 },
      radiusKm: 5,
    });
    expect(s.topFactor).toBeNull();
    expect(rankReason(s)).toBe('비교할 정보가 아직 없습니다');
  });
});

// ─── 집계 규칙 ───────────────────────────────────────────────

describe('기종·기체 집계', () => {
  it('컨디션은 기종 안에서 가장 좋은 기체를 쓴다 (평균이 아니다)', () => {
    // 5와 1 → 평균 3, 최선 5. 사람은 멀쩡한 기체에서 친다.
    const mixed = arcade('한대만멀쩡', { km: 1, machines: [machine(1, { conditions: [5, 1] })] });
    const flat = arcade('둘다보통', { km: 1, machines: [machine(1, { conditions: [4, 4] })] });
    expect(names([flat, mixed], ONLY('condition'))).toEqual(['한대만멀쩡', '둘다보통']);
  });

  it('대기는 기종 중 가장 붐비는 쪽을 쓴다 (다 하려면 제일 긴 줄을 선다)', () => {
    const a = arcade('A', {
      km: 1,
      machines: [machine(1, { wait: 0 }), machine(2, { wait: 9 })],
    });
    const b = arcade('B', {
      km: 1,
      machines: [machine(1, { wait: 3 }), machine(2, { wait: 3 })],
    });
    expect(names([a, b], ONLY('wait'))).toEqual(['B', 'A']);
  });

  it('기종을 고르면 그 기종만 보고 점수를 낸다', () => {
    // 1번 기종은 죽어 있고 2번은 멀쩡한 곳 vs 그 반대.
    const a = arcade('A', {
      km: 1,
      machines: [machine(1, { conditions: [1] }), machine(2, { conditions: [5] })],
    });
    const b = arcade('B', {
      km: 1,
      machines: [machine(1, { conditions: [5] }), machine(2, { conditions: [1] })],
    });

    const pick = (machineIds: number[]) =>
      rankArcades({
        arcades: [a, b],
        origin: ORIGIN,
        machineIds,
        weights: ONLY('condition'),
        radiusKm: 5,
      }).map((s) => s.arcade.name);

    expect(pick([1])).toEqual(['B', 'A']);
    expect(pick([2])).toEqual(['A', 'B']);
  });

  it('같은 대기 구간이면 같은 점수다 — 화면 문구와 순위가 어긋나지 않는다', () => {
    // 1대에 2명(기체당 2.0)과 2대에 5명(기체당 2.5)은 둘 다 '보통' 이다.
    // 머릿수는 다르지만 화면 문구가 같으므로 점수도 같아야 한다.
    const a = arcade('A', { km: 1, machines: [machine(1, { wait: 2 })] });
    const b = arcade('B', {
      km: 1,
      machines: [machine(1, { conditions: [null, null], wait: 5 })],
    });
    const ranked = rankArcades({
      arcades: [a, b],
      origin: ORIGIN,
      weights: ONLY('wait'),
      radiusKm: 5,
    });
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('대기는 **기체당** 인원으로 잰다 — 대수가 많으면 줄이 빨리 준다', () => {
    // 머릿수는 6명으로 같지만, 3대(기체당 2명 '보통')가 1대(기체당 6명
    // '매우 많음')보다 위여야 한다. 머릿수로 재면 둘이 같아진다.
    const many = arcade('3대', {
      km: 1,
      machines: [machine(1, { conditions: [null, null, null], wait: 6 })],
    });
    const one = arcade('1대', { km: 1, machines: [machine(1, { wait: 6 })] });
    expect(names([one, many], ONLY('wait'))).toEqual(['3대', '1대']);
  });
});


// ─── 1·2·3순위 → 내부 점수 ───────────────────────────────────

describe('우선순위 순서', () => {
  it('1순위 5점 · 2순위 3점 · 3순위 2점', () => {
    expect(PRIORITY_POINTS).toEqual([5, 3, 2]);
    expect(weightsFromOrder(['condition', 'wait', 'distance'])).toEqual({
      condition: 5,
      wait: 3,
      distance: 2,
    });
    expect(weightsFromOrder(['distance', 'condition', 'wait'])).toEqual({
      condition: 3,
      wait: 2,
      distance: 5,
    });
  });

  it('3순위도 0 이 아니다 — "3순위" 가 "안 본다" 와 같아지면 안 된다', () => {
    const w = weightsFromOrder(['distance', 'wait', 'condition']);
    expect(w.condition).toBeGreaterThan(0);
  });

  it('순서를 바꾸면 순위가 실제로 뒤집힌다', () => {
    const near = arcade('가까움', { km: 0.5, machines: [machine(1, { conditions: [1] })] });
    const good = arcade('상태좋음', { km: 4, machines: [machine(1, { conditions: [5] })] });

    const byOrder = (o: PriorityOrder) =>
      rankArcades({
        arcades: [near, good],
        origin: ORIGIN,
        weights: weightsFromOrder(o),
        radiusKm: 5,
      })[0].arcade.name;

    expect(byOrder(['distance', 'wait', 'condition'])).toBe('가까움');
    expect(byOrder(['condition', 'wait', 'distance'])).toBe('상태좋음');
  });

  it('세 칸이 다 차고 서로 겹치지 않아야 완성이다', () => {
    expect(isCompleteOrder(['condition', 'wait', 'distance'])).toBe(true);
    expect(isCompleteOrder(['condition', 'wait', null])).toBe(false);
    expect(isCompleteOrder(['condition', 'condition', 'distance'])).toBe(false);
    expect(isCompleteOrder(['condition', 'wait'])).toBe(false);
  });
});

// ─── 안정성 ──────────────────────────────────────────────────

describe('순위의 안정성', () => {
  it('동점이면 가까운 쪽, 그다음 이름 — 입력 순서에 흔들리지 않는다', () => {
    const a = arcade('나', { km: 1 });
    const b = arcade('가', { km: 1 });
    const w = ONLY('condition'); // 둘 다 근거 없음 → 동점
    expect(names([a, b], w)).toEqual(names([b, a], w));
    expect(names([a, b], w)).toEqual(['가', '나']);
  });

  it('입력 배열을 건드리지 않는다', () => {
    const list = [arcade('B', { km: 3 }), arcade('A', { km: 1 })];
    const before = list.map((a) => a.name);
    rankArcades({ arcades: list, origin: ORIGIN, weights: DEFAULT_WEIGHTS, radiusKm: 5 });
    expect(list.map((a) => a.name)).toEqual(before);
  });

  it('rank 는 1부터 빈틈 없이 매겨진다', () => {
    const list = [arcade('A', { km: 1 }), arcade('B', { km: 2 }), arcade('C', { km: 3 })];
    const ranked = rankArcades({
      arcades: list,
      origin: ORIGIN,
      weights: DEFAULT_WEIGHTS,
      radiusKm: 5,
    });
    expect(ranked.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('반경이 좁아지면 거리 점수가 그만큼 더 벌어진다', () => {
    const near = arcade('가까움', { km: 0.2 });
    const far = arcade('멂', { km: 0.9 });
    const gap = (radiusKm: number) => {
      const r = rankArcades({
        arcades: [near, far],
        origin: ORIGIN,
        weights: ONLY('distance'),
        radiusKm,
      });
      return r[0].score - r[1].score;
    };
    // 반경 30km 기준으로는 둘 다 "코앞" 이라 점수가 뭉친다.
    expect(gap(1)).toBeGreaterThan(gap(30));
  });

  it('점수는 0~100 을 벗어나지 않는다', () => {
    const best = arcade('최고', { km: 0, machines: [machine(1, { conditions: [5], wait: 0 })] });
    const worst = arcade('최악', {
      km: 99,
      machines: [machine(1, { conditions: [1], wait: 99 })],
    });
    const ranked = rankArcades({
      arcades: [best, worst],
      origin: ORIGIN,
      weights: DEFAULT_WEIGHTS,
      radiusKm: 5,
    });
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(0);
  });
});

// ─── 사이드바 목록 순서 · 페이지 ────────────────────────────────

/**
 * rankArcades 출력 흉내 — 점수순으로 정렬된 배열.
 * 아래 함수들은 arcade.id 와 arcade.name, distanceKm 만 본다.
 */
const s = (id: number, name: string, km: number | null, rank: number): ScoredArcade => {
  const f = { score: 0.5, known: false, label: '' };
  return {
    arcade: { id, name } as ScoredArcade['arcade'],
    rank,
    score: 100 - rank,
    distanceKm: km,
    factors: { condition: f, wait: f, distance: f },
    confidence: 1,
    topFactor: null,
  };
};

// 점수순(= 배열 순서)과 거리순이 일부러 어긋나 있다
const SCORED = [
  s(1, '가', 9, 1), // 점수 1위인데 가장 멀다
  s(2, '나', 1, 2),
  s(3, '다', 5, 3),
  s(4, '라', 2, 4),
  s(5, '마', 7, 5),
];

describe('sortForList — 목록 순서만 정한다 (자르지 않는다)', () => {
  it('거리순 모드는 가까운 순', () => {
    expect(sortForList(SCORED, 'distance').map((x) => x.arcade.name)).toEqual([
      '나',
      '라',
      '다',
      '마',
      '가',
    ]);
  });

  it('추천순 모드는 rankArcades 가 세운 순서를 그대로 쓴다', () => {
    // 동점 처리 규칙(점수 → 거리 → 이름)을 두 곳에 적지 않기 위해서다
    expect(sortForList(SCORED, 'score').map((x) => x.arcade.name)).toEqual([
      '가',
      '나',
      '다',
      '라',
      '마',
    ]);
  });

  it('개수는 그대로 — 자르는 일은 페이지가 한다', () => {
    expect(sortForList(SCORED, 'distance')).toHaveLength(SCORED.length);
    expect(sortForList([], 'distance')).toEqual([]);
  });

  it('원본 배열을 건드리지 않는다 — inRadius 는 지도가 같이 쓴다', () => {
    const before = SCORED.map((x) => x.arcade.name);
    sortForList(SCORED, 'distance');
    expect(SCORED.map((x) => x.arcade.name)).toEqual(before);
  });

  it('거리를 모르는 곳은 뒤로 밀고 이름순으로 갈라 순서가 흔들리지 않는다', () => {
    const unknown = [s(1, '나중', null, 1), s(2, '먼저', null, 2), s(3, '가까움', 1, 3)];
    expect(sortForList(unknown, 'distance').map((x) => x.arcade.name)).toEqual([
      '가까움',
      '나중',
      '먼저',
    ]);
  });
});

describe('pageSlice — 한 페이지 분량', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it('1페이지는 앞의 pageSize 개', () => {
    expect(pageSlice(items, 1, 3)).toEqual([1, 2, 3]);
  });

  it('마지막 페이지는 남은 만큼', () => {
    expect(pageSlice(items, 3, 3)).toEqual([7]);
  });

  it('범위를 벗어난 페이지는 양 끝으로 붙인다 — 빈 화면을 보여 주지 않는다', () => {
    expect(pageSlice(items, 0, 3)).toEqual([1, 2, 3]);
    expect(pageSlice(items, -5, 3)).toEqual([1, 2, 3]);
    expect(pageSlice(items, 99, 3)).toEqual([7]);
  });

  it('빈 목록이면 빈 배열', () => {
    expect(pageSlice([], 1, 3)).toEqual([]);
    expect(pageSlice([], 9, 3)).toEqual([]);
  });

  it('pageSize 가 0 이하면 빈 배열', () => {
    expect(pageSlice(items, 1, 0)).toEqual([]);
    expect(pageSlice(items, 1, -3)).toEqual([]);
  });
});

describe('pageOfArcade — 선택한 곳이 있는 페이지', () => {
  const ordered = sortForList(SCORED, 'distance'); // 나 라 다 마 가

  it('앞의 두 곳은 1페이지', () => {
    expect(pageOfArcade(ordered, 2, 2)).toBe(1); // '나'
    expect(pageOfArcade(ordered, 4, 2)).toBe(1); // '라'
  });

  it('그 뒤는 2페이지 — 멀리 있는 지도 핀을 눌렀을 때 넘길 곳', () => {
    expect(pageOfArcade(ordered, 3, 2)).toBe(2); // '다'
    expect(pageOfArcade(ordered, 1, 2)).toBe(3); // '가' (가장 멀다)
  });

  it('목록에 없으면 null — 반경 밖으로 나간 선택', () => {
    expect(pageOfArcade(ordered, 999, 2)).toBeNull();
  });

  it('선택이 없으면 null', () => {
    expect(pageOfArcade(ordered, null, 2)).toBeNull();
  });

  it('pageSize 가 0 이하면 null', () => {
    expect(pageOfArcade(ordered, 2, 0)).toBeNull();
  });
});

describe('sortForList(rating) — 기준점이 없을 때의 순서', () => {
  /** 평점·리뷰 수까지 보는 픽스처 (byRatingThenName 은 arcade 쪽 값을 본다) */
  const withRating = (
    id: number,
    name: string,
    ratingAvg: number | null,
    reviewCount: number,
  ): ScoredArcade => {
    const f = { score: 0.5, known: false, label: '' };
    return {
      arcade: { id, name, ratingAvg, reviewCount } as ScoredArcade['arcade'],
      rank: id,
      score: 0,
      distanceKm: null,
      factors: { condition: f, wait: f, distance: f },
      confidence: 1,
      topFactor: null,
    };
  };

  it('평점 높은 순, 평점 없는 곳은 뒤로', () => {
    const list = [
      withRating(1, '무평점', null, 0),
      withRating(2, '3.5점', 3.5, 4),
      withRating(3, '4.8점', 4.8, 40),
    ];
    expect(sortForList(list, 'rating').map((x) => x.arcade.name)).toEqual([
      '4.8점',
      '3.5점',
      '무평점',
    ]);
  });

  it('평점이 같으면 리뷰가 많은 쪽이 먼저', () => {
    const list = [withRating(1, '리뷰1건', 5, 1), withRating(2, '리뷰9건', 5, 9)];
    expect(sortForList(list, 'rating').map((x) => x.arcade.name)).toEqual([
      '리뷰9건',
      '리뷰1건',
    ]);
  });

  it('평점·리뷰가 같으면 이름순 — 순서가 흔들리지 않게', () => {
    const list = [withRating(1, '나', 4, 2), withRating(2, '가', 4, 2)];
    expect(sortForList(list, 'rating').map((x) => x.arcade.name)).toEqual(['가', '나']);
  });

  it('리뷰가 0건이면 평점 값이 남아 있어도 뒤로 — 캐시가 어긋난 경우', () => {
    const list = [withRating(1, '리뷰없음', 5, 0), withRating(2, '리뷰있음', 2, 1)];
    expect(sortForList(list, 'rating').map((x) => x.arcade.name)).toEqual([
      '리뷰있음',
      '리뷰없음',
    ]);
  });
});

describe('selectedFirst — 선택한 곳은 즐겨찾기보다 위', () => {
  it('선택한 줄을 맨 위로 올리고 나머지 순서는 그대로', () => {
    const out = selectedFirst(SCORED, 4);
    expect(out.map((x) => x.arcade.name)).toEqual(['라', '가', '나', '다', '마']);
  });

  it('즐겨찾기보다 위다 — favoritesFirst 다음에 부른다', () => {
    const withFav = favoritesFirst(SCORED, new Set([3, 5])); // 다 마 가 나 라
    const out = selectedFirst(withFav, 2); // '나' 를 선택
    expect(out.map((x) => x.arcade.name)).toEqual(['나', '다', '마', '가', '라']);
  });

  it('선택한 곳이 즐겨찾기이기도 하면 한 번만 올라간다', () => {
    const withFav = favoritesFirst(SCORED, new Set([5]));
    const out = selectedFirst(withFav, 5);
    expect(out.map((x) => x.arcade.id)).toEqual([5, 1, 2, 3, 4]);
    expect(new Set(out.map((x) => x.arcade.id)).size).toBe(out.length);
  });

  it('선택이 없거나 목록에 없으면 그대로 돌려준다', () => {
    expect(selectedFirst(SCORED, null)).toBe(SCORED);
    expect(selectedFirst(SCORED, 999)).toBe(SCORED);
  });

  it('이미 맨 위면 그대로 돌려준다', () => {
    expect(selectedFirst(SCORED, 1)).toBe(SCORED);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = SCORED.map((x) => x.arcade.id);
    selectedFirst(SCORED, 4);
    expect(SCORED.map((x) => x.arcade.id)).toEqual(before);
  });
});

describe('favoritesFirst — 담아 둔 곳은 목록 맨 위', () => {
  it('즐겨찾기를 앞으로 당기고 그 안의 순서는 유지한다', () => {
    const out = favoritesFirst(SCORED, new Set([3, 5]));
    // '다'(3) '마'(5) 는 입력 순서(점수순)를 그대로 유지한 채 앞으로 온다
    expect(out.map((x) => x.arcade.name)).toEqual(['다', '마', '가', '나', '라']);
  });

  it('나머지의 순서도 그대로다', () => {
    const byDistance = sortForList(SCORED, 'distance'); // 나 라 다 마 가
    const out = favoritesFirst(byDistance, new Set([1]));
    expect(out.map((x) => x.arcade.name)).toEqual(['가', '나', '라', '다', '마']);
  });

  it('즐겨찾기가 없으면 입력을 그대로 돌려준다', () => {
    expect(favoritesFirst(SCORED, new Set())).toBe(SCORED);
    expect(favoritesFirst(SCORED, new Set([999]))).toBe(SCORED);
  });

  it('전부 즐겨찾기면 순서가 그대로다', () => {
    const out = favoritesFirst(SCORED, new Set([1, 2, 3, 4, 5]));
    expect(out.map((x) => x.arcade.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = SCORED.map((x) => x.arcade.id);
    favoritesFirst(SCORED, new Set([5]));
    expect(SCORED.map((x) => x.arcade.id)).toEqual(before);
  });
});
