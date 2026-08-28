'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 레이아웃 판정 — CSS 미디어쿼리와 **같은 경계**를 JS 에서도 봅니다.
 *
 * 동작(JS)이 CSS 와 다른 폭으로 판단하면 "화면은 모바일인데 동작은 데스크톱"
 * 인 구간이 생깁니다. 그래서 경계값을 여기 상수로 두고 양쪽이 같은 값을 씁니다
 * (app/globals.css 의 @media 와 함께 고쳐야 합니다).
 */

/** 목록·지도·상세가 위아래로 쌓이는 폭 (globals.css 의 max-width: 860px) */
export const STACKED_QUERY = '(max-width: 860px)';

/**
 * 상세를 열면 **지도를 접는** 폭 (globals.css 의 max-width: 1180px).
 * 3열이 들어가지 않아서, 이 폭에서는 지도를 보려면 사이드바를 접어야 합니다.
 */
export const MAP_FOLDED_QUERY = '(max-width: 1180px)';

/**
 * 창 크기를 바꾸면 그 자리에서 따라 바뀝니다 (matchMedia 구독).
 *
 * 서버 렌더에서는 false — 창이 없으니 물을 수 없고, 데스크톱 마크업으로
 * 그려 두면 클라이언트에서 useSyncExternalStore 가 실제 값으로 맞춥니다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 세로 스택(모바일) 레이아웃인지 */
export function useIsStacked(): boolean {
  return useMediaQuery(STACKED_QUERY);
}

/**
 * 상세를 열면 지도가 접히는 폭인지.
 *
 * "지금 지도가 안 보인다" 를 판단하는 데 씁니다 — 이 폭에서 상세가 열려 있고
 * 사이드바가 펼쳐져 있으면 `.map-pane` 이 display:none 입니다.
 */
export function useIsMapFolded(): boolean {
  return useMediaQuery(MAP_FOLDED_QUERY);
}
