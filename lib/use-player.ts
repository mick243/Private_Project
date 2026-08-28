'use client';

import { useSession } from './use-session';

/**
 * "지금 누구로 활동하는가" — 제보·리뷰·글·채보 평가에 붙는 players.id.
 *
 * 예전에는 localStorage 에 적힌 **선택**이었습니다(상단 네비의 플레이어
 * 드롭다운). 로그인이 없던 동안의 인증 대체였고, 이 파일에 "OAuth 가 붙으면
 * 세션에서 읽어오는 형태로 바뀐다" 고 적어 뒀던 그 자리입니다.
 *
 * 이제 세션 하나만 봅니다. 근거가 둘이면 반드시 어긋납니다 — OAuth 로그인은
 * 서버 리다이렉트라 클라이언트에서 값을 심을 자리가 없어서, 네비에는 방금
 * 로그인한 이름이 뜨는데 리뷰는 예전에 골라 둔 사람으로 남습니다.
 *
 * 호출부는 그대로입니다 — 여섯 화면이 usePlayerId() 만 알면 됩니다.
 * 권한 판정은 여전히 서버가 합니다 (lib/auth.ts requireAdmin) — 이 값은
 * "누구로 활동하는가" 일 뿐이고 "무엇을 할 수 있는가" 가 아닙니다.
 */
export function usePlayerId(): number | null {
  return useSession()?.playerId ?? null;
}
