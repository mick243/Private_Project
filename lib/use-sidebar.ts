'use client';

import { useCallback, useState } from 'react';

/**
 * 사이드바(목록·필터)를 접었는지.
 *
 * **앱을 켜면 접혀 있습니다.** 아무것도 검색하지 않은 첫 화면에서 목록이 할 수
 * 있는 말은 몇 줄뿐이고(즐겨찾기·평점 5곳), 그 몇 줄 때문에 지도를 좁혀 둘
 * 이유가 없습니다. 펼치는 손잡이는 접어도 같은 자리에 남습니다
 * (components/SidebarHandle.tsx).
 *
 * 예전에는 마지막 선택을 localStorage 에 남겼습니다. 시작 상태가 '접힘' 으로
 * 고정된 뒤에는 그 값이 쓰일 자리가 없어졌습니다 — 저장된 '열림' 을 되살리면
 * 켤 때마다 접혀 있어야 한다는 규칙과 그대로 부딪힙니다. 규칙이 둘이면 화면은
 * 반드시 한쪽을 어깁니다.
 */
export function useSidebarOpen(): {
  open: boolean;
  toggle: () => void;
  setOpen: (next: boolean) => void;
} {
  // SSR 과 첫 렌더가 같은 값이어야 hydration 이 깨지지 않으므로 상수입니다.
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  return { open, toggle, setOpen };
}
