'use client';

import type { LocationStatus } from '@/lib/use-live-location';

/**
 * 지도 위에 떠 있는 '내 위치' 버튼 (왼쪽 아래).
 *
 * 사이드바에도 같은 기능의 '내 위치' 버튼이 있지만, 지도를 보며 움직이는 동안
 * 눈과 손이 가 있는 곳은 지도입니다. 위치를 다시 잡으려고 사이드바 맨 위까지
 * 올라가야 하면 지도를 보던 맥락이 끊깁니다.
 *
 * 상태를 세 가지로 구분해 보여줍니다 — 누른 뒤 아무 반응이 없으면 눌렸는지조차
 * 알 수 없기 때문입니다:
 *   idle      회색 조준점. 누르면 추적 시작
 *   locating  점멸. 첫 좌표를 기다리는 중 (실내에서는 몇 초 걸립니다)
 *   tracking  초록. 누르면 추적을 멈추고 마지막 좌표를 기준점으로 남깁니다
 */
export default function LocateButton({
  following,
  status,
  onStart,
  onStop,
}: {
  following: boolean;
  status: LocationStatus;
  onStart: () => void;
  onStop: () => void;
}) {
  const locating = following && status === 'locating';
  const tracking = following && status === 'tracking';

  const label = locating
    ? '위치 확인 중'
    : tracking
      ? '내 위치 추적 중 — 눌러서 멈춤'
      : '내 위치 추적';

  return (
    <button
      type="button"
      className={`locate-fab${tracking ? ' is-on' : ''}${locating ? ' is-locating' : ''}`}
      onClick={following ? onStop : onStart}
      // 아이콘만 있는 버튼이라 접근성 이름이 없으면 스크린리더에 "버튼" 으로만 읽힙니다.
      aria-label={label}
      aria-pressed={following}
      title={label}
    >
      {/* 조준점(crosshair). 파일로 두지 않고 인라인 SVG 로 둡니다 —
          currentColor 를 써야 상태별 색이 CSS 한 곳에서 갈립니다. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <path
          d="M12 1v4M12 19v4M1 12h4M19 12h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
