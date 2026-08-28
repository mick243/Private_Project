'use client';

import { useSyncExternalStore } from 'react';

/**
 * 지도 성능 계측 장치 — `/?perf=1` 로만 켜집니다.
 *
 * "화면 안 마커만 그려서 빨라졌다" 는 주장을 확인하려면 **같은 화면에서 끄고 켜
 * 봐야** 합니다. 프로파일러 기록 두 개를 나란히 놓는 것으로는 조건이 같았는지 알 수
 * 없습니다 — 지도 위치도 줌도, 그 사이 브라우저가 뭘 하고 있었는지도 다릅니다.
 * 그래서 컬링을 런타임에 끄고, 같은 자를 두 번 댑니다.
 *
 * 스토어를 **둘로** 나눠 둡니다. 지도(NaverMap)가 계측값까지 구독하면
 * `동기화 → 값 갱신 → 재렌더 → 동기화` 고리가 생겨 화면이 멈춥니다. 지도는
 * 제어값(cullingOff)만, 패널은 계측값만 봅니다.
 */

// ── 제어: 컬링을 껐는지 (지도가 구독) ─────────────────────────

let cullingOff = false;
const controlListeners = new Set<() => void>();

export function setCullingOff(next: boolean): void {
  if (cullingOff === next) return;
  cullingOff = next;
  for (const l of controlListeners) l();
}

export function useCullingOff(): boolean {
  return useSyncExternalStore(
    (l) => {
      controlListeners.add(l);
      return () => controlListeners.delete(l);
    },
    () => cullingOff,
    () => false,
  );
}

// ── 계측값: 지도가 밀어 넣고 패널이 구독 ───────────────────────

export interface MapMetrics {
  /** 지금 지도에 붙어 있는 마커 수 */
  markers: number;
  /** 조회 결과 전체 수 — 컬링이 없으면 이만큼 붙습니다 */
  total: number;
  /** 마지막 마커 동기화 한 번에 걸린 시간(ms) */
  syncMs: number;
  /** 그 동기화가 부른 draw() 횟수 */
  drawCalls: number;
  /** 누적 동기화 횟수 — 흔들기 측정이 앞뒤로 스냅샷을 뜹니다 */
  syncCount: number;
  /** 누적 동기화 시간 */
  syncTotalMs: number;
}

const INITIAL_METRICS: MapMetrics = {
  markers: 0,
  total: 0,
  syncMs: 0,
  drawCalls: 0,
  syncCount: 0,
  syncTotalMs: 0,
};

let metrics = INITIAL_METRICS;
const metricListeners = new Set<() => void>();

/** 마커 동기화가 끝날 때마다 지도가 부릅니다 */
export function reportSync(next: {
  markers: number;
  total: number;
  syncMs: number;
  drawCalls: number;
}): void {
  metrics = {
    ...next,
    syncCount: metrics.syncCount + 1,
    syncTotalMs: metrics.syncTotalMs + next.syncMs,
  };
  for (const l of metricListeners) l();
}

export function useMapMetrics(): MapMetrics {
  return useSyncExternalStore(
    (l) => {
      metricListeners.add(l);
      return () => metricListeners.delete(l);
    },
    () => metrics,
    () => INITIAL_METRICS,
  );
}

/**
 * draw() 호출 수를 세는 칸.
 *
 * 지도가 동기화 앞뒤로 값을 읽어 차이를 냅니다. naver 는 패닝·줌 중에도 draw() 를
 * 부르므로(오버레이가 스스로 위치를 다시 잡는다) 누적값 자체는 뜻이 흐리고,
 * **한 번의 동기화가 부른 횟수**만 의미가 있습니다.
 */
export const drawTally = { n: 0 };

// ── 흔들기 측정 ───────────────────────────────────────────────

let mapRef: naver.maps.Map | null = null;

/** 지도가 준비되면 등록합니다 — 흔들기가 이 인스턴스를 움직입니다 */
export function setPerfMap(map: naver.maps.Map | null): void {
  mapRef = map;
}

export interface ShakeResult {
  /** 초당 프레임. 60 에 가까울수록 부드럽습니다 */
  fps: number;
  /**
   * 사람이 "멈췄다" 고 느낀 시간(ms).
   *
   * 50ms 를 넘긴 작업이 **넘긴 만큼**의 합입니다 (Total Blocking Time 과 같은 셈법).
   * 50ms 를 빼는 이유: 그 아래는 어차피 프레임 하나 안쪽이라 사람이 알아채지 못합니다.
   */
  blockedMs: number;
  /** 그 사이 마커 동기화가 몇 번 돌았는지 */
  syncs: number;
  /** 그 동기화들에 걸린 시간 합 */
  syncMs: number;
  /** 그 사이 지도에 붙어 있던 마커 수 */
  markers: number;
}

/** 긴 작업으로 치는 기준(ms). 이 아래는 프레임 하나 안쪽이라 티가 나지 않습니다 */
const LONG_TASK_MS = 50;

/**
 * 지도를 좌우로 흔들면서 프레임과 멈춤을 잽니다.
 *
 * 마커가 많을 때 실제로 무거운 것은 **패닝**입니다 — naver 가 마커가 담긴 pane 을
 * 통째로 옮기므로, 브라우저는 그 안의 요소 전부를 매 프레임 다시 합성해야 합니다.
 * 그래서 가만히 둔 화면이 아니라 움직이는 화면에서 재야 합니다.
 *
 * 끝나면 원래 보던 자리로 되돌립니다 — 재 보려다 위치를 잃으면 안 됩니다.
 */
export async function shakeMap(durationMs = 4000): Promise<ShakeResult> {
  const map = mapRef;
  if (!map) throw new Error('지도가 아직 준비되지 않았습니다');

  const home = map.getCenter();

  let frames = 0;
  let raf = requestAnimationFrame(function tick() {
    frames += 1;
    raf = requestAnimationFrame(tick);
  });

  let blockedMs = 0;
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        blockedMs += Math.max(0, entry.duration - LONG_TASK_MS);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask 를 모르는 브라우저 — fps 만으로도 차이는 보입니다
  }

  const before = metrics;
  const t0 = performance.now();

  // 한 번에 크게 옮기면 화면 밖으로 나가 버리므로 좌우로 왕복시킵니다.
  let dir = 1;
  const timer = setInterval(() => {
    map.panBy(new naver.maps.Point(160 * dir, 0));
    dir *= -1;
  }, 160);

  await new Promise((r) => setTimeout(r, durationMs));

  clearInterval(timer);
  cancelAnimationFrame(raf);
  observer?.disconnect();

  const elapsed = performance.now() - t0;
  map.setCenter(home);

  return {
    fps: +(frames / (elapsed / 1000)).toFixed(1),
    blockedMs: Math.round(blockedMs),
    syncs: metrics.syncCount - before.syncCount,
    syncMs: Math.round(metrics.syncTotalMs - before.syncTotalMs),
    markers: metrics.markers,
  };
}
