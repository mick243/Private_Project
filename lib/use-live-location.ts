'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceKm, type Coord } from './geo';

/**
 * 내 위치를 **계속** 따라가는 훅.
 *
 * getCurrentPosition 은 그 순간의 좌표 한 번뿐이라, 걸어서 자리를 옮기면
 * 기준점은 출발한 자리에 남습니다. 지하철에서 내려 걸어가는 동안 순위가
 * 그대로면 추천은 이미 틀린 답입니다. 그래서 watchPosition 으로 붙잡고
 * 좌표가 올 때마다 기준점을 옮깁니다.
 *
 * 브라우저 API 를 직접 만지므로 클라이언트 전용입니다 (vitest 커버리지에서
 * lib/use-*.ts 가 빠져 있는 것도 같은 이유).
 */

/** 이만큼 안 움직였으면 새 좌표로 치지 않습니다 (km) */
const MIN_MOVE_KM = 0.015; // 15m

/**
 * 이보다 부정확한 좌표는 버립니다 (m).
 *
 * 실내나 지하에서는 Wi-Fi 기반 추정이 500m~2km 오차로 튀는데, 그 좌표로
 * 기준점을 옮기면 옆 동네 오락실이 1위로 올라왔다가 다음 좌표에 되돌아옵니다.
 * 오래된 정확한 좌표가 방금 받은 부정확한 좌표보다 낫습니다.
 */
const MAX_ACCURACY_M = 300;

export type LocationStatus = 'idle' | 'locating' | 'tracking' | 'error';

export interface LiveLocation {
  /** 마지막으로 채택된 좌표. 한 번도 못 받았으면 null */
  coord: Coord | null;
  /** 그 좌표의 오차 반경(m) */
  accuracyM: number | null;
  /** 채택 시각(ms). 화면에서 '몇 초 전 갱신'을 찍는 데 씁니다 */
  updatedAt: number | null;
  status: LocationStatus;
  /** 사람이 읽을 실패 사유. status 가 'error' 일 때만 채워집니다 */
  error: string | null;
  /** 추적 시작 (이미 켜져 있으면 아무 일도 안 합니다) */
  start: () => void;
  /** 추적 중지. 마지막 좌표는 기준점으로 남겨 둡니다 */
  stop: () => void;
}

function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return '위치 권한이 거부되었습니다. 브라우저 주소창의 자물쇠에서 허용해 주세요.';
    case err.POSITION_UNAVAILABLE:
      return '위치를 확인할 수 없습니다. 실내라면 창가나 실외에서 다시 시도해 주세요.';
    case err.TIMEOUT:
      return '위치 확인이 지연되고 있습니다. 계속 시도합니다…';
    default:
      return '위치를 가져오지 못했습니다.';
  }
}

export function useLiveLocation(): LiveLocation {
  const [coord, setCoord] = useState<Coord | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  // 채택 판정(움직였나?)에 state 를 쓰면 콜백이 옛 좌표를 봅니다 —
  // watchPosition 콜백은 등록 시점의 클로저를 계속 들고 있습니다.
  const lastRef = useRef<Coord | null>(null);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    // 좌표는 지우지 않습니다. 추적만 끄고 마지막 자리를 기준점으로 씁니다.
    setStatus((s) => (s === 'error' ? s : 'idle'));
  }, []);

  const start = useCallback(() => {
    if (watchIdRef.current !== null) return;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      setError('이 브라우저는 위치 기능을 지원하지 않습니다');
      return;
    }

    setStatus('locating');
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const acc = pos.coords.accuracy;

        // 추적 중이라는 사실 자체는 좌표를 버리더라도 알려야 합니다 —
        // 안 그러면 '확인 중…' 에서 영영 멈춘 것처럼 보입니다.
        setStatus('tracking');
        setError(null);

        if (Number.isFinite(acc) && acc > MAX_ACCURACY_M && lastRef.current) return;

        const prev = lastRef.current;
        if (prev && distanceKm(prev, next) < MIN_MOVE_KM) return;

        lastRef.current = next;
        setCoord(next);
        setAccuracyM(Number.isFinite(acc) ? acc : null);
        setUpdatedAt(Date.now());
      },
      (err) => {
        // TIMEOUT 은 watch 가 계속 살아 있습니다. 여기서 clearWatch 를 부르면
        // 잠깐 신호가 약했을 뿐인데 추적이 영영 꺼집니다.
        if (err.code === err.TIMEOUT) {
          setError(messageFor(err));
          return;
        }
        stop();
        setStatus('error');
        setError(messageFor(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
    );
  }, [stop]);

  // 화면을 떠날 때 watch 를 놔두면 GPS 가 계속 켜져 배터리를 먹습니다.
  useEffect(() => stop, [stop]);

  return { coord, accuracyM, updatedAt, status, error, start, stop };
}
