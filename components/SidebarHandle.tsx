'use client';

/**
 * 사이드바와 지도 사이 경계에 붙어 있는 접기/펴기 손잡이.
 *
 * 사이드바 안(헤더 등)에 닫기 버튼을 두면 접은 뒤에 그 버튼도 같이 사라져서
 * 다시 여는 버튼을 따로 만들어야 합니다. 버튼이 둘이면 눌러야 할 곳이 상태에
 * 따라 화면 반대편으로 옮겨 다닙니다. 하나를 경계에 두면 접든 펴든 자리가
 * 그대로입니다 — 경계가 곧 사이드바의 오른쪽 끝이기 때문입니다.
 *
 * 위치는 CSS 가 잡습니다 (app/globals.css 의 .sidebar-handle) — 상세 패널이
 * 열리면 사이드바 폭이 줄어드므로 폭을 변수(--sidebar-w) 한 곳에서 굴립니다.
 */
export default function SidebarHandle({
  open,
  onToggle,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  /** 접었다 펴는 대상(사이드바)의 id — 스크린리더가 둘을 잇습니다 */
  controls: string;
}) {
  const label = open ? '목록 접기' : '목록 펼치기';

  return (
    <button
      type="button"
      className={`sidebar-handle${open ? '' : ' is-off'}`}
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={label}
    >
      {/* 꺾쇠. 펴져 있으면 왼쪽(접는 방향), 접혀 있으면 오른쪽을 가리킵니다 —
          방향은 .is-off 에서 CSS 로 뒤집습니다. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
