/**
 * DB 의 오락실이 네이버 지도에 실제로 있는지 확인합니다.
 *
 * 인허가 데이터(source='localdata')는 "등록된 업소" 이고 네이버 지도는 "지금 간판이
 * 있는 가게" 입니다. 등록만 남고 실제로는 없는 곳을 걸러내려면 후자에 물어봐야
 * 합니다. 다만 지역 검색 API 에는 이 판정을 **틀리게 만드는 제약이 둘** 있어서,
 * 그대로 "검색해서 안 나오면 없음" 으로 처리하면 실재하는 오락실을 지웁니다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * [제약 1 · 한 질의에 최대 5건, start 는 무시된다]
 *   lib/naver-local.ts 파일 주석에 적힌 그대로입니다. 그래서 체인 이름은
 *   원하는 지점이 상한 밖으로 밀려 **영원히 안 보입니다.**
 *     "경기 왕오락실" → 포천·평택·광주·고양·용인 5곳. 남양주는 없음.
 *     남양주 왕오락실이 없는 게 아니라, 5건 상한에 잘린 것입니다.
 *   → 그래서 **상한에 걸린 질의는 '없음' 의 근거가 될 수 없습니다.** 이 파일은
 *     그 경우를 'inconclusive'(판단불가)로 따로 냅니다. 지우지 않습니다.
 *
 * [제약 2 · 인허가 상호와 네이버 간판 이름이 다르다]
 *   DB '대빵오락실(삼화점)'  ↔  네이버 '대빵오락실 제주삼화점'
 *   DB '킹콩청소년 오락실'   ↔  네이버에는 다른 이름이거나 없음
 *   이름 문자열 비교만으로는 멀쩡한 가게가 '없음' 이 됩니다.
 *   → 그래서 **좌표**를 1순위 근거로 씁니다. 우리는 모든 행에 위경도를 갖고
 *     있고(주소를 지오코딩해 넣었습니다), 검색 결과도 좌표를 줍니다. 반경 안에
 *     오락실 카테고리 가게가 있으면 이름 표기가 달라도 같은 곳으로 봅니다.
 * ─────────────────────────────────────────────────────────────────────
 *
 * 판정은 셋입니다:
 *   'found'        반경 안에 결과가 있거나, 이름이 같고 같은 시·군·구다 → 유지
 *   'absent'       가장 좁은 질의가 **상한에 걸리지 않았는데도** 아무것도 못 맞췄다
 *                  → 네이버에 없다고 볼 수 있는 유일한 경우
 *   'inconclusive' 상한(5건)에 걸렸다 → 알 수 없음. 지우면 안 된다
 */

import { distanceKm } from './geo.ts';
import {
  LOCAL_MAX_DISPLAY,
  isArcadeCategory,
  normalizeName,
  stripTags,
  toLatLng,
  type NaverLocalItem,
} from './naver-local.ts';

/** 네이버 검색에 넣을 시도 축약 이름. 전체 이름을 넣으면 결과가 줄어듭니다 */
export const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
  // 광주·전남 통합 행정구역명. 인허가 데이터에 이 표기로 들어옵니다
  전남광주통합특별시: '광주',
};

export interface Region {
  /** 검색에 쓰는 시도 축약 이름 */
  sido: string;
  /** 시·군·구. 주소 둘째 토큰 */
  sgg: string;
  /** 검색의 기본 단위가 되는 시·군 (cityOf) */
  city: string;
}

export function regionOf(address: string): Region {
  const t = address.trim().split(/\s+/);
  return {
    sido: SIDO_SHORT[t[0]] ?? t[0] ?? '',
    sgg: t[1] ?? '',
    city: cityOf(address),
  };
}

