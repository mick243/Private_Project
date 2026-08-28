'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePlayerId } from './use-player';

/**
 * "내가 담아 둔 오락실" 을 앱 전체가 공유하는 스토어.
 *
 * 목록·상세·첫 화면이 각자 조회하면 같은 오락실의 별이 화면마다 다른 상태로
 * 남습니다 — 상세에서 담고 목록으로 돌아왔는데 별이 비어 있는 식입니다.
 * 세션 스토어(lib/use-session.ts)와 같은 모양으로, 한 벌만 두고 나눠 봅니다.
 *
 * 실제 판정은 언제나 서버가 합니다 (app/api/favorites 는 세션에서 playerId 를
 * 읽습니다). 여기 값을 조작해도 남의 즐겨찾기는 건드릴 수 없습니다.
 */

interface FavoriteState {
  ids: ReadonlySet<number>;
  /** 내용이 실제로 바뀔 때만 오릅니다 — 첫 화면 목록을 다시 받는 신호 */
  version: number;
}

/** getServerSnapshot 과 초기값이 같은 객체여야 합니다 (매번 새로 만들면 무한 렌더) */
const INITIAL: FavoriteState = { ids: new Set(), version: 0 };

let state: FavoriteState = INITIAL;
/** 지금 들고 있는 집합이 **누구의 것인지**. 계정이 바뀌면 다시 받아옵니다 */
let loadedFor: number | null = null;
/** 늦게 도착한 이전 조회가 최신 결과를 덮어쓰지 않도록 (계정이 바뀌는 순간) */
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FavoriteState {
  return state;
}

/** SSR 에서는 쿠키를 읽지 않으므로 늘 빈 집합입니다 */
function getServerSnapshot(): FavoriteState {
  return INITIAL;
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * 내용이 같으면 아무 일도 하지 않습니다.
 *
 * 별을 누르면 낙관적으로 먼저 바꾸고 서버 응답으로 한 번 더 맞추는데, 두 값이
 * 같은 게 정상입니다. 그때마다 version 을 올리면 첫 화면 목록을 한 번 누를 때
 * 두 번 다시 받습니다.
 */
function setIds(next: ReadonlySet<number>): void {
  if (sameSet(state.ids, next)) return;
  state = { ids: next, version: state.version + 1 };
  emit();
}

/**
 * 서버에서 다시 읽어옵니다.
 *
 * loadedFor 를 **시작할 때** 세우므로, 같은 화면의 여러 컴포넌트가 동시에
 * 마운트돼도 조회는 한 번뿐입니다 (뒤에 온 쪽은 아래 훅에서 걸러집니다).
 */
async function load(playerId: number): Promise<void> {
  loadedFor = playerId;
  const mine = ++seq;
  try {
    const res = await fetch('/api/favorites', { cache: 'no-store' });
    const data = (await res.json()) as { arcadeIds?: number[] };
    if (mine === seq) setIds(new Set(data.arcadeIds ?? []));
  } catch {
    // 네트워크가 죽었다고 담아 둔 곳이 사라진 것처럼 보이면 안 되므로
    // 지금 값을 그대로 둡니다.
  }
}

/** 로그아웃 — 남의 화면에 내 즐겨찾기가 남아 있으면 안 됩니다 */
function clear(): void {
  loadedFor = null;
  seq += 1; // 돌아오는 중인 조회가 지운 값을 되살리지 못하게
  setIds(INITIAL.ids);
}

export interface Favorites {
  ids: ReadonlySet<number>;
  version: number;
  /** 로그인해야 담을 수 있습니다 — 비로그인 화면에는 별을 그리지 않습니다 */
  canFavorite: boolean;
  isFavorite: (arcadeId: number) => boolean;
  /** 담기/빼기. 실패하면 눌린 별을 되돌립니다 */
  toggle: (arcadeId: number) => Promise<void>;
}

export function useFavorites(): Favorites {
  const playerId = usePlayerId();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (playerId === null) {
      if (loadedFor !== null || state.ids.size > 0) clear();
      return;
    }
    if (loadedFor !== playerId) void load(playerId);
  }, [playerId]);

  const toggle = useCallback(
    async (arcadeId: number) => {
      if (playerId === null) return;

      const before = state.ids;
      const had = before.has(arcadeId);

      // 별은 누른 즉시 바뀌어야 합니다 — 왕복을 기다리면 두 번 누릅니다.
      const optimistic = new Set(before);
      if (had) optimistic.delete(arcadeId);
      else optimistic.add(arcadeId);
      setIds(optimistic);

      try {
        const res = had
          ? await fetch(`/api/favorites?arcadeId=${arcadeId}`, { method: 'DELETE' })
          : await fetch('/api/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ arcadeId }),
            });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { arcadeIds?: number[] };
        // 서버가 돌려준 목록으로 맞춥니다 — 다른 탭에서 담은 곳까지 따라옵니다.
        setIds(new Set(data.arcadeIds ?? []));
      } catch {
        setIds(before);
      }
    },
    [playerId],
  );

  const isFavorite = useCallback(
    (arcadeId: number) => snapshot.ids.has(arcadeId),
    [snapshot],
  );

  return {
    ids: snapshot.ids,
    version: snapshot.version,
    canFavorite: playerId !== null,
    isFavorite,
    toggle,
  };
}
