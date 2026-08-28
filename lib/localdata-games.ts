/**
 * 공공데이터포털(LOCALDATA) **청소년게임제공업** 인허가 조회 클라이언트.
 *
 *   행정안전부_문화_청소년게임제공업 조회서비스
 *   https://www.data.go.kr/data/15154958/openapi.do
 *
 * [왜 이걸 쓰는가 — 네이버 지역 검색과 역할이 다릅니다]
 *   네이버(lib/naver-local.ts)는 "지금 지도에 뜨는 가게"를 줍니다. 이름·주소·좌표는
 *   좋지만 **영업 여부를 알 수 없습니다**(폐업한 곳도 한동안 남습니다).
 *   이쪽은 지자체 인허가 원부라 영업상태·폐업일자·인허가일자·총게임기수가 있습니다.
 *   그래서 '영업중인 오락실'을 가려내는 근거는 이 데이터입니다.
 *
 * [명세에서 실제로 확인한 것 — 문서만 보고는 알 수 없는 것들]
 *   · 조건 필터 이름이 `cond[FIELD::OP]` 꼴입니다. 예: `cond[SALS_STTS_CD::EQ]=01`
 *     쓸 수 있는 연산자는 필드마다 정해져 있습니다(EQ · GTE · LT · LIKE).
 *   · numOfRows 상한은 **100** 입니다.
 *   · returnType=json 을 보내도, 인증키·트래픽 문제는 `response` 가 아니라
 *     `OpenAPI_ServiceResponse.cmmMsgHeader` 모양으로 옵니다. HTTP 상태는 200 입니다.
 *     그래서 status 만 봐서는 실패를 알 수 없습니다.
 *   · 결과가 1건이면 `items.item` 이 배열이 아니라 **객체 하나**로 옵니다.
 *   · 결과가 0건이면 `items` 가 빈 문자열로 오는 경우가 있습니다.
 *
 * [영업상태코드를 서버 필터로만 믿지 않는 이유]
 *   코드값의 근거는 포털 참고문서(개방자치단체코드_영업상태코드.xlsx)이고, 코드를
 *   잘못 걸면 0건이 나오는 게 아니라 **조용히 잘못된 목록**이 나옵니다. 그래서
 *   기본 동작은 전부 받아서 statusTally 로 분포를 먼저 보여준 뒤 거르는 것입니다.
 *   호출량이 걱정될 때만 statusCode 로 서버에 넘기세요.
 *
 *   거르는 조건도 코드 하나에 걸지 않습니다 — isOpenBusiness 주석 참고.
 *
 * [좌표 주의]
 *   CRD_INFO_X / CRD_INFO_Y 는 WGS84 위경도가 **아닙니다**. 포털 설명 그대로
 *   "보정계수 안 들어간 Bessel 중부원점TM(EPSG:5174)" 입니다. 그대로 지도에 찍으면
 *   엉뚱한 곳으로 갑니다. 그래서 이 파일은 변환하지 않고 tmX/tmY 라는 이름으로
 *   원본을 넘깁니다 — lat/lng 라고 부르면 누군가 반드시 지도에 꽂습니다.
 *   지도에 올릴 때는 roadAddr 를 lib/naver-geocode.ts 로 다시 지오코딩하세요.
 */

/** 이 파일이 다루는 개방서비스. slug 는 openapi.do 의 Swagger Base URL 에서 확인한 값 */
export const YOUTH_GAME_SERVICE = {
  slug: 'youth_game_providers',
  label: '청소년게임제공업(전체이용가 · 오락실 · 인형뽑기)',
  publicDataPk: '15154958',
} as const;

export const INFO_ENDPOINT = `https://apis.data.go.kr/1741000/${YOUTH_GAME_SERVICE.slug}/info`;

/** 명세상 numOfRows 상한 */
export const MAX_NUM_OF_ROWS = 100;

/**
 * 영업상태코드 '영업/정상'.
 *
 * 코드표는 포털 참고문서(개방자치단체코드_영업상태코드.xlsx)에 있지만, 전국
 * 30,713건을 받아 실제로 세어 확인한 값입니다 (2026-08-20 · 청소년게임제공업):
 *   01 영업/정상             6,780건
 *   02 휴업                      4건
 *   03 폐업                 16,755건
 *   04 취소/말소/만료/정지/중지  7,156건
 *   05 제외/삭제/전출            18건
 */
export const STATUS_OPEN = '01';

