/**
 * 브이월드(VWorld) Data API — 좌표가 속한 건물의 폴리곤을 찾아 그 중심을 계산합니다.
 *
 * [왜 필요한가]
 *   lib/naver-geocode.ts 로도 못 고치는 문제가 있습니다. 네이버 지역 검색·지오코딩
 *   둘 다 "도로명주소가 가리키는 출입구 지점"을 주는데, 건물 폭이 넓거나 안쪽
 *   깊숙이 있는 상가는 그 출입구 지점이 실제 매장과 수십 m 어긋나 보입니다.
 *   이 API 는 그 좌표가 속한 **건물 폴리곤 자체**를 돌려주므로, 폴리곤 정점의
 *   면적 가중 중심(centroid)을 쓰면 적어도 "그 건물 어딘가"로는 확실히 들어갑니다.
 *
 * [데이터셋 ID — 문서에 안 나와서 실제로 호출해 확인함]
 *   scripts/vworld-test.ts 로 `LT_C_BUD` 를 먼저 시도했더니 INVALID_RANGE 로 거절됐고,
 *   WMS 레이어명(`lt_c_spbd`)을 대문자로 바꾼 `LT_C_SPBD` 가 실제로 동작했습니다.
 *   (건물통합정보 — 연속수치지형도 건물 공간정보 + 건축물대장 속성)
 *
 * [중심 계산 방식]
 *   MultiPolygon 의 각 폴리곤(첫 ring = 외곽선, 구멍은 무시)을 슈레이스 공식으로
 *   면적·중심을 구하고, 여러 파트가 있으면 면적 가중 평균으로 합칩니다. 정점을
 *   그냥 산술평균하면 오목한 모서리 쪽으로 쏠릴 수 있어 이 방식을 씁니다.
 */

const ENDPOINT = 'https://api.vworld.kr/req/data';
const DATA_ID = 'LT_C_SPBD';

export interface BuildingCentroidResult {
  lat: number;
  lng: number;
  /** bd_mgt_sn — 건물관리번호. 같은 건물인지 확인용 */
  buildingId: string;
}

export class VWorldError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'VWorldError';
    this.code = code;
  }
}

/** 폴리곤 한 ring([lng,lat][], 마지막 점 = 첫 점)의 부호 있는 면적과 중심 */
function ringCentroid(ring: [number, number][]): { area: number; cx: number; cy: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (area === 0) return { area: 0, cx: ring[0][0], cy: ring[0][1] };
  cx /= 6 * area;
  cy /= 6 * area;
  return { area: Math.abs(area), cx, cy };
}

/**
 * MultiPolygon 좌표 전체(여러 파트 가능)의 면적 가중 중심.
 *
 * 위경도 원값(126.xxx, 37.xxx)을 그대로 슈레이스 공식에 넣으면 건물 하나의
 * 크기(0.0001도 안팎)에 비해 좌표 절대값이 훨씬 커서, 큰 수끼리 빼는 과정에서
 * 유효자릿수가 날아갑니다(catastrophic cancellation) — 실제로 그렇게 짜서
 * 건물 밖으로 수십 m 튀는 결과를 봤습니다. 그래서 첫 정점을 원점으로 뺀
 * 상대좌표로 계산하고, 끝에 다시 더합니다.
 */
function multiPolygonCentroid(coordinates: [number, number][][][]): { lat: number; lng: number } {
  const ref = coordinates[0]?.[0]?.[0];
  if (!ref) throw new VWorldError('빈 폴리곤입니다', 'EMPTY_POLYGON');
  const [refX, refY] = ref;

  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (const polygon of coordinates) {
    const outer = polygon[0]; // 구멍(rings[1:])은 무시 — 건물 폴리곤엔 거의 없음
    if (!outer || outer.length < 4) continue;
    const local = outer.map(([x, y]): [number, number] => [x - refX, y - refY]);
    const { area, cx, cy } = ringCentroid(local);
    totalArea += area;
    sumX += cx * area;
    sumY += cy * area;
  }
  if (totalArea === 0) return { lng: refX, lat: refY };
  return { lng: refX + sumX / totalArea, lat: refY + sumY / totalArea };
}

export function readVWorldKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.VWORLD_API_KEY || null;
}

/**
 * 주어진 좌표가 속한 건물 폴리곤을 찾아 그 중심 좌표를 돌려줍니다.
 * 그 지점에 건물이 없으면(공터·도로 한복판 등) null.
 */
export async function getBuildingCentroid(
  coord: { lat: number; lng: number },
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<BuildingCentroidResult | null> {
  const env = opts.env ?? process.env;
  const key = readVWorldKey(env);
  if (!key) {
    throw new VWorldError(
      'VWORLD_API_KEY 이 없습니다 (.env.local 참고 — vworld.kr 에서 인증키 발급)',
      'NO_KEY',
    );
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('service', 'data');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('data', DATA_ID);
  url.searchParams.set('key', key);
  url.searchParams.set('domain', env.VWORLD_DOMAIN || 'localhost');
  url.searchParams.set('geomFilter', `POINT(${coord.lng} ${coord.lat})`);
  url.searchParams.set('geometry', 'true');
  url.searchParams.set('format', 'json');
  url.searchParams.set('size', '1');

  const res = await fetch(url);
  if (!res.ok) {
    throw new VWorldError(`VWorld 요청 실패 (${res.status})`, 'HTTP_ERROR');
  }

  const json = (await res.json()) as {
    response: {
      status: 'OK' | 'NOT_FOUND' | 'ERROR';
      error?: { code: string; text: string };
      result?: {
        featureCollection?: {
          features: {
            geometry: { type: string; coordinates: [number, number][][][] };
            properties: Record<string, string>;
          }[];
        };
      };
    };
  };

  const { response } = json;
  if (response.status === 'NOT_FOUND') return null;
  if (response.status === 'ERROR') {
    throw new VWorldError(response.error?.text ?? 'VWorld 오류', response.error?.code ?? 'UNKNOWN');
  }

  const feature = response.result?.featureCollection?.features?.[0];
  if (!feature) return null;

  if (feature.geometry.type !== 'MultiPolygon') {
    throw new VWorldError(`예상 밖 geometry 타입: ${feature.geometry.type}`, 'UNEXPECTED_GEOMETRY');
  }

  const centroid = multiPolygonCentroid(feature.geometry.coordinates);
  return { ...centroid, buildingId: feature.properties.bd_mgt_sn ?? '' };
}