/**
 * 검색에 쓸 **시·군** 이름. 도 아래의 시·군과 광역시는 같은 급이므로 하나로
 * 다룹니다:
 *   '경기도 김포시 …'        → '김포시'
 *   '충청북도 음성군 …'      → '음성군'
 *   '대구광역시 중구 …'      → '대구'   (구는 시의 하위라 시 이름을 씁니다)
 *   '서울특별시 송파구 …'    → '서울'
 *
 * 광역시에서 `구` 를 쓰지 않는 이유: '중구'·'북구'·'남구' 는 여러 광역시에 같은
 * 이름으로 있어서, 그것만으로 검색하면 다른 도시 결과가 섞입니다.
 */
export function cityOf(address: string): string {
  const t = address.trim().split(/\s+/);
  const head = t[0] ?? '';
  const short = SIDO_SHORT[head];
  // 특별시·광역시·특별자치시(및 통합특별시)는 그 자체가 시입니다
  if (short && /(특별시|광역시|특별자치시)$/.test(head)) return short;
  return t[1] ?? short ?? head;
}

/**
 * 넣어 볼 질의들.
 *
 * **[0] 은 '시·군 + 이름' 입니다** — 이것이 판정의 기준 질의이고, 5건 상한 검사도
 * 이 질의로 합니다. 광역시는 구가 아니라 시 이름을 씁니다(cityOf 주석 참고).
 * 뒤의 둘은 못 찾았을 때 한 번 더 보는 것으로, 찾을 확률만 올립니다.
 */
export function buildQueries(name: string, r: Region): string[] {
  const list = [
    r.city ? `${r.city} ${name}` : '',
    r.sido && r.sgg ? `${r.sido} ${r.sgg} ${name}` : '',
    r.sido ? `${r.sido} ${name}` : '',
  ];
  return [...new Set(list.filter(Boolean))];
}

/**
 * 주소에서 법정동(읍·면)을 뽑습니다. 인허가 주소는 두 모양으로 옵니다:
 *   '서울특별시 서초구 효령로31길 58, 1층 (방배동)'   → 괄호 안
 *   '충청북도 음성군 대소읍 성본상가1길 77, 102호'     → 세 번째 토큰
 * 못 뽑으면 빈 문자열.
 */
export function dongOf(address: string): string {
  const paren = address.match(/\(([^)]*)\)\s*$/);
  if (paren) {
    // '(방배동, 래미안원페를라)' 처럼 아파트 이름이 같이 오므로 첫 조각만
    const first = paren[1].split(',')[0].trim();
    if (/[동읍면리]$/.test(first)) return first;
  }
  for (const t of address.trim().split(/\s+/).slice(2, 4)) {
    if (/[동읍면]$/.test(t)) return t;
  }
  return '';
}

/**
 * absent 로 기울었을 때 한 번 더 넣어 보는 질의들.
 *
 * 이름으로 찾는 방식의 한계가 여기서 드러납니다 — **인허가 상호와 간판 이름이
 * 다르면 검색이 0건이 되고, 0건은 비교할 좌표조차 주지 않습니다.** 실제로 본
 * 경우들:
 *   '엔엔대빵오락실'(서초구 방배동)  ↔ 네이버 '대빵오락실 방배점'  (법인명 접두)
 *   '펀존게임랜드(중앙로점)'         ↔ 지점명 괄호 때문에 0건
 *   '금자오락실 현풍점'              ↔ 지점명 때문에 0건
 *
 * 그래서 둘을 더 넣습니다:
 *   1. **지점명을 뗀 이름** — splitAtArcadeWord 의 base. 괄호·지점명이 사라져
 *      체인 본점들이 나오고, 그중 하나가 반경 안이면 같은 곳입니다.
 *   2. **이름 없이 '동 + 오락실'** — 이름이 아예 다른 경우를 위한 마지막 수단.
 *      법정동은 시·군·구보다 좁아 5건 상한에 걸릴 확률이 낮습니다.
 *
 * 2번은 이름을 안 보므로 좌표로만 판정해야 합니다. 그래서 judge 에 넘길 때
 * nameFree=true 로 표시해 이름 규칙을 끕니다.
 */