/** 기본으로 '영업중' 으로 볼 영업상태코드 */
export const OPEN_STATUS_CODES: ReadonlySet<string> = new Set([STATUS_OPEN]);

/** 응답 item 한 건. 필드가 워낙 많고 전부 문자열이라 열어 둡니다 */
export type LocaldataRow = Record<string, unknown>;

/** 우리 쪽에서 쓰는 모양으로 정리한 업소 */
export interface GameProvider {
  /** 개방자치단체코드. mngNo 와 함께여야 업소 고유키가 됩니다 */
  localCode: string | null;
  /** 관리번호 — 지자체 안에서만 유일합니다 */
  mngNo: string | null;
  name: string | null;
  /** 도로명주소 */
  roadAddr: string | null;
  /** 지번주소 */
  lotAddr: string | null;
  zip: string | null;
  tel: string | null;
  /** 인허가일자 YYYYMMDD */
  licenseDate: string | null;
  salesStatus: string | null;
  salesStatusCode: string | null;
  detailStatus: string | null;
  /** 문화체육업종명 */
  bizType: string | null;
  /** 총게임기수 */
  machineCount: string | null;
  /** 제공게임물명 */
  games: string | null;
  /** 시설면적 */
  area: string | null;
  /**
   * 휴업 기간. **거르는 데 쓰지 않습니다** — 휴업은 영업상태코드 02 로 이미
   * 표현되고, 영업을 재개해도 시작일자가 남는 경우가 있어 이 값으로 판단하면
   * 멀쩡한 업소를 떨어뜨립니다. 눈으로 확인할 때만 보세요.
   */
  hiatusFrom: string | null;
  hiatusTo: string | null;
  updatedAt: string | null;
  /** ⚠ 위경도가 아닙니다. EPSG:5174 — 파일 맨 위 [좌표 주의] 참고 */
  tmX: string | null;
  tmY: string | null;
}

export class LocaldataError extends Error {
  // ⚠ 생성자 파라미터 프로퍼티(`readonly errMsg: string`)로 쓰지 마세요.
  //   scripts/ 의 .ts 는 Node 의 타입 제거 모드로 직접 실행되는데, 그 모드는
  //   코드를 생성하지 않으므로 ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX 로 죽습니다.
  //   (lib/naver-local.ts 의 NaverLocalError 와 같은 이유입니다.)
  /** 게이트웨이가 준 오류 코드명. 없으면 빈 문자열 */
  errMsg: string;

  constructor(message: string, errMsg = '') {
    super(message);
    this.name = 'LocaldataError';
    this.errMsg = errMsg;
  }
}

/** 문자열 필드 하나 — 없거나 공백뿐이면 빈 문자열 */
function text(row: LocaldataRow, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

/** 빈 문자열은 null 로. DB·JSON 에서 '정보 없음' 을 한 가지로 표현하기 위함 */
function orNull(row: LocaldataRow, key: string): string | null {
  return text(row, key) || null;
}

/**
 * 포털은 같은 인증키를 Encoding / Decoding 두 벌로 보여줍니다.
 * URLSearchParams 가 어차피 인코딩하므로 **Decoding 값**이 맞는데, Encoding 값을
 * 붙여넣으면 `%2B` 가 `%252B` 로 이중 인코딩돼 "키가 있는데 등록되지 않은 서비스키"
 * 라는 가장 헷갈리는 실패가 됩니다. %XX 가 보이면 되돌려 놓습니다.
 */
export function normalizeServiceKey(raw: string): string {
  const key = raw.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    // 되돌릴 수 없는 모양이면 원본을 그대로 — 억지로 고치면 원인 찾기가 더 어렵습니다
    return key;
  }
}

export function readServiceKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.DATA_GO_KR_API_KEY?.trim();
  return raw ? normalizeServiceKey(raw) : null;
}

export interface InfoQuery {
  serviceKey: string;
  pageNo: number;
  numOfRows?: number;
  /** 개방자치단체코드. 주면 그 지자체만 */
  localCode?: string | null;
  /**
   * 영업상태코드를 **서버에서** 거릅니다. 기본은 걸지 않고 전부 받습니다 —
   * 파일 맨 위 [영업상태코드를 서버 필터로만 믿지 않는 이유] 참고.
   */
  statusCode?: string | null;
}

