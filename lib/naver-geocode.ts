/**
 * 네이버 **Geocoding**(주소→좌표) 클라이언트 — NCP Maps 의 부가 API.
 *
 * [지역 검색과 다른 점]
 *   lib/naver-local.ts 의 지역 검색은 "업체 검색"이라, 반환되는 좌표가 그
 *   업체의 대표 포인트(건물/블록 중심에 가까울 때가 많음)입니다. 반면 이 API는
 *   "주소 문자열"을 지번·도로명 주소 데이터베이스에 대조해 좌표를 뽑기 때문에
 *   같은 주소라면 실제 출입구/필지 위치에 훨씬 가깝게 나옵니다. 이미 저장된
 *   오락실의 address 를 다시 이 API로 조회해 좌표만 보정하는 용도로 씁니다
 *   (scripts/regeocode-arcades.ts).
 *
 * [자격증명이 지도를 그리는 키와 다른 이유]
 *   NEXT_PUBLIC_NAVER_MAP_KEY_ID(ncpKeyId)는 브라우저에 그대로 노출되는
 *   공개 키라 Client ID만 필요한 JS SDK 로딩에만 쓰입니다. Geocoding 은 서버에서
 *   호출하는 REST API라 Client ID + **Secret** 조합을 받습니다 — NCP 콘솔의 같은
 *   Maps 애플리케이션에서 "Geocoding" API 사용을 켜면 Client Secret 이 발급됩니다.
 *   그 값을 NAVER_MAP_CLIENT_SECRET 에 넣습니다 (Client ID는 기존 키를 그대로 씁니다).
 *
 * [응답 좌표 형식 — 지역 검색과 또 다른 함정]
 *   지역 검색의 mapx/mapy 는 WGS84 * 1e7 정수 문자열이지만, Geocoding 응답의
 *   addresses[].x/y 는 **그냥 소수 문자열**입니다 ("127.0279261"). 1e7 로 나누면
 *   안 됩니다 — 그러면 한국 범위를 한참 벗어나 버립니다.
 */

const ENDPOINT = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';

export interface GeocodeResult {
  /** 지번 또는 도로명 전체 주소 문자열 (응답 그대로) */
  roadAddress: string;
  lat: number;
  lng: number;
}

/** 좌표 sanity 범위 — lib/naver-local.ts 와 같은 값 */
const KOREA = { latMin: 32.5, latMax: 39.5, lngMin: 124.0, lngMax: 132.5 };

function endpointFor(env: Record<string, string | undefined>): string {
  return env.NAVER_GEOCODE_ENDPOINT || ENDPOINT;
}

export function readGeocodeCredentials(
  env: Record<string, string | undefined> = process.env,
): { id: string; secret: string } | null {
  const id = env.NAVER_MAP_KEY_ID || env.NEXT_PUBLIC_NAVER_MAP_KEY_ID || '';
  const secret = env.NAVER_MAP_CLIENT_SECRET || '';
  return id && secret ? { id, secret } : null;
}

export class NaverGeocodeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NaverGeocodeError';
    this.status = status;
  }
}

/**
 * 주소 문자열로 좌표를 조회합니다. 여러 후보가 나오면 **첫 번째**(가장 정확도
 * 높은 것으로 정렬돼 옴)만 씁니다. 못 찾으면 null.
 */
export async function geocodeAddress(
  address: string,
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<GeocodeResult | null> {
  const env = opts.env ?? process.env;
  const cred = readGeocodeCredentials(env);
  if (!cred) {
    throw new NaverGeocodeError(
      'NAVER_MAP_CLIENT_SECRET 이 없습니다 (.env.local 참고 — NCP 콘솔에서 Maps 애플리케이션의 Geocoding API 를 켜면 발급됩니다)',
      0,
    );
  }

  const url = new URL(endpointFor(env));
  url.searchParams.set('query', address);

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': cred.id,
      'X-NCP-APIGW-API-KEY': cred.secret,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new NaverGeocodeError(`지오코딩 실패 (${res.status}) ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as {
    status?: string;
    addresses?: { roadAddress?: string; jibunAddress?: string; x?: string; y?: string }[];
  };

  const first = json.addresses?.[0];
  if (!first || !first.x || !first.y) return null;

  const lng = Number(first.x);
  const lat = Number(first.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < KOREA.latMin || lat > KOREA.latMax) return null;
  if (lng < KOREA.lngMin || lng > KOREA.lngMax) return null;

  return {
    roadAddress: first.roadAddress || first.jibunAddress || address,
    lat,
    lng,
  };
}