export function rescueQueries(
  name: string,
  address: string,
  r: Region,
  baseName: string,
): { query: string; nameFree: boolean }[] {
  const out: { query: string; nameFree: boolean }[] = [];
  const region = [r.sido, r.sgg].filter(Boolean).join(' ');
  if (baseName && baseName !== name && region) {
    out.push({ query: `${region} ${baseName}`, nameFree: false });
  }
  const dong = dongOf(address);
  if (dong) out.push({ query: `${dong} 오락실`, nameFree: true });
  return out;
}

/**
 * 같은 곳으로 볼 반경.
 *
 * 처음에 300m 로 뒀다가 **40m 로 좁혔습니다.** 실측이 근거입니다 — 이름이 서로
 * 비슷한(=참일 확률이 높은) 매칭 902건의 거리는 중앙값 7m · p90 25m 였고,
 * 이름이 전혀 다른(=오판인) 매칭 365건은 중앙값 99m 였습니다. 300m 는 상가
 * 밀집지에서 옆 가게를 잡습니다:
 *   '팡팡오락실'(양평군) → 100m 거리의 '즐겨찾기오락실' 을 같은 곳으로 판정
 *   '신탄진 오락실'      → 300m 거리의 'k pop코인노래연습장'
 * 40m 로 좁히면 참인 매칭은 902건 중 848건(94%)이 남고 오판 후보는 365 → 108 로
 * 줄어듭니다.
 */
export const MATCH_RADIUS_KM = 0.04;

/**
 * ─────────────────────────────────────────────────────────────────────
 * 주소가 같은 행 병합
 *
 * 같은 오락실이 두 출처로 두 번 들어와 있습니다. 이름만 다릅니다:
 *   대구 중구 중앙대로 434-4   [naver] 놀자 / [localdata] 놀자게임장 / 놀자리듬게임장
 *   경기 안산 고잔1길 42       [naver] 대빵오락실 안산점 / [localdata] 대빵오락실
 *   서울 성동 마조로 9         [naver] 한양게임센터 / [localdata] 한양 게임장
 * 전국 1,556곳에서 60개 그룹 · 125행이 이렇습니다 (2026-08-21).
 *
 * 층·호와 끝 괄호(법정동)를 뗀 주소가 같으면 같은 자리로 봅니다 — 인허가 주소는
 * '…마조로 9, 1층 (행당동)' 처럼 뒤에 붙는 것이 있어 문자열 그대로는 안 맞습니다.
 * ─────────────────────────────────────────────────────────────────────
 */