/**
 * ⚠ searchParams.set() 을 쓰지 않는 이유.
 *
 * 그 쪽은 form-urlencoded 직렬화라 `cond[SALS_STTS_CD::EQ]` 의 대괄호·콜론까지
 * `cond%5B...%3A%3AEQ%5D` 로 인코딩합니다. 게이트웨이가 이름을 디코드한 뒤
 * 비교하면 상관없지만, 원문 그대로 비교하면 **조건이 조용히 무시됩니다** —
 * 오류가 아니라 "필터가 안 걸린 전체 결과" 로 돌아오므로 알아채기 가장 어려운
 * 실패입니다. 명세에 적힌 모양(대괄호·콜론 그대로)이 두 경우 다 통하므로
 * 이름은 그대로 두고 **값만** 인코딩합니다.
 *
 * URL 의 query 는 WHATWG 규칙상 `[`·`]`·`:` 를 인코딩하지 않으므로, 아래처럼
 * url.search 에 직접 넣으면 리터럴이 그대로 살아 있습니다.
 */
export function buildInfoUrl(q: InfoQuery): URL {
  const numOfRows = Math.min(q.numOfRows ?? MAX_NUM_OF_ROWS, MAX_NUM_OF_ROWS);
  const parts = [
    `serviceKey=${encodeURIComponent(q.serviceKey)}`,
    `pageNo=${encodeURIComponent(String(q.pageNo))}`,
    `numOfRows=${numOfRows}`,
    'returnType=json',
  ];
  if (q.localCode) {
    parts.push(`cond[OPN_ATMY_GRP_CD::EQ]=${encodeURIComponent(q.localCode)}`);
  }
  if (q.statusCode) {
    parts.push(`cond[SALS_STTS_CD::EQ]=${encodeURIComponent(q.statusCode)}`);
  }
  const url = new URL(INFO_ENDPOINT);
  url.search = parts.join('&');
  return url;
}

/** 자주 나오는 게이트웨이 오류에 붙일 해결 안내 */
export function hintForError(errMsg: string): string {
  const link = `https://www.data.go.kr/data/${YOUTH_GAME_SERVICE.publicDataPk}/openapi.do`;
  if (errMsg.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
    return (
      `  · 이 개방서비스에 [활용신청]을 했는지 확인하세요 — 업종마다 따로 신청해야 합니다.\n` +
      `    ${link}\n` +
      `  · 방금 신청했다면 게이트웨이 전파를 기다려야 합니다 (몇 분 ~ 한 시간).\n` +
      `  · 키는 일반 인증키(Decoding) 값을 쓰세요.`
    );
  }
  if (errMsg.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS')) {
    return `  · 하루 트래픽(개발계정 10,000회)을 다 썼습니다. 내일 다시 하거나 --local-code 로 좁히세요.`;
  }
  if (errMsg.includes('SERVICE_ACCESS_DENIED')) {
    return `  · 활용신청이 승인 대기이거나 반려됐습니다. 마이페이지에서 확인하세요.`;
  }
  return '';
}

export interface InfoPage {
  totalCount: number;
  rows: LocaldataRow[];
}

/**
 * 응답 본문(문자열)을 페이지 하나로 해석합니다. 실패는 전부 LocaldataError.
 *
 * fetch 와 분리해 둔 이유: 여기가 함정이 몰려 있는 자리라 테스트로 고정해야
 * 합니다 (배열 아닌 item, 빈 items, 200 인데 게이트웨이 오류, JSON 아닌 본문).
 */
export function parseInfoResponse(body: string, httpStatus = 200): InfoPage {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new LocaldataError(
      `JSON 이 아닌 응답 (HTTP ${httpStatus}) — 보통 인증키/트래픽 문제입니다:\n` +
        body.slice(0, 600),
    );
  }

  const root = json as Record<string, any>;

  // 게이트웨이가 막은 요청은 response 가 아니라 이 모양으로 옵니다 (HTTP 200).
  const gw = root?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) {
    const errMsg = String(gw.errMsg ?? '');
    const hint = hintForError(errMsg);
    throw new LocaldataError(
      `공공데이터포털이 요청을 거부했습니다 — ${gw.returnAuthMsg ?? ''} ` +
        `(${errMsg} / code ${gw.returnReasonCode ?? '?'})` +
        (hint ? `\n${hint}` : ''),
      errMsg,
    );
  }

  const payload = root?.response?.body;
  if (!payload) {
    const header = root?.response?.header;
    throw new LocaldataError(
      `응답에 body 가 없습니다 (resultCode=${header?.resultCode} ${header?.resultMsg}):\n` +
        body.slice(0, 600),
    );
  }

  return {
    totalCount: Number(payload.totalCount ?? 0) || 0,
    rows: itemsOf(payload.items),
  };
}

