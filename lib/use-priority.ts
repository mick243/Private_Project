'use client';

import { useCallback, useEffect, useState } from 'react';
import { FACTORS, type FactorKey, type PartialOrder } from './recommend';

/**
 * 마지막으로 고른 1·2·3순위를 브라우저에 남깁니다.
 *
 * "컨디션이 제일 중요하다" 같은 취향은 한 번 정하면 잘 안 바뀝니다. 들어올
 * 때마다 드롭다운 세 칸을 다시 고르게 하면 두 번째부터는 안 쓰게 됩니다.
 * 대신 **자동으로 탐색을 돌리지는 않습니다** — 저장된 값은 폼의 시작값일
 * 뿐이고, 탐색은 사용자가 버튼을 눌러야 시작합니다.
 *
 * 서버는 이 값을 모릅니다. 점수 계산이 전부 클라이언트에서 끝나므로
 * (lib/recommend.ts) 계정에 붙일 이유가 아직 없습니다.
 */

const KEY = 'arcade-finder:priority';

const isFactorKey = (v: unknown): v is FactorKey =>
  typeof v === 'string' && FACTORS.some((f) => f.key === v);

/**
 * 저장된 값을 그대로 믿지 않습니다. localStorage 는 사용자가 고칠 수 있고,
 * 예전 버전이 남긴 다른 모양(가중치 객체)일 수도 있습니다. 조금이라도
 * 어긋나면 통째로 빈 값으로 돌아갑니다 — 반쯤 깨진 순서로 탐색하는 것보다
 * 다시 고르게 하는 쪽이 낫습니다.
 */
function parse(raw: string | null): PartialOrder | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr) || arr.length !== 3) return null;
    if (!arr.every(isFactorKey)) return null;
    if (new Set(arr).size !== 3) return null;
    return arr as PartialOrder;
  } catch {
    return null;
  }
}

const EMPTY: PartialOrder = [null, null, null];

export function usePriorityOrder(): {
  order: PartialOrder;
  setOrder: (next: PartialOrder) => void;
} {
  // SSR 과 첫 렌더는 항상 빈 값입니다. 초기값에서 localStorage 를 읽으면
  // 서버 HTML 과 달라져 hydration 이 깨집니다.
  const [order, setState] = useState<PartialOrder>(EMPTY);

  useEffect(() => {
    try {
      const stored = parse(window.localStorage.getItem(KEY));
      if (stored) setState(stored);
    } catch {
      /* 시크릿 모드 등 — 빈 값으로 갑니다 */
    }
  }, []);

  const setOrder = useCallback((next: PartialOrder) => {
    setState(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장에 실패해도 이번 세션 동안은 동작해야 합니다 */
    }
  }, []);

  return { order, setOrder };
}