/** 병합 비교용 주소 — 쉼표 뒤(층·호)와 끝 괄호를 떼고 공백 정리 */
export function normalizeAddress(address: string): string {
  return address
    .split(',')[0]
    .replace(/\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MergeRow {
  id: number;
  name: string;
  address: string;
  source: string | null;
  /** 네이버 검색에서 이 행과 같은 곳으로 본 결과의 이름. 없으면 null */
  naverTitle?: string | null;
}

export interface MergePlan {
  /** 남길 행 */
  keepId: number;
  /** 남길 행에 붙일 이름 */
  name: string;
  /** 지울 행 */
  dropIds: number[];
  /** 무엇을 근거로 이 이름을 골랐는지 */
  reason: string;
}

/**
 * 주소가 같은 행들을 하나로 합칠 계획을 세웁니다. 실제 DB 변경은 호출자가 합니다.
 *
 * **남기는 행**은 naver 출처를 우선합니다 — 그 행에는 사람이 확인해 채운
 * 영업시간·기종이 붙어 있을 수 있고, scripts/import-arcades.ts 가 source_ref 로
 * 다시 찾는 대상이기도 합니다. naver 행이 없으면 id 가 작은 쪽(먼저 들어온 쪽).
 *
 * **이름**은 "네이버 지도에 나오는 이름" 입니다:
 *   1. 그룹에 naver 출처 행이 있으면 그 이름 (그게 네이버가 준 이름입니다)
 *   2. 없으면 검색에서 같은 곳으로 본 결과의 이름(naverTitle)
 *   3. 둘 다 없으면 남기는 행의 이름을 그대로 둡니다
 */
export function planAddressMerges(rows: readonly MergeRow[]): MergePlan[] {
  const groups = new Map<string, MergeRow[]>();
  for (const r of rows) {
    const k = normalizeAddress(r.address);
    if (!k) continue; // 주소를 정규화할 수 없으면 건드리지 않습니다
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const plans: MergePlan[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const byId = [...g].sort((a, b) => a.id - b.id);
    const naverRows = byId.filter((r) => r.source === 'naver');
    const keep = naverRows[0] ?? byId[0];

    let name = keep.name;
    let reason = '남기는 행의 이름 유지 (네이버 이름을 못 찾음)';
    if (naverRows[0]) {
      name = naverRows[0].name;
      reason = 'naver 출처 행의 이름';
    } else {
      const titled = byId.find((r) => r.naverTitle);
      if (titled?.naverTitle) {
        name = titled.naverTitle;
        reason = `검색 결과 이름 (${titled.name} 와 같은 곳으로 판정)`;
      }
    }

    const dropIds = byId.filter((r) => r.id !== keep.id).map((r) => r.id);
    // 이름도 그대로고 지울 것도 없으면 계획에 넣지 않습니다
    if (!dropIds.length && name === keep.name) continue;
    plans.push({ keepId: keep.id, name, dropIds, reason });
  }
  return plans.sort((a, b) => a.keepId - b.keepId);
}

export type Verdict = 'found' | 'absent' | 'inconclusive';

export interface JudgeInput {
  name: string;
  lat: number;
  lng: number;
  region: Region;
  /** 질의별 결과. buildQueries 와 같은 순서 — [0] 이 가장 좁은 질의 */
  results: readonly NaverLocalItem[][];
  /**
   * 이름을 넣지 않은 질의('방배동 오락실')의 결과. **좌표로만** 비교합니다 —
   * 이름 규칙에 넣으면 같은 동의 무관한 오락실을 같은 가게로 볼 수 있습니다.
   */
  nameFreeResults?: readonly NaverLocalItem[][];
}

export interface Judgement {
  verdict: Verdict;
  /** 같은 곳으로 본 결과의 이름. verdict='found' 일 때만 */
  matchedTitle: string | null;
  /** 무엇을 근거로 그렇게 봤는지 */
  reason: string;
}

function nameLooksSame(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * 반경 안에서 가장 가까운 **오락실**을 찾습니다.
 *
 * ⚠ `isArcadeCategory` 로 카테고리를 반드시 봅니다. 안 보면 '동 + 오락실' 질의가
 * 데려온 **코인노래연습장**을 오락실로 착각합니다 — 노래방과 오락실은 같은 건물에
 * 흔히 있고, 네이버 카테고리도 '오락시설>노래방' 이라 '오락' 이 들어갑니다.
 * 실제로 이 검사를 빼먹어서 '엔엔대빵오락실' 이 76m 거리의 '리코스타 코인노래
 * 연습장' 과 같은 곳으로 판정됐습니다. 저장소에 이미 있던 함수를 안 쓴 탓입니다.
 *
 * 가장 가까운 것을 고르는 이유: 반경 안에 여럿이면 제일 가까운 쪽이 그 자리입니다.
 */
function nearestArcade(
  input: JudgeInput,
  items: readonly NaverLocalItem[],
): { title: string; km: number } | null {
  let best: { title: string; km: number } | null = null;
  for (const it of items) {
    if (!isArcadeCategory(it.category)) continue;
    const p = toLatLng(it.mapx, it.mapy);
    if (!p) continue;
    const km = distanceKm({ lat: input.lat, lng: input.lng }, p);
    if (km > MATCH_RADIUS_KM) continue;
    if (!best || km < best.km) best = { title: stripTags(it.title), km };
  }
  return best;
}

export function judge(input: JudgeInput): Judgement {
  const named = input.results.flat();
  const nameFree = (input.nameFreeResults ?? []).flat();

  // 1순위 · 이름 질의 결과 중 반경 안에 있는 **오락실**.
  const hit = nearestArcade(input, named);
  if (hit) {
    return {
      verdict: 'found',
      matchedTitle: hit.title,
      reason: `${Math.round(hit.km * 1000)}m 안에 '${hit.title}'`,
    };
  }

  // 2순위 · 이름이 같고 같은 시·군·구. 좌표가 크게 어긋난 경우를 구제합니다
  // (인허가 주소가 건물 뒤편을 가리키는 경우가 있습니다).
  // 이름 없는 질의의 결과(nameFree)는 여기에 넣지 않습니다 — 같은 동의 무관한
  // 오락실이 이름 규칙에 걸려 버립니다.
  for (const it of named) {
    // 여기서도 카테고리를 봅니다 — 이름이 같은 노래방이 있을 수 있습니다.
    if (!isArcadeCategory(it.category)) continue;
    if (!nameLooksSame(input.name, stripTags(it.title))) continue;
    const addr = `${it.roadAddress} ${it.address}`;
    if (input.region.sgg && !addr.includes(input.region.sgg)) continue;
    return {
      verdict: 'found',
      matchedTitle: stripTags(it.title),
      reason: `이름 일치 · 같은 ${input.region.sgg}`,
    };
  }

  /*
   * 3순위 · 이름 없이 '동 + 오락실' 로 물어본 결과가 반경 안에 있습니다.
   *
   * 이건 **확인도 부정도 아닙니다.** "그 자리에 오락실은 있는데 이름이 다르다" 는
   * 뜻이고, 둘 중 무엇인지 알 수 없습니다:
   *   · 간판을 바꿔 달았다 (같은 곳 — 유지해야 함)
   *   · 우리 행은 없어졌고 다른 가게가 들어왔다 (지워야 함)
   * 예전에는 이것을 found 로 처리했는데, 그래서 '팡팡오락실'(양평군)이 100m
   * 거리의 '즐겨찾기오락실' 때문에 확인됨이 되었습니다. 사람이 봐야 합니다.
   */
  const free = nearestArcade(input, nameFree);
  if (free) {
    return {
      verdict: 'inconclusive',
      matchedTitle: free.title,
      reason:
        `이름 없는 질의로 ${Math.round(free.km * 1000)}m 안에 '${free.title}' — ` +
        `그 자리에 오락실은 있으나 이름이 다름`,
    };
  }

  /*
   * 못 맞췄습니다. 이제 "없다" 고 말할 수 있는지 봅니다.
   *
   * 가장 좁은 질의가 5건을 꽉 채워 왔다면, 6번째가 우리 가게였을 수 있습니다
   * (start 가 무시되므로 더 볼 방법이 없습니다). 그건 '없음' 이 아니라 '모름'
   * 입니다 — 여기서 지우면 실재하는 체인 지점을 지웁니다.
   */
  const narrowest = input.results[0] ?? [];
  if (narrowest.length >= LOCAL_MAX_DISPLAY) {
    return {
      verdict: 'inconclusive',
      matchedTitle: null,
      reason: `가장 좁은 질의가 ${LOCAL_MAX_DISPLAY}건 상한에 걸림 — 더 볼 수 없음`,
    };
  }

  /*
   * 이름 없이 '동 + 오락실' 로 물어본 것도 상한에 걸렸다면, 그 동에 오락실이
   * 6곳 이상이라는 뜻이고 우리 가게가 6번째였을 수 있습니다. 역시 '모름' 입니다.
   */
  if ((input.nameFreeResults ?? []).some((r) => r.length >= LOCAL_MAX_DISPLAY)) {
    return {
      verdict: 'inconclusive',
      matchedTitle: null,
      reason: `이름 없는 동 단위 질의도 ${LOCAL_MAX_DISPLAY}건 상한에 걸림`,
    };
  }

  return {
    verdict: 'absent',
    matchedTitle: null,
    reason: narrowest.length
      ? `${narrowest.length}건이 왔지만 반경·이름 어느 쪽도 맞지 않음`
      : '검색 결과 0건',
  };
}
