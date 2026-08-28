'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { refreshSession, setSession, useSession } from '@/lib/use-session';

/**
 * 상단 네비의 로그인 자리.
 *
 * 관리자와 일반 사용자가 같은 버튼으로 들어옵니다 — 아이디/비밀번호와 소셜
 * 로그인 어느 쪽이든 끝나면 같은 세션 쿠키가 되고, 권한 차이는 뱃지로만 드러납니다.
 *
 * 폼 자체는 /login 페이지에 있습니다. 여기서는 **들어가고 나오는 것**만 맡습니다 —
 * 누구로 들어와 있는지는 옆의 PlayerPicker 가 이름과 권한 뱃지로 보여 줍니다.
 * 예전에는 여기서도 이름을 찍었는데, 나란히 선 두 칸이 같은 이름을 두 번 적고
 * 뱃지는 이름에서 떨어져 로그아웃 버튼에 딸린 것처럼 읽혔습니다.
 */

export default function AuthMenu() {
  const user = useSession();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSession(null);
      // 쿠키가 정말 지워졌는지는 서버에게 한 번 더 확인한다.
      void refreshSession();
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="auth-menu">
        {/* 닉네임·비밀번호 수정. 돌아올 곳은 로그인 링크와 같은 이유로 경로만 넘깁니다. */}
        <Link
          className={pathname === '/account' ? 'btn btn-sm btn-on' : 'btn btn-sm'}
          href={pathname === '/account' ? '/account' : `/account?next=${encodeURIComponent(pathname)}`}
        >
          내 정보
        </Link>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={logout}>
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="auth-menu">
      {/*
        끝나고 보던 화면으로 돌려놓기 위해 지금 경로를 넘깁니다.
        쿼리스트링(예: /?arcade=3)까지 넣으려면 useSearchParams 가 필요한데,
        이 컴포넌트는 레이아웃에 있어서 그러면 모든 페이지가 정적 생성에서
        빠집니다. 돌아갈 화면을 고르는 데는 경로만으로 충분합니다.
      */}
      <Link
        className={pathname === '/login' ? 'btn btn-sm btn-on' : 'btn btn-sm'}
        href={pathname === '/login' ? '/login' : `/login?next=${encodeURIComponent(pathname)}`}
      >
        로그인
      </Link>
    </div>
  );
}
