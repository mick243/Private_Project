'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { SessionUser } from './auth-types';

/**
 * "지금 로그인한 사람"을 앱 전체가 공유하는 스토어.
 *
 * 근거는 서버가 서명한 **세션 쿠키** 하나입니다. "누구로 활동하는가"도 여기서
 * 갈라져 나갑니다 (lib/use-player.ts) — 예전에는 localStorage 에 적힌 선택이
 * 따로 있었지만, 근거가 둘이면 OAuth 로그인처럼 한쪽만 갱신되는 길에서 어긋납니다.
 *
 * 화면이 관리자 버튼을 그릴지만 여기서 정하고, 실제 권한 판정은 언제나 서버가
 * 합니다 (lib/auth.ts requireAdmin). 이 값을 조작해도 API 가 401/403 을 돌려줍니다.
 */

let current: SessionUser | null = null;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// getSnapshot 은 렌더마다 불리므로 매번 새 객체를 만들면 무한 렌더가 됩니다.
// 로그인/로그아웃으로 값이 바뀔 때만 참조를 갈아 끼웁니다.
function getSnapshot(): SessionUser | null {
  return current;
}

/** SSR 에서는 항상 비로그인 — 서버 렌더 시점에는 쿠키를 읽지 않습니다 */
function getServerSnapshot(): SessionUser | null {
  return null;
}

export function setSession(user: SessionUser | null): void {
  current = user;
  loaded = true;
  emit();
}

/** 세션을 서버에서 다시 읽어옵니다 (첫 마운트 · 로그인/로그아웃 직후) */
export async function refreshSession(): Promise<void> {
  inflight ??= (async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      const data = (await res.json()) as { user: SessionUser | null };
      current = data.user ?? null;
    } catch {
      // 네트워크가 죽었다고 관리자 버튼이 생기면 안 되므로 비로그인으로 둡니다.
      current = null;
    } finally {
      loaded = true;
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

export function useSession(): SessionUser | null {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // 여러 컴포넌트가 동시에 불러도 요청은 한 번뿐입니다 (inflight 공유).
  useEffect(() => {
    if (!loaded) void refreshSession();
  }, []);
  return user;
}

/** 관리자 전용 UI 의 표시 조건 */
export function useIsAdmin(): boolean {
  return useSession()?.isAdmin === true;
}
