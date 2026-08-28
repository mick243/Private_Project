'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_LABEL, safeNext, type SessionUser } from '@/lib/auth-types';
import { oauthErrorMessage } from '@/lib/oauth-types';
import { refreshSession, setSession, useSession } from '@/lib/use-session';
import OAuthButtons from './OAuthButtons';

/**
 * 로그인 화면.
 *
 * 상단 네비의 팝오버를 대신합니다. 페이지로 두면 주소를 가질 수 있어서,
 * 권한이 필요한 화면에서 `/login?next=…` 로 보내고 끝나면 제자리로 돌려놓을
 * 수 있습니다 — 팝오버로는 "왜 열렸는지"와 "끝나고 어디로 갈지"를 담을 자리가
 * 없었습니다.
 *
 * 들어오는 길은 세 가지입니다 — 아이디/비밀번호, 회원가입(/signup), 소셜
 * 로그인(Google·카카오·네이버). 셋 다 끝나면 같은 세션 쿠키가 되고, 같은 `next`
 * 로 돌아갑니다.
 *
 * 둘러보기와 제보는 로그인 없이도 됩니다. 다만 **이름이 붙는 일**(리뷰·글·댓글·
 * 채보 평가)은 로그인이 있어야 합니다 — 그 이름의 근거가 세션뿐이기 때문입니다
 * (lib/use-player.ts).
 */


export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const user = useSession();

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // 소셜 로그인이 실패하면 `/login?error=…` 로 돌아옵니다. 그 안내는 폼을
  // 건드리기 전까지만 보여 주면 되므로 상태로 옮기지 않고 그때그때 읽습니다.
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? oauthErrorMessage(params.get('error'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 잠금(429)·미설정(503)처럼 다음에 뭘 해야 하는지가 담긴 문구는
        // 서버 것을 그대로 씁니다. 여기서 뭉뚱그리면 그 정보가 사라집니다.
        setError(data.error ?? '로그인에 실패했습니다');
        return;
      }

      const loggedIn = data.user as SessionUser;
      // 제보·리뷰에 붙는 플레이어도 이 세션에서 읽습니다 (lib/use-player.ts) —
      // 따로 심어 줄 값이 없습니다.
      setSession(loggedIn);
      // replace 인 이유: 뒤로 가기로 로그인 폼에 다시 돌아오면 이미 로그인된
      // 화면이 떠서 무엇을 한 건지 헷갈린다.
      router.replace(next);
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

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

  // 이미 로그인한 사람을 그냥 튕겨 보내지 않습니다 — 주소를 직접 치고 온
  // 경우라면 "누구로 들어와 있는지" 를 보고 계정을 바꾸러 온 것일 수 있습니다.
  if (user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>이미 로그인되어 있습니다</h1>
          <p className="login-who">
            {user.isAdmin && <em className="admin-tag">{ADMIN_LABEL}</em>}
            {(!user.isAdmin || user.nickname !== ADMIN_LABEL) && user.nickname}
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary btn-sm" href={next}>
              돌아가기
            </Link>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={logout}>
              로그아웃
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>로그인</h1>
        <p className="muted small">
          둘러보기와 제보·글쓰기는 로그인 없이도 됩니다. 로그인하면 남긴 글이 한
          계정에 모이고, 오락실 정보 수정·삭제는 관리자만 할 수 있습니다.
        </p>

        <label className="field">
          <span>아이디</span>
          <input
            autoFocus
            type="text"
            value={nickname}
            maxLength={100}
            placeholder="관리자"
            autoComplete="username"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            maxLength={200}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {shownError && <p className="warn">{shownError}</p>}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !nickname.trim() || !password}
          >
            {busy ? '확인 중…' : '로그인'}
          </button>
          {/* 돌아갈 곳(next)을 가입 화면까지 들고 갑니다 — 가입이 끝나면 로그인을
              거치지 않고 곧장 보던 화면으로 돌아갑니다. */}
          <Link className="btn" href={`/signup?next=${encodeURIComponent(next)}`}>
            회원가입
          </Link>
          <Link className="btn" href={next}>
            취소
          </Link>
        </div>

        <OAuthButtons next={next} />
      </form>
    </main>
  );
}