/** items 는 배열 · {item: 배열} · {item: 객체 하나} · 빈 문자열 넷 다 옵니다 */
function itemsOf(items: unknown): LocaldataRow[] {
  if (items == null || items === '') return [];
  if (Array.isArray(items)) return items.filter(isRow);
  const item = (items as Record<string, unknown>).item;
  if (item == null || item === '') return [];
  return (Array.isArray(item) ? item : [item]).filter(isRow);
}

function isRow(v: unknown): v is LocaldataRow {
  return typeof v === 'object' && v !== null;
}

/** 상세영업상태명에 이 말이 있으면 영업상태코드가 뭐든 영업중이 아닙니다 */
const CLOSED_DETAIL = /정지|취소|말소|폐쇄|폐업|만료|중지/;

/**
 * 영업중인가.
 *
 * 코드 하나에 걸지 않고 세 가지를 다 봅니다:
 *   1. 영업상태코드가 openCodes 안에 있어야 합니다 (기본 '01' 영업/정상)
 *   2. 폐업일자가 채워져 있으면 코드가 뭐든 버립니다 — 상태 갱신이 밀린 행이 있습니다
 *   3. 상세영업상태명에 정지·취소·말소가 있으면 버립니다 — 영업상태는 '01' 인데
 *      상세는 '영업정지' 인 행이 실제로 존재합니다
 */
