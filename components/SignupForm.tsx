'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MIN_PASSWORD_LENGTH, safeNext, type SessionUser } from '@/lib/auth-types';
import { setSession, useSession } from '@/lib/use-session';
import OAuthButtons from './OAuthButtons';

/**
 * 회원가입 화면.
 *
 * 로그인 화면과 짝입니다 — 같은 카드, 같은 `?next=`, 끝나면 같은 자리로
 * 돌아갑니다. 서버가 가입과 동시에 세션 쿠키를 주므로(app/api/auth/signup)
 * 여기서 다시 로그인 요청을 보내지 않습니다.
 *
 * 받는 것은 아이디와 비밀번호뿐입니다. 이메일을 받지 않는 이유는 쓸 데가
 * 없어서입니다 — 인증 메일도, 비밀번호 찾기도 보낼 곳이 없으면 이메일은
 * 지키기만 해야 하는 개인정보로 남습니다. 필요해지면 그때 함께 붙입니다.
 *
 * ⚠ 여기서 하는 검사는 **거들 뿐** 입니다. 판정은 서버(lib/validation.ts
 *   signupInputSchema)가 하고, 화면은 같은 규칙을 미리 보여 줄 뿐입니다.
 */

/** 폼을 보내기 전에 화면에서 걸러낼 수 있는 것들. 통과해도 서버가 다시 봅니다 */
function localIssue(nickname: string, password: string, confirm: string): string | null {
  const name = nickname.trim();
  if (name.length < 2) return '아이디는 2자 이상이어야 합니다';
  if (name.length > 20) return '아이디는 20자까지 쓸 수 있습니다';
  if (/\s/.test(name)) return '아이디에 공백은 쓸 수 없습니다';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`;
  }
  if (password !== confirm) return '비밀번호가 서로 다릅니다';
  return null;
}

export default function SignupForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const user = useSession();

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const issue = localIssue(nickname, password, confirm);
    if (issue) {
      setError(issue);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password, passwordConfirm: confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 중복 아이디(409)·잠금(429)처럼 다음에 뭘 해야 하는지가 담긴 문구는
        // 서버 것을 그대로 씁니다.
        setError(data.error ?? '가입에 실패했습니다');
        return;
      }

      const joined = data.user as SessionUser;
      // 가입한 이름으로 리뷰·글이 남습니다 — 플레이어는 세션에서 읽으므로
      // (lib/use-player.ts) 여기서 따로 심어 줄 값이 없습니다.
      setSession(joined);
      router.replace(next);
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  // 이미 로그인한 사람에게 가입 폼을 보여 주면, 채워 넣는 동안 지금 계정이
  // 어떻게 되는지 알 수 없습니다. 무엇을 눌러야 하는지만 알려 줍니다.
  if (user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>이미 로그인되어 있습니다</h1>
          <p className="muted small">
            다른 계정을 만들려면 먼저 로그아웃해 주세요. 로그아웃은 로그인 화면에
            있습니다.
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary btn-sm" href={next}>
              돌아가기
            </Link>
            <Link className="btn btn-sm" href={`/login?next=${encodeURIComponent(next)}`}>
              로그인 화면
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>회원가입</h1>
        <p className="muted small">
          아이디와 비밀번호만 받습니다. 여기서 정한 아이디가 제보·리뷰·글에 찍히는
          이름이 됩니다.
        </p>

        <label className="field">
          <span>아이디 (2~20자, 공백 없이)</span>
          <input
            autoFocus
            type="text"
            value={nickname}
            maxLength={20}
            placeholder="닉네임"
            autoComplete="username"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <label className="field">
          <span>비밀번호 ({MIN_PASSWORD_LENGTH}자 이상)</span>
          <input
            type="password"
            value={password}
            maxLength={200}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>비밀번호 확인</span>
          <input
            type="password"
            value={confirm}
            maxLength={200}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        {error && <p className="warn">{error}</p>}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !nickname.trim() || !password || !confirm}
          >
            {busy ? '가입 중…' : '가입하기'}
          </button>
          <Link className="btn" href={`/login?next=${encodeURIComponent(next)}`}>
            로그인
          </Link>
          <Link className="btn" href={next}>
            취소
          </Link>
        </div>

        {/* 소셜은 가입과 로그인이 같은 동작입니다 — 처음이면 계정이 생깁니다 */}
        <OAuthButtons next={next} verb="계정으로 시작" />
      </form>
    </main>
  );
}
