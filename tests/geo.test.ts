import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistance, inBox, padBox, type LatLngBox } from '@/lib/geo';

const SEOUL = { lat: 37.5665, lng: 126.978 };

describe('distanceKm', () => {
  it('같은 좌표는 0 이다 (NaN 이 아니라)', () => {
    // acos 인자가 부동소수 오차로 1 을 넘으면 NaN 이 나오고, 거리 하나가
    // NaN 이 되면 정렬 전체가 무너진다.
    const d = distanceKm(SEOUL, { ...SEOUL });
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBe(0);
  });

  it('위도 0.009도 ≈ 1km', () => {
    const d = distanceKm(SEOUL, { lat: SEOUL.lat + 0.009, lng: SEOUL.lng });
    expect(d).toBeCloseTo(1.0, 1);
  });

  it('방향이 바뀌어도 같은 거리다', () => {
    const b = { lat: 35.1796, lng: 129.0756 }; // 부산
    expect(distanceKm(SEOUL, b)).toBeCloseTo(distanceKm(b, SEOUL), 9);
  });

  it('서울–부산은 대략 325km', () => {
    expect(distanceKm(SEOUL, { lat: 35.1796, lng: 129.0756 })).toBeGreaterThan(310);
    expect(distanceKm(SEOUL, { lat: 35.1796, lng: 129.0756 })).toBeLessThan(340);
  });

  it('대척점도 NaN 이 되지 않는다', () => {
    const d = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(d)).toBe(false);
  });
});

describe('formatDistance', () => {
  it('1km 미만은 미터로 — "0.3km" 는 걸어갈 거리인지 감이 안 온다', () => {
    expect(formatDistance(0.35)).toBe('350m');
    expect(formatDistance(0.999)).toBe('999m');
  });

  it('1km 이상은 소수 한 자리 km', () => {
    expect(formatDistance(1)).toBe('1.0km');
    expect(formatDistance(12.34)).toBe('12.3km');
  });
});

describe('padBox / inBox — 지도에 지금 보이는 것만 그리기', () => {
  /** 대략 서울 한복판 1도 사각형 */
  const BOX: LatLngBox = { minLat: 37, maxLat: 38, minLng: 126, maxLng: 127 };

  it('안쪽은 안, 밖은 밖', () => {
    expect(inBox(BOX, { lat: 37.5, lng: 126.5 })).toBe(true);
    expect(inBox(BOX, { lat: 36.9, lng: 126.5 })).toBe(false); // 남쪽 밖
    expect(inBox(BOX, { lat: 38.1, lng: 126.5 })).toBe(false); // 북쪽 밖
    expect(inBox(BOX, { lat: 37.5, lng: 125.9 })).toBe(false); // 서쪽 밖
    expect(inBox(BOX, { lat: 37.5, lng: 127.1 })).toBe(false); // 동쪽 밖
  });

  it('경계에 정확히 걸치면 안이다 — 화면 끝의 마커가 사라지지 않게', () => {
    expect(inBox(BOX, { lat: 37, lng: 126 })).toBe(true);
    expect(inBox(BOX, { lat: 38, lng: 127 })).toBe(true);
  });

  it('여백은 각 변의 비율만큼 벌어진다', () => {
    expect(padBox(BOX, 0.1)).toEqual({
      minLat: 36.9,
      maxLat: 38.1,
      minLng: 125.9,
      maxLng: 127.1,
    });
  });

  it('여백을 주면 화면 밖 마커도 살아난다 — 이름표는 점 오른쪽으로 뻗는다', () => {
    const just = { lat: 37.5, lng: 125.95 }; // 서쪽으로 조금 나간 곳
    expect(inBox(BOX, just)).toBe(false);
    expect(inBox(padBox(BOX, 0.1), just)).toBe(true);
  });

  it('여백 0 이면 그대로다', () => {
    expect(padBox(BOX, 0)).toEqual(BOX);
  });

  it('원본을 건드리지 않는다', () => {
    const before = { ...BOX };
    padBox(BOX, 0.5);
    expect(BOX).toEqual(before);
  });
});