export function isOpenBusiness(
  row: LocaldataRow,
  openCodes: ReadonlySet<string> = OPEN_STATUS_CODES,
): boolean {
  if (!openCodes.has(text(row, 'SALS_STTS_CD'))) return false;
  if (text(row, 'CLSBIZ_YMD')) return false;
  if (CLOSED_DETAIL.test(text(row, 'DTL_SALS_STTS_NM'))) return false;
  return true;
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * 오락실인가 뽑기방인가
 *
 * 청소년게임제공업(전체이용가)은 **인형뽑기·가챠샵이 등록하는 바로 그 업종**입니다.
 * 2026-08 기준 전국 영업중 6,780곳 중 이름으로 뽑기·가챠가 드러나는 곳이 2,741곳
 * (40%)입니다. 그래서 이 데이터를 오락실 목록으로 쓰려면 걸러내야 합니다.
 *
 * [구조 신호는 못 씁니다 — 두 가지로 재 보고 포기했습니다]
 *   · 개별 레코드: "면적>=80㎡ 또는 기기>=30대" 기준으로 뽑기방 13.4% 가 통과하면서
 *     이름이 확실한 오락실의 33% 가 떨어집니다.
 *   · 체인 중앙값(노이즈가 줄어드는 쪽): 60㎡ 기준에서도 뽑기방 체인 9/106 오분류,
 *     오락실 체인 9/34 누락.
 *   면적·기기수 분포가 너무 겹칩니다. 남는 신호는 **이름** 뿐입니다.
 *
 * [단어별 실측 — 어림짐작이 아니라 세어 본 값입니다 (면적 중앙 / 기기 중앙)]
 *   오락실 729곳 89㎡ 25대 · 게임장 180곳 103㎡ 28대 · 게임랜드 307곳 130㎡ 40대
 *   게임센터 12곳 203㎡  · 게임캠프 12곳 221㎡  · 게임월드 15곳 147㎡
 *     → 오락실 어휘. 확실합니다.
 *   뽑 1813곳 40㎡ 11대 · 뽀 281곳 40㎡ · 인형 509곳 40㎡ 12대 · 토이 233곳 46㎡
 *   캐치 128곳 47㎡ · 캐칭 66곳 44㎡ · 크레인 26곳 40㎡ · 클로 11곳 48㎡
 *     → 뽑기 어휘. 확실합니다.
 *   가챠 67곳 110㎡ 42대  ← 면적이 큽니다. 가챠 기계는 작아서 42대가 110㎡ 에
 *     들어갑니다. **면적으로 판단하면 이걸 오락실로 잘못 넣습니다.**
 *   게임박스 22곳 42㎡ 14대 · 게임존 101곳 65㎡ 16대
 *     → '게임' 이 붙었지만 뽑기방 쪽 profile 입니다. 그래서 '게임' 을 단독
 *       오락실 어휘로 쓰지 않습니다.
 *
 * [그래서 셋으로 나눕니다]
 *   'claw'    뽑기 어휘가 이름에 있음 → 넣지 않습니다
 *   'arcade'  오락실 어휘가 이름에 있음 → 넣습니다
 *   'unknown' 브랜드 이름만 있어 판단 불가 (봉봉스테이션·블링팝·헌터독 …)
 *             → 넣지 않고 따로 파일로 남깁니다. 2,757곳이고 상위 브랜드는
 *               대부분 뽑기방 체인이라, 통째로 넣으면 DB 가 더 나빠집니다.
 *               사람이 훑어보고 살릴 것만 살리는 편이 낫습니다.
 *
 * lib/naver-local.ts 의 isExcludedByName(['뽑','가챠'])과 목적은 같지만 어휘가
 * 다릅니다. 그쪽은 네이버 카테고리('오락실')가 이미 1차로 걸러 준 뒤에 쓰는
 * 보조 규칙이고, 이쪽은 카테고리가 없는 인허가 데이터에서 단독으로 판단합니다.
 * ─────────────────────────────────────────────────────────────────────
 */
export type ArcadeKind = 'claw' | 'arcade' | 'unknown';

/** 이름에 있으면 뽑기·가챠 전문점으로 봅니다 */
export const CLAW_WORDS = [
  '뽑',
  '뽀', // 뽀끼뽀끼 · 뽀바방 · 뽀꼬뽀꼬 — '뽑' 으로 안 잡힙니다 (281곳)
  '인형',
  '가챠',
  '가차',
  '크레인',
  '클로',
  'CLAW', // 럭키크로우(LUCKY CLAW)
  '캐치',
  '캐칭',
  '캐쳐', // 미미캐쳐
  '캐처',
  '토이',
  'TOY',
  'UFO', // UFO 캐쳐
  '유에프오', // 한글 표기가 따로 있습니다 (유에프오게임 …)
  '캡슐',
] as const;

/** 이름에 있으면 오락실로 봅니다 */
export const ARCADE_WORDS = [
  '오락실',
  '전자오락',
  '게임장',
  '게임랜드',
  '게임센터',
  '게임프라자',
  '게임플라자',
  '게임월드',
  '게임파크',
  'GAMEPARK',
  '게임캠프',
  '게임타운',
  '게임시티',
  '게임캐슬',
  '아케이드',
  'ARCADE',
] as const;

/**
 * 이름만 보고 셋 중 하나로 분류합니다.
 *
 * 순서가 중요합니다 — 뽑기 어휘를 **먼저** 봅니다. '유에프오게임' 처럼 양쪽
 * 어휘가 다 든 이름이 있고, 그건 뽑기방입니다.
 */
export function classifyByName(name: string | null | undefined): ArcadeKind {
  const n = (name ?? '').replace(/\s/g, '').toUpperCase();
  if (!n) return 'unknown';
  if (CLAW_WORDS.some((w) => n.includes(w))) return 'claw';
  if (ARCADE_WORDS.some((w) => n.includes(w))) return 'arcade';
  return 'unknown';
}

/**
 * 법인 형태 표기. 인허가 원부는 **사업자명**을 적으므로 '(주)대빵오락실 방이점'
 * 처럼 회사 형태가 이름에 붙어 옵니다. 네이버 지역 검색은 간판 이름을 주므로
 * 이런 표기가 없습니다 (naver 출처 행에는 0건).
 *
 * ㈜ · （주） 는 지금 데이터에 없지만 같은 글자의 다른 표기라 함께 넣어 둡니다.
 * (유)·유한회사는 없고 요청 범위도 아니라서 넣지 않았습니다.
 */
const CORPORATE_FORMS = /\(주\)|（주）|㈜|주식회사/g;

/**
 * 이름에서 법인 형태 표기를 뺍니다.
 *
 * 지우는 자리에 **빈칸을 넣습니다.** 그냥 지우면 '리얼엔젤플러스(주)블루스톤' 이
 * '리얼엔젤플러스블루스톤' 으로 붙어 버립니다. 빈칸으로 바꾼 뒤 연속 공백을
 * 하나로 줄이고 앞뒤를 다듬으면 '(주)대빵오락실 방이점' → '대빵오락실 방이점',
 * '금호리조트(주) 설악오락실' → '금호리조트 설악오락실' 이 됩니다.
 *
 * 통째로 사라지는 이름(예: '(주)')은 원본을 그대로 둡니다 — 빈 이름은 넣을 수
 * 없고(NOT NULL), 이름 없는 행보다는 법인 표기가 남은 행이 낫습니다.
 *
 * 여러 번 적용해도 결과가 같습니다 (db/migrate-010 과 짝을 이룹니다).
 */
export function stripCorporateForm(name: string): string {
  const cleaned = name.replace(CORPORATE_FORMS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || name;
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * 같은 이름의 띄어쓰기 통일
 *
 * 인허가 원부는 등록된 표기를 그대로 적으므로 같은 이름이 두 벌로 옵니다:
 *   왕오락실 ×22 / 왕 오락실 ×6      대빵오락실 ×21 / 대빵 오락실 ×6
 *   지구오락실 ×20 / 지구 오락실 ×2   스타게임장 ×16 / 스타 게임장 ×3
 * 전국 1,722곳에서 47개 그룹 · 296행이 이렇습니다 (2026-08-20).
 *
 * ⚠ 이건 "같은 체인" 이 아닙니다. 다른 도시의 무관한 업소가 이름만 같을 수도
 *   있습니다. 목록에서 같은 이름이 두 표기로 보이는 것을 없애는 **표시상의**
 *   통일이고, 등록된 상호를 고쳐 쓰는 것이라는 점은 알고 있어야 합니다.
 * ─────────────────────────────────────────────────────────────────────
 */

/** 표기 통일의 비교 열쇠 — 공백만 무시합니다 (다른 글자는 다른 이름) */
export function spellingKey(name: string): string {
  return name.replace(/\s/g, '');
}

/**
 * 이름을 '브랜드 + 오락실 어휘'(base)와 지점명(rest)으로 자릅니다.
 * 어휘가 없으면 null — 그때는 이름 전체를 하나로 봅니다.
 *
 *   '왕오락실 걸포점'                    → base '왕오락실'      rest ' 걸포점'
 *   '왕 오락실(장안점)'                  → base '왕 오락실'     rest '(장안점)'
 *   '대빵오락실 노래연습장 구미점'        → base '대빵오락실'    rest ' 노래연습장 구미점'
 *
 * **왜 필요한가.** 이름 전체로만 묶으면 지점명이 붙은 순간 다른 그룹이 됩니다.
 * 그래서 '왕 오락실 신곡점' 과 '왕오락실 걸포점' 이 나란히 남았습니다. 브랜드
 * 부분만 떼어 비교해야 체인의 표기가 통일됩니다.
 *
 * 가장 **앞선** 어휘에서 자릅니다 — '대빵오락실 노래연습장…' 처럼 뒤에 다른
 * 업종 이름이 더 붙는 경우가 있고, 브랜드는 앞쪽입니다.
 */
export function splitAtArcadeWord(name: string): { base: string; rest: string } | null {
  const upper = name.toUpperCase();
  let at = -1;
  let len = 0;
  for (const w of ARCADE_WORDS) {
    const i = upper.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) {
      at = i;
      len = w.length;
    }
  }
  if (at < 0) return null;
  return { base: name.slice(0, at + len), rest: name.slice(at + len) };
}

export interface NameVariant {
  name: string;
  /** arcades.source — 'naver' · 'localdata' · 'seed' · 'manual' · null */
  source: string | null;
}

const spaceCount = (s: string) => (s.match(/\s/g) ?? []).length;

/**
 * 열쇠가 같은 표기들 중 대표를 고릅니다.
 *
 * **네이버 표기가 있으면 그것들 안에서만 고릅니다.** 두 가지 이유입니다:
 *   1. 네이버는 간판 이름을 주고 인허가 원부는 사업자 등록 표기를 줍니다.
 *      사용자가 길에서 보는 이름은 앞쪽입니다.
 *   2. scripts/import-arcades.ts 는 source_ref 로 네이버 행을 찾아 이름을
 *      **덮어씁니다.** 네이버 행의 이름을 여기서 바꿔 두면 다음 수입 실행이
 *      조용히 되돌려 놓습니다. 아예 건드리지 않는 편이 맞습니다.
 *
 * 그다음은 (많이 쓰인 표기 → 공백이 적은 쪽 → 짧은 쪽 → 사전순) 입니다.
 * 마지막 사전순은 취향이 아니라 **결정성**을 위한 것입니다 — 동수인 그룹이
 * 16개 있고, 순서가 흔들리면 실행마다 결과가 달라집니다.
 */
export function pickCanonicalName(variants: readonly NameVariant[]): string {
  if (!variants.length) throw new Error('pickCanonicalName: 후보가 비었습니다');
  const naver = variants.filter((v) => v.source === 'naver');
  const pool = naver.length ? naver : variants;

  const count = new Map<string, number>();
  for (const v of pool) count.set(v.name, (count.get(v.name) ?? 0) + 1);

  return [...count.entries()].sort(
    (a, b) =>
      b[1] - a[1] ||
      spaceCount(a[0]) - spaceCount(b[0]) ||
      a[0].length - b[0].length ||
      (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0][0];
}

/**
 * 표기가 갈린 이름들을 대표 표기로 맞춥니다. 바꿀 것만 돌려줍니다.
 *
 * **네이버 행은 절대 바꾸지 않습니다.** pickCanonicalName 이 네이버 표기를
 * 고르는 것만으로는 부족합니다 — 한 그룹 안에 네이버 표기가 **두 가지** 있으면
 * 소수쪽 네이버 행이 바뀌어 버립니다. 그 행은 다음 arcades:import 가 source_ref
 * 로 찾아 덮어써서 조용히 되돌리므로, 애초에 손대지 않습니다.
 * 그래서 네이버 표기가 갈린 그룹은 그만큼 갈린 채로 남습니다 — 되돌려질 변경을
 * 해 두는 것보다 낫습니다.
 *
 * 여러 번 적용해도 결과가 같습니다.
 */
export function unifySpellings<T extends { id: number; name: string; source: string | null }>(
  rows: readonly T[],
): { id: number; from: string; to: string }[] {
  /*
   * 비교 단위는 **브랜드 부분(base)** 입니다. 오락실 어휘가 없는 이름은 자를
   * 데가 없으니 이름 전체를 base 로 봅니다(rest 는 빈 문자열). 지점명(rest)은
   * 그대로 두고 base 의 표기만 맞춥니다.
   */
  interface Entry {
    row: T;
    base: string;
    rest: string;
  }
  const groups = new Map<string, Entry[]>();
  for (const r of rows) {
    const sp = splitAtArcadeWord(r.name);
    const base = sp ? sp.base : r.name;
    const rest = sp ? sp.rest : '';
    const k = spellingKey(base);
    const g = groups.get(k);
    const entry = { row: r, base, rest };
    if (g) g.push(entry);
    else groups.set(k, [entry]);
  }

  const changes: { id: number; from: string; to: string }[] = [];
  for (const g of groups.values()) {
    if (new Set(g.map((e) => e.base)).size < 2) continue; // 갈린 것만
    const canonical = pickCanonicalName(g.map((e) => ({ name: e.base, source: e.row.source })));
    for (const e of g) {
      if (e.row.source === 'naver') continue; // 위 주석 참고 — 손대면 수입이 되돌립니다
      if (e.base === canonical) continue;
      changes.push({ id: e.row.id, from: e.row.name, to: canonical + e.rest });
    }
  }
  return changes;
}

export function toGameProvider(row: LocaldataRow): GameProvider {
  return {
    localCode: orNull(row, 'OPN_ATMY_GRP_CD'),
    mngNo: orNull(row, 'MNG_NO'),
    name: orNull(row, 'BPLC_NM'),
    roadAddr: orNull(row, 'ROAD_NM_ADDR'),
    lotAddr: orNull(row, 'LOTNO_ADDR'),
    zip: orNull(row, 'ROAD_NM_ZIP'),
    tel: orNull(row, 'TELNO'),
    licenseDate: orNull(row, 'LCPMT_YMD'),
    salesStatus: orNull(row, 'SALS_STTS_NM'),
    salesStatusCode: orNull(row, 'SALS_STTS_CD'),
    detailStatus: orNull(row, 'DTL_SALS_STTS_NM'),
    bizType: orNull(row, 'CULTR_SPTS_TPBIZ_NM'),
    machineCount: orNull(row, 'TOTAL_GMCON_CNT'),
    games: orNull(row, 'PVSN_VG_NM'),
    area: orNull(row, 'FCAR'),
    hiatusFrom: orNull(row, 'TCBIZ_BGNG_YMD'),
    hiatusTo: orNull(row, 'TCBIZ_END_YMD'),
    updatedAt: orNull(row, 'LAST_MDFCN_PNT'),
    tmX: orNull(row, 'CRD_INFO_X'),
    tmY: orNull(row, 'CRD_INFO_Y'),
  };
}

/**
 * 업소 고유키. 관리번호는 **지자체 안에서만** 유일하므로 개방자치단체코드를
 * 반드시 붙여야 합니다. 둘 중 하나라도 없으면 이름+주소로 물러섭니다.
 */
export function providerKey(p: GameProvider): string {
  if (p.localCode && p.mngNo) return `${p.localCode}:${p.mngNo}`;
  return `n:${p.name ?? ''}|${p.roadAddr ?? p.lotAddr ?? ''}`;
}

/** 같은 업소가 두 번 들어오면 앞의 것을 남깁니다 */
export function dedupeProviders(list: readonly GameProvider[]): GameProvider[] {
  const seen = new Set<string>();
  const out: GameProvider[] = [];
  for (const p of list) {
    const k = providerKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** 필드 하나의 값 분포. 많은 것부터 */
export function tallyBy(rows: readonly LocaldataRow[], field: string): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = text(r, field) || '(빈값)';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** 한 페이지 호출 */
export async function fetchInfoPage(
  q: InfoQuery,
  opts: { timeoutMs?: number } = {},
): Promise<InfoPage> {
  const res = await fetch(buildInfoUrl(q), {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  return parseInfoResponse(await res.text(), res.status);
}

export interface CrawlOptions {
  serviceKey: string;
  localCode?: string | null;
  /** 서버에서 영업상태코드를 걸 때만. 기본은 안 걸고 전부 받습니다 */
  statusCode?: string | null;
  numOfRows?: number;
  /** 페이지 사이 간격(ms) */
  delayMs?: number;
  /**
   * 이번 실행에서 받을 페이지 수의 상한. 넘으면 truncated=true 로 알립니다 —
   * 잘렸다는 사실을 조용히 삼키면 "전국 다 받았다" 고 착각하게 됩니다.
   */
  maxPages?: number;
  /** 영업중으로 볼 영업상태코드 */
  openCodes?: ReadonlySet<string>;
  onPage?: (info: {
    pageNo: number;
    lastPage: number;
    fetched: number;
    totalCount: number;
  }) => void | Promise<void>;
}

export interface CrawlResult {
  /** 서버가 알려준 전체 건수 */
  totalCount: number;
  /** 받은 것 전부 (필터 전) */
  rows: LocaldataRow[];
  /** 영업중만, 중복 제거까지 */
  open: GameProvider[];
  /** 영업상태코드 분포 (필터 전). 코드표를 눈으로 확인하는 근거 */
  statusTally: [string, number][];
  /** 중복으로 버린 건수. 0 이 아니면 페이지네이션 중에 원본이 움직인 것입니다 */
  duplicates: number;
  /** maxPages 에 걸려 덜 받았는지 */
  truncated: boolean;
  pagesFetched: number;
}

/**
 * 전체(또는 한 지자체)를 페이지 끝까지 돌며 영업중인 업소만 추려냅니다.
 *
 * 전국 한 업종이 numOfRows=100 기준 100~200 호출이라, 개발계정 하루 한도
 * 10,000 회에 비하면 한 번 다 받는 편이 훨씬 안전합니다 — 서버 필터에 잘못된
 * 코드를 걸어 조용히 틀린 목록을 얻는 것보다 낫습니다.
 */
export async function crawlOpenProviders(opts: CrawlOptions): Promise<CrawlResult> {
  const numOfRows = Math.min(opts.numOfRows ?? MAX_NUM_OF_ROWS, MAX_NUM_OF_ROWS);
  const base = {
    serviceKey: opts.serviceKey,
    numOfRows,
    localCode: opts.localCode ?? null,
    statusCode: opts.statusCode ?? null,
  };

  const first = await fetchInfoPage({ ...base, pageNo: 1 });
  const rows: LocaldataRow[] = [...first.rows];
  const lastPage = Math.max(1, Math.ceil(first.totalCount / numOfRows));
  const limit = Math.min(lastPage, opts.maxPages ?? lastPage);

  await opts.onPage?.({ pageNo: 1, lastPage, fetched: rows.length, totalCount: first.totalCount });

  for (let p = 2; p <= limit; p += 1) {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const page = await fetchInfoPage({ ...base, pageNo: p });
    rows.push(...page.rows);
    await opts.onPage?.({
      pageNo: p,
      lastPage,
      fetched: rows.length,
      totalCount: first.totalCount,
    });
  }

  const openRaw = rows.filter((r) => isOpenBusiness(r, opts.openCodes)).map(toGameProvider);
  const open = dedupeProviders(openRaw);

  return {
    totalCount: first.totalCount,
    rows,
    open,
    statusTally: tallyBy(rows, 'SALS_STTS_CD'),
    duplicates: openRaw.length - open.length,
    truncated: limit < lastPage,
    pagesFetched: limit,
  };
}
