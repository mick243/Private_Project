/**
 * 좌표 계산. 서버·클라이언트가 **같은 식**을 써야 하는 곳입니다.
 *
 * 거리는 원래 서버(lib/arcades.ts 의 haversine CTE)가 계산해 distanceKm 로
 * 내려보냅니다. 그런데 기준점을 GPS 로 따라가기 시작하면 좌표가 몇 초마다
 * 바뀌고, 그때마다 목록을 다시 받아오면 요청이 폭주합니다. 그래서 조회는
 * 띄엄띄엄 하고(=기준점이 일정 거리 이상 움직였을 때만) 화면에 찍는 거리는
 * 매 좌표마다 여기서 다시 셉니다.
 *
 * 두 곳의 식이 어긋나면 "목록에는 1.2km 인데 반경 1km 검색에 걸린다" 같은 일이
 * 생기므로, 서버 SQL 과 같은 구면 코사인 법칙(R=6371km)을 그대로 씁니다.
 */

export interface Coord {
  lat: number;
  lng: number;
}

/** 지구 반지름(km). db/... 의 haversine 식과 같은 값이어야 합니다 */
const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * 두 좌표 사이의 대권 거리(km).
 *
 * acos 의 인자를 [-1, 1] 로 조이는 이유: 같은 좌표를 넣으면 부동소수 오차로
 * 1.0000000000000002 가 나와 acos 가 NaN 을 뱉습니다. 내 위치와 오락실이
 * 정확히 겹칠 일은 드물지만, 거리 하나가 NaN 이 되면 정렬 전체가 무너집니다.
 */
export function distanceKm(a: Coord, b: Coord): number {
  const cos =
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng) - toRad(a.lng)) +
    Math.sin(toRad(a.lat)) * Math.sin(toRad(b.lat));

  return EARTH_RADIUS_KM * Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** '0.8km' / '350m'. 1km 미만은 미터로 — "0.3km" 는 걸어갈 거리인지 감이 안 옵니다 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// ─── 화면 안 판정 ────────────────────────────────────────────

/** 지도에 지금 보이는 사각형 (위경도 그대로) */
export interface LatLngBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 사각형을 각 변의 비율만큼 넓힙니다.
 *
 * 화면 경계를 그대로 쓰면 두 가지가 어긋납니다. 마커의 이름표는 점의 **오른쪽**
 * 으로 뻗으므로, 점이 왼쪽 화면 밖으로 1px 나간 오락실도 이름표는 화면 안에
 * 보여야 합니다. 그리고 지도를 조금 끄는 동안 경계에 걸친 마커가 붙었다 떨어졌다
 * 하는 것도 여백이 흡수합니다.
 */
export function padBox(box: LatLngBox, ratio: number): LatLngBox {
  const latPad = (box.maxLat - box.minLat) * ratio;
  const lngPad = (box.maxLng - box.minLng) * ratio;
  return {
    minLat: box.minLat - latPad,
    maxLat: box.maxLat + latPad,
    minLng: box.minLng - lngPad,
    maxLng: box.maxLng + lngPad,
  };
}

/**
 * 이 좌표가 사각형 안에 있는지. 경계에 정확히 걸치면 '안' 으로 봅니다.
 *
 * 날짜변경선을 넘는 사각형(minLng > maxLng)은 다루지 않습니다 — 이 서비스는
 * 한국 안에서만 씁니다. 넘는 경우까지 받으면 판정이 두 갈래가 되고, 그 갈래는
 * 여기서 검증할 방법이 없습니다.
 */
export function inBox(box: LatLngBox, p: Coord): boolean {
  return (
    p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng
  );
}
