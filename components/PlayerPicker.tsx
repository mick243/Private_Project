'use client';

import { ADMIN_LABEL } from '@/lib/auth-types';
import { useSession } from '@/lib/use-session';

/**
 * 상단 네비에서 **지금 누구로 활동하는가**를 보여 주는 자리.
 *
 * 예전에는 플레이어를 직접 고르는 select 였습니다 — 로그인이 없던 동안 제보·
 * 리뷰에 이름을 붙일 방법이 그것뿐이었기 때문입니다. 이제 아이디/비밀번호와
 * OAuth 로 실제로 로그인하므로 고르는 게 아니라 로그인한 사람을 그대로 읽습니다
 * (lib/use-player.ts 도 같은 세션을 봅니다).
 *
 * 비로그인이면 라벨까지 통째로 감춥니다. '플레이어 —' 처럼 빈 값을 남겨 두면
 * 고를 수 있는 것처럼 읽히는데, 여기서 할 수 있는 일은 이제 없습니다 —
 * 로그인은 옆의 AuthMenu 가 맡습니다.
 *
 * 권한 뱃지도 여기 붙습니다. AuthMenu 에 있던 것을 옮겨 왔습니다 — 이름과
 * 뱃지가 따로 놓이면(그 사이에 .topnav-right 의 gap 이 끼면) 뱃지가 이름이
 * 아니라 옆의 로그아웃 버튼에 딸린 것처럼 읽혔습니다. 이름 바로 뒤가 제자리입니다.
 *
 * 긴 이름은 CSS 가 줄임표로 자릅니다(.player-name) — 소셜 로그인 닉네임은
 * 제공자가 주는 이름이라 100자까지 옵니다. 잘려도 title 로 온전히 읽힙니다.
 */
export default function PlayerPicker() {
  const user = useSession();

  // 세션이 없으면 아무것도 그리지 않습니다 (라벨 포함).
  if (!user) return null;

  return (
    <span className="player-picker" title={`${user.nickname} · 플레이어 #${user.playerId}`}>
      <span className="muted small">플레이어</span>
      <strong className="player-name">{user.nickname}</strong>
      {user.isAdmin && <em className="admin-tag">{ADMIN_LABEL}</em>}
    </span>
  );
}
