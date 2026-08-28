/**
 * 네이버 **지역 검색** 클라이언트 — NAVER API HUB.
 *
 * [엔드포인트가 바뀐 이유]
 *   developers.naver.com 의 검색 API 는 2026-07-31 지원이 끝났고, 지역 검색은
 *   네이버 클라우드 플랫폼(NCP) 콘솔의 **NAVER API HUB** 로 이관됐습니다.
 *     구:  https://openapi.naver.com/v1/search/local.json   (X-Naver-Client-Id/Secret)
 *     신:  https://naverapihub.apigw.ntruss.com/search/v1/local
 *          (X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY)
 *   구 경로는 HUB 게이트웨이에서 404(errorCode 300) 로 떨어집니다.
 *   쇼핑·책·전문자료 검색은 이관 없이 완전 종료됐지만 지역 검색은 살아 있습니다.
 *
 * [무엇을 가져올 수 있고 무엇을 못 가져오는가]  — 응답 필드는 이관 전과 같습니다
 *   가져옴  · title(업체명) · category · address(지번) · roadAddress(도로명)
 *           · mapx/mapy(좌표)
 *   못 가져옴 · **영업시간** — 응답에 그런 필드가 없습니다.
 *           · telephone — 필드는 있지만 항상 빈 문자열입니다(하위 호환용 잔재).
 *           · 보유 기종 — 네이버가 알 수 있는 정보가 아닙니다.
 *           · **안정된 장소 ID** — link 는 대부분 비어 있고, 있어도 업체가 등록한
 *             외부 홈페이지(인스타그램 등)입니다. 네이버 장소 고유 키가 아닙니다.
 *             그래서 같은 업체를 알아보는 기준은 이름+주소입니다 (placeKey).
 *
 *   영업시간을 가진 곳은 map.naver.com 이 내부적으로 쓰는 비공개 엔드포인트
 *   (pcmap-api.place.naver.com)뿐입니다. 문서화되지 않았고 이용약관이 금지하며
 *   예고 없이 바뀌므로 이 파일은 손대지 않습니다. 영업시간은 NULL 로 들어가고
 *   화면은 그것을 '정보 없음' 으로 표시합니다(schema.sql 의 open_time 주석).
 *
 * [응답의 함정 — 실제로 확인한 것]
 *   · display 기본값이 **1** 입니다. 안 보내면 1건만 옵니다. 항상 보냅니다.
 *   · display 상한은 5 입니다. 10 을 보내도 5 로 깎여 옵니다.
 *   · start(페이지네이션)는 **무시됩니다.** start=6 을 보내도 늘 1페이지가 옵니다.
 *     → 한 질의로는 최대 5곳이 한계이므로, 지역명을 바꿔가며 여러 번 물어봐야
 *       합니다 (lib/kr-regions.ts).
 *   · total 은 실제 결과 수가 아니라 display 와 같은 값이 옵니다. 쓰지 않습니다.
 */

// 확장자를 붙이는 이유: scripts/import-arcades.ts 가 이 파일을 Node 로 직접
// 실행합니다(순수 ESM 해석 — 확장자 생략 불가). tsconfig 의
// allowImportingTsExtensions 가 이것을 허용합니다.
import { distanceKm } from './geo.ts';

/** 지역 검색 응답의 item 한 건. 이관 전후 동일합니다 */
export interface NaverLocalItem {
  title: string;
  /** 업체가 등록한 외부 홈페이지. 대부분 빈 문자열입니다 */
  link: string;
  category: string;
  description: string;
  /** 항상 빈 문자열입니다. 필드만 남아 있습니다 */
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

/** 우리 쪽에서 쓰는 모양으로 정리한 장소 */
export interface ArcadePlace {
  name: string;
  category: string;
  /** 도로명 주소가 있으면 그것을, 없으면 지번 주소 */
  address: string;
  lat: number;
  lng: number;
  /** 업체가 등록한 홈페이지. 대부분 빈 문자열 (네이버 장소 링크가 아닙니다) */
  homepage: string;
  /**
   * 네이버 지도 검색 링크. **우리가 이름+주소로 만든 값**이고 네이버가 준 게
   * 아닙니다. 영업시간을 사람이 확인할 때 열어 볼 주소로 씁니다.
   */
  mapUrl: string;
}

/**
 * 좌표 sanity 범위. 한반도 남쪽 + 제주 + 울릉/독도까지 넉넉하게 잡습니다.
 * 이 범위를 벗어난 값은 좌표계를 잘못 읽은 것이므로 버립니다 (toLatLng 주석).
 */
const KOREA = { latMin: 32.5, latMax: 39.5, lngMin: 124.0, lngMax: 132.5 };

const ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/local';

/**
 * 엔드포인트를 바꿔 끼울 수 있게 둡니다 (NAVER_LOCAL_ENDPOINT).
 *
 * 수입 스크립트는 DB 에 쓰는 코드라 실제로 한 번은 끝까지 돌려 봐야 하는데,
 * 그러자면 매번 실제 API 를 때려야 합니다. 이 변수로 로컬 스텁 서버를 가리키면
 * 검색→파싱→중복제거→DB 반영 전체를 호출 한도를 쓰지 않고 확인할 수 있습니다.
 * 평소에는 비어 있고, 그때는 위 공식 주소를 씁니다.
 */
function endpointFor(env: Record<string, string | undefined>): string {
  return env.NAVER_LOCAL_ENDPOINT || ENDPOINT;
}

/**
 * 지역 검색이 한 번에 주는 최대 건수. 상한이 5 이고, 안 보내면 기본값이 1 이라
 * **항상 명시해서 보내야** 합니다.
 */
export const LOCAL_MAX_DISPLAY = 5;

/**
 * title 에는 검색어가 <b> 로 감싸여 오고 & < > 는 엔티티로 옵니다.
 * 그대로 DB 에 넣으면 목록에 "프리미엄<b>오락실</b>" 이 그려집니다.
 */
export function stripTags(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    // &amp; 는 마지막에 — 먼저 풀면 "&amp;lt;" 가 "<" 까지 가버립니다.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * mapx/mapy → 위경도.
 *
 * WGS84 를 1e7 배 한 정수로 옵니다 ("1269209271" → 126.9209271).
 * 아주 예전에는 KATEC 정수("308029")를 줬는데, 그 값을 1e7 로 나누면 0.03 같은
 * 값이 되어 한국 범위를 크게 벗어납니다. 그래서 나눈 뒤 범위를 확인하고, 벗어나면
 * 변환 실패로 처리합니다 — 엉뚱한 좌표를 조용히 넣는 것보다 건너뛰는 게 낫습니다
 * (지도에 아프리카 앞바다에 핀이 꽂히는 쪽이 더 고치기 어렵습니다).
 */
export function toLatLng(mapx: string, mapy: string): { lat: number; lng: number } | null {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;

  const lng = x / 1e7;
  const lat = y / 1e7;
  if (lat < KOREA.latMin || lat > KOREA.latMax) return null;
  if (lng < KOREA.lngMin || lng > KOREA.lngMax) return null;
  return { lat, lng };
}

/**
 * 카테고리의 **말단**만 떼어냅니다 ("스포츠,오락>오락실" → "오락실").
 *
 * 말단만 보는 게 핵심입니다. 상위 분류가 "스포츠,오락" 이라서 문자열 전체에
 * '오락' 이 들어 있는지로 판단하면 종합운동장·골프연습장·인라인스케이트장까지
 * 전부 오락실이 됩니다. 실제로 그렇게 걸러 봤다가 창원축구센터인라인스케이트장이
 * 목록에 들어왔습니다.
 */
export function categoryLeaf(category: string): string {
  const parts = category.split('>');
  return (parts[parts.length - 1] ?? '').replace(/\s/g, '');
}

/**
 * 오락실로 볼 말단 카테고리.
 *
 * 전국 975건을 실제로 받아 보고 정한 목록입니다. 이 밖의 것들은 이름이 그럴듯해도
 * 오락실이 아니었습니다 — '게임' 이 들어간 말단은 특히 위험합니다:
 *   컴퓨터프로그래밍,정보서비스업>게임  → 넥슨코리아, 각 지역 글로벌게임센터
 *   쇼핑,유통>게임                     → 게임 소매점 (게임샵)
 *   게임>게임제작 · 게임>게임유통       → 게임 회사
 *   스포츠,오락>보드카페               → 보드게임 카페 (63곳이나 됩니다)
 *   스포츠,오락>서바이벌게임           → 레이저택
 * '게임/오락'·'게임장'·'아케이드게임' 은 지금 응답엔 없지만 예전 표기라 남겨 둡니다.
 */
const ARCADE_LEAF: ReadonlySet<string> = new Set([
  '오락실',
  '오락시설',
  '게임/오락',
  '게임장',
  '아케이드게임',
]);

export function isArcadeCategory(category: string): boolean {
  const leaf = categoryLeaf(category);
  return leaf ? ARCADE_LEAF.has(leaf) : false;
}

/**
 * 카테고리가 빗나갔어도 이름만으로 확실한 경우를 구제합니다.
 *
 * 네이버 카테고리는 가끔 엉뚱합니다 — '펌프아케이드 구파발점'(펌프 잇 업 전용
 * 오락실)이 '스포츠,오락>스포츠시설' 로 등록돼 있습니다. 이 앱이 찾는 바로 그
 * 종류라서 놓치면 아깝습니다.
 *
 * 표시는 두 개만 씁니다. 전국 975건에 대해 확인해 보니 이 둘은 오락실이 아닌
 * 업소 이름에는 나타나지 않았습니다. '게임센터'·'게임랜드' 를 넣으면 지역
 * 글로벌게임센터(진흥기관)까지 딸려 옵니다.
 */
const NAME_MARKERS = ['오락실', '아케이드'] as const;

/**
 * 이름에 이 말이 들어가면 오락실로 보지 않습니다 — 인형뽑기·가챠 전문점.
 *
 * 네이버는 이들을 정당하게 '스포츠,오락>오락실' 로 분류합니다. 크레인 게임도
 * 아케이드 게임이니 틀린 분류가 아닙니다. 하지만 이 앱은 **리듬게임 기체**를
 * 찾는 도구이고, 뽑기·가챠 전문점에는 그런 기체가 없습니다. 전국 975건 중
 * 176곳이 여기에 해당해서, 두면 실제 찾는 오락실이 그 사이에 묻힙니다.
 *
 * 카테고리 검사보다 **먼저** 봅니다 (isArcadePlace). 카테고리가 '오락실' 로
 * 맞게 붙어 있으므로, 뒤에 두면 통과해 버립니다.
 *
 * ['뽑기'] 가 아니라 **['뽑']** 인 이유: 이 업종은 상호를 '뽑기' 로 짓지 않는
 * 쪽이 오히려 많았습니다 — 뽑아핑(12지점)·뽑스쿨·뽑다방·뽑짱·뽑차코·뽑파민·
 * 그만뽑아강… '뽑기' 만 걸러도 30곳이 남았습니다. 한 글자로 넓히면서 실제
 * 563곳을 훑어 정상 오락실이 걸리는지 확인했고, 걸린 30곳은 전부 인형뽑기
 * 전문점이었습니다. '뽑' 이 상호에 들어가는 리듬게임 오락실은 없었습니다.
 *
 * ⚠ 아직 빠져나가는 것들: '가차'(가챠 아님) 1곳, 인형방·인형나라·인형랜드 등
 *   '뽑'·'가챠' 를 안 쓰는 인형 관련 상호 5곳. 필요하면 여기에 추가하세요.
 */
const NAME_EXCLUDE = ['뽑', '가챠'] as const;

/** 이름만으로 오락실이 아니라고 판단되는가 (뽑기·가챠 전문점) */
export function isExcludedByName(name: string): boolean {
  const n = name.replace(/\s/g, '');
  return NAME_EXCLUDE.some((m) => n.includes(m));
}

/**
 * 이 장소를 오락실로 볼 것인가.
 *
 * 순서가 중요합니다: 이름 제외 → 카테고리 → 이름 구제.
 * 뽑기·가챠 전문점은 카테고리가 '오락실' 로 맞게 붙어 있어서, 제외를 먼저
 * 보지 않으면 그냥 통과합니다.
 */
export function isArcadePlace(p: { name: string; category: string }): boolean {
  if (isExcludedByName(p.name)) return false;
  if (isArcadeCategory(p.category)) return true;
  const n = p.name.replace(/\s/g, '');
  return NAME_MARKERS.some((m) => n.includes(m));
}

/**
 * 사람이 영업시간을 확인할 때 열어 볼 네이버 지도 검색 링크.
 *
 * 네이버가 장소 고유 링크를 주지 않으므로 이름+주소로 검색 URL 을 만듭니다.
 * "이 업체의 정식 페이지" 가 아니라 "이렇게 찾으면 나온다" 는 뜻입니다.
 */
export function mapSearchUrl(name: string, address: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${address}`)}`;
}

/** item → ArcadePlace. 좌표를 못 읽거나 이름·주소가 비면 null */
export function toPlace(item: NaverLocalItem): ArcadePlace | null {
  const name = stripTags(item.title ?? '');
  if (!name) return null;

  const coord = toLatLng(item.mapx ?? '', item.mapy ?? '');
  if (!coord) return null;

  const address = stripTags(item.roadAddress || item.address || '');
  if (!address) return null;

  return {
    name,
    category: stripTags(item.category ?? ''),
    address,
    lat: coord.lat,
    lng: coord.lng,
    homepage: item.link ?? '',
    mapUrl: mapSearchUrl(name, address),
  };
}

/** 이름 비교용 정규화 — 공백·괄호 차이를 없앱니다 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 같은 업체를 알아보는 열쇠 — 이름 + 주소.
 *
 * 네이버가 안정된 장소 ID 를 주지 않아서(link 는 대부분 비어 있고, 있어도 업체
 * 홈페이지입니다) 이름과 주소를 합쳐 씁니다. DB upsert 와 재수입이 이 값을
 * 기준으로 같은 행을 찾습니다.
 *
 * 한계: 네이버 쪽 등록 상호가 바뀌면 다른 업체로 보여 새 행이 생깁니다.
 * 장소 ID 가 없는 이상 피할 수 없고, 관리자 화면에서 합치는 것이 현실적입니다.
 */
export function placeKey(p: Pick<ArcadePlace, 'name' | 'address'>): string {
  return `${normalizeName(p.name)}|${p.address.replace(/\s+/g, '')}`;
}

/**
 * 같은 곳을 여러 번 담지 않게 걸러냅니다.
 *
 * 지역 검색은 질의를 조금만 바꿔도 같은 업체를 다시 주고("서울 마포구 오락실",
 * "서울 마포구 게임센터"), 한 건물에 층만 다른 별개 지점이 있기도 합니다. 그래서
 * 이름만으로도, 좌표만으로도 판단하지 않고 **이름이 같고 가까울 때**만 같은
 * 곳으로 봅니다. 좌표만 보면 같은 건물의 다른 오락실이 하나로 합쳐집니다.
 */
export function dedupePlaces(places: ArcadePlace[], withinKm = 0.15): ArcadePlace[] {
  const out: ArcadePlace[] = [];
  for (const p of places) {
    const dup = out.find(
      (q) =>
        normalizeName(q.name) === normalizeName(p.name) &&
        distanceKm({ lat: q.lat, lng: q.lng }, { lat: p.lat, lng: p.lng }) <= withinKm,
    );
    if (!dup) out.push(p);
  }
  return out;
}

export class NaverLocalError extends Error {
  // ⚠ 생성자 파라미터 프로퍼티(`readonly status: number`)로 쓰지 마세요.
  //   scripts/import-arcades.ts 는 Node 의 타입 제거 모드로 이 파일을 직접
  //   실행하는데, 그 모드는 코드를 생성하지 않으므로 파라미터 프로퍼티에서
  //   ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX 로 죽습니다.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NaverLocalError';
    this.status = status;
  }
}

/**
 * NAVER API HUB 자격증명 (NCP API Gateway 키).
 *
 * ⚠ 세 가지가 서로 다른 값입니다. 섞으면 401 이 납니다:
 *   1. 이 키 — NCP 콘솔 > NAVER API HUB 의 API Key ID / API Key
 *   2. NEXT_PUBLIC_NAVER_MAP_KEY_ID — 지도를 **그리는** NCP Maps 키
 *   3. NAVER_CLIENT_ID/SECRET — 네이버 **로그인**(OAuth) 용, developers.naver.com
 *
 * 3번을 fallback 으로 두지 않는 이유: 이관 후 HUB 는 NCP 키만 받으므로, 로그인
 * 키가 흘러들어가면 "키가 있는데 401" 이라는 가장 헷갈리는 상태가 됩니다.
 *
 * NAVER_SEARCH_CLIENT_ID/SECRET 을 계속 받는 이유: 이관 전 이름이라 이미 채워 둔
 * 설정이 있습니다. 새 이름(NAVER_HUB_API_KEY_ID/KEY)을 우선합니다.
 */
export function readCredentials(env: Record<string, string | undefined> = process.env): {
  id: string;
  secret: string;
} | null {
  const id = env.NAVER_HUB_API_KEY_ID || env.NAVER_SEARCH_CLIENT_ID || '';
  const secret = env.NAVER_HUB_API_KEY || env.NAVER_SEARCH_CLIENT_SECRET || '';
  return id && secret ? { id, secret } : null;
}

/** 지역 검색 1회 */
export async function searchLocal(
  query: string,
  opts: { display?: number; env?: Record<string, string | undefined> } = {},
): Promise<NaverLocalItem[]> {
  const env = opts.env ?? process.env;
  const cred = readCredentials(env);
  if (!cred) {
    throw new NaverLocalError(
      'NAVER_HUB_API_KEY_ID / NAVER_HUB_API_KEY 가 없습니다 (.env.local 참고)',
      0,
    );
  }

  const url = new URL(endpointFor(env));
  url.searchParams.set('query', query);
  // display 는 항상 보냅니다 — 기본값이 1 이라 빼먹으면 1건만 옵니다.
  url.searchParams.set(
    'display',
    String(Math.min(opts.display ?? LOCAL_MAX_DISPLAY, LOCAL_MAX_DISPLAY)),
  );
  // 정확도순. 'comment'(리뷰순)는 리뷰 없는 소규모 오락실을 뒤로 밀어냅니다.
  url.searchParams.set('sort', 'random');
  // start 는 무시되므로 보내지 않습니다 (파일 상단 주석 참고).

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': cred.id,
      'X-NCP-APIGW-API-KEY': cred.secret,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new NaverLocalError(
      `지역 검색 실패 (${res.status}) ${body.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as { items?: NaverLocalItem[] };
  return json.items ?? [];
}

export interface CrawlOptions {
  env?: Record<string, string | undefined>;
  /** 질의 사이 간격(ms). 지역 검색은 초당 요청이 제한됩니다 */
  delayMs?: number;
  /**
   * 이번 실행에서 쓸 수 있는 호출 수의 상한.
   *
   * 하루 한도를 지키기 위한 것입니다. 0 이면 한 번도 호출하지 않고 바로
   * 돌아옵니다 — 한도를 이미 다 쓴 날 다시 돌렸을 때의 정상 동작입니다.
   */
  maxCalls?: number;
  /** 이미 끝낸 질의. 건너뜁니다 (이어서 하기) */
  skip?: ReadonlySet<string>;
  /**
   * 호출 1건이 끝날 때마다 불립니다. **여기서 진행 상태를 저장합니다.**
   * 매 호출마다 저장하는 이유: 중간에 죽으면 그때까지 쓴 호출 수를 잊게 되고,
   * 다음 실행이 한도를 넘겨 버립니다.
   */
  onCall?: (info: {
    query: string;
    found: number;
    kept: ArcadePlace[];
    callsUsed: number;
  }) => void | Promise<void>;
}

export interface CrawlResult {
  /** 이번 실행에서 모은 것 (중복 제거 전 — 이전 실행 결과와 합친 뒤 걸러야 합니다) */
  places: ArcadePlace[];
  /** 이번 실행에서 끝낸 질의 */
  done: string[];
  callsUsed: number;
  /** 예산이 떨어져 하지 못한 질의. 비어 있으면 목록을 다 돈 것입니다 */
  remaining: string[];
}

/**
 * 질의 목록을 순서대로 돌며 오락실만 골라냅니다.
 *
 * 중복 제거는 **하지 않습니다** — 여러 날에 걸쳐 나눠 돌 수 있으므로, 이전 실행
 * 결과와 합친 다음에 한 번에 걸러야 합니다. 실행마다 걸러 버리면 어제 본 곳을
 * 오늘 또 넣게 됩니다.
 */
export async function crawlArcades(
  queries: readonly string[],
  opts: CrawlOptions = {},
): Promise<CrawlResult> {
  const budget = opts.maxCalls ?? Number.POSITIVE_INFINITY;
  const places: ArcadePlace[] = [];
  const done: string[] = [];
  let callsUsed = 0;

  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i];
    if (opts.skip?.has(q)) continue;

    if (callsUsed >= budget) {
      // 남은 것은 아직 안 끝낸 질의만. 이미 끝낸 것(skip)은 빼고 돌려줍니다.
      return {
        places,
        done,
        callsUsed,
        remaining: queries.slice(i).filter((r) => !opts.skip?.has(r)),
      };
    }

    const items = await searchLocal(q, { env: opts.env });
    callsUsed += 1;

    const kept = items
      .map(toPlace)
      .filter((p): p is ArcadePlace => p !== null && isArcadePlace(p));
    places.push(...kept);
    done.push(q);

    await opts.onCall?.({ query: q, found: items.length, kept, callsUsed });
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }

  return { places, done, callsUsed, remaining: [] };
}
