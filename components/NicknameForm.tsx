'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MIN_PASSWORD_LENGTH, safeNext, type SessionUser } from '@/lib/auth-types';
import { setSession, useSession } from '@/lib/use-session';

/**
 * 소셜 로그인 직후 **이름을 정하는 화면** (`/welcome`).
 *
 * 아이디/비밀번호로 가입하는 사람은 가입 화면에서 이름을 고릅니다. 소셜은 그
 * 화면이 없어서, 지금까지는 제공자가 준 이름을 그대로 쓰고 겹치면 뒤에 숫자를
 * 붙였습니다 — 본인이 고른 적 없는 '홍길동2' 가 제보·리뷰·글에 찍혔습니다.
 * 그래서 제공자 동의·인증이 끝나고 우리 쪽으로 돌아온 **바로 그 자리**에 한 번
 * 물어봅니다 (app/api/auth/oauth/[provider]/callback).
 *
 * 로그인은 이미 끝나 있습니다. 여기서 하는 일은 이름을 정하는 것뿐이라
 * 건너뛸 수 있고, 건너뛰면 다음 로그인에 다시 묻습니다 — 붙잡아 두는 화면이
 * 아닙니다.
 *
 * ⚠ 여기서 하는 검사는 **거들 뿐** 입니다. 판정은 서버(lib/validation.ts
 *   nicknameInputSchema · lib/auth.ts claimNickname)가 합니다.
 */

/** 서버가 보는 규칙과 같은 것. 통과해도 서버가 다시 봅니다 */
function localIssue(nickname: string, password: string, passwordConfirm: string): string | null {
  const name = nickname.trim();
  if (name.length < 2) return '닉네임은 2자 이상이어야 합니다';
  if (name.length > 20) return '닉네임은 20자까지 쓸 수 있습니다';
  if (/\s/.test(name)) return '닉네임에 공백은 쓸 수 없습니다';
  // 비밀번호는 선택 — 채웠을 때만 봅니다.
  if (password.length > 0) {
    if (password.length < MIN_PASSWORD_LENGTH)
      return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`;
    if (password !== passwordConfirm) return '비밀번호가 서로 다릅니다';
  }
  return null;
}

type Phase =
  /** 물어볼 상태인지 서버에 확인하는 중 */
  | { kind: 'loading' }
  /** 물어볼 상태 — 폼을 그립니다 */
  | { kind: 'ask' }
  /** 이미 정해졌거나(뒤로 가기) 로그인이 없는 상태 */
  | { kind: 'done'; message: string };

export default function NicknameForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const user = useSession();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 주소를 직접 치고 올 수도 있고, 이름을 정한 뒤 뒤로 가기로 돌아올 수도
  // 있습니다. "물어볼 상태인가" 는 세션이 아니라 서버(DB)만 압니다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/api/auth/nickname', { cache: 'no-store' });
        if (!alive) return;
        if (res.status === 401) {
          setPhase({ kind: 'done', message: '로그인이 필요합니다' });
          return;
        }
        const data = (await res.json()) as { nickname?: string; pending?: boolean };
        if (!alive) return;
        if (!data.pending) {
          setPhase({ kind: 'done', message: '닉네임은 이미 정해져 있습니다' });
          return;
        }
        // 제공자가 준 이름을 미리 채워 둡니다 — 그대로 쓰고 싶은 사람이 대부분이고,
        // 빈 칸으로 두면 방금 본 이름과 다른 이름을 새로 지어야 하는 것처럼 보입니다.
        setNickname(data.nickname ?? '');
        setPhase({ kind: 'ask' });
      } catch {
        if (alive) setPhase({ kind: 'done', message: '연결에 실패했습니다' });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const issue = localIssue(nickname, password, passwordConfirm);
    if (issue) {
      setError(issue);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          // 빈 칸은 "설정 안 함" — 보내지 않습니다.
          password: password || undefined,
          passwordConfirm: password ? passwordConfirm : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 중복(409)처럼 다음에 뭘 해야 하는지가 담긴 문구는 서버 것을 그대로 씁니다.
        setError(data.error ?? '닉네임을 저장하지 못했습니다');
        return;
      }

      // 세션 쿠키가 새 이름으로 다시 서명돼 왔습니다 — 상단 네비와 글 작성자가
      // 곧바로 따라오도록 스토어에도 심어 줍니다 (lib/use-session.ts).
      setSession(data.user as SessionUser);
      router.replace(next);
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === 'loading') {
    return (
      <main className="login-page">
        <p className="muted pad">불러오는 중…</p>
      </main>
    );
  }

  if (phase.kind === 'done') {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>{phase.message}</h1>
          {/* 이름 뒤에 조사를 붙이지 않습니다 — '…서로' 와 '…들으로' 처럼
              받침에 따라 달라지고, 영문 이름이면 어느 쪽도 어색합니다. */}
          <p className="muted small">
            {user
              ? `지금 활동 이름은 '${user.nickname}' 입니다.`
              : '로그인 화면에서 다시 시작해 주세요.'}
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary btn-sm" href={next}>
              돌아가기
            </Link>
            {!user && (
              <Link className="btn btn-sm" href={`/login?next=${encodeURIComponent(next)}`}>
                로그인 화면
              </Link>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>닉네임을 정해 주세요</h1>
        <p className="muted small">
          로그인은 끝났습니다. 여기서 정한 이름이 제보·리뷰·글·댓글에 찍히는 이름이
          됩니다. 소셜 계정에서 가져온 이름을 미리 넣어 뒀으니, 그대로 쓰려면
          나중에 정하기를 누르세요.
        </p>

        <label className="field">
          <span>닉네임 (2~20자, 공백 없이)</span>
          <input
            autoFocus
            type="text"
            value={nickname}
            maxLength={20}
            placeholder="닉네임"
            autoComplete="off"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        {/* 선택 사항 — 정해 두면 아이디/비밀번호 로그인과 개인정보 수정(/account)의
            본인 확인에 쓰입니다. 비워 두면 소셜 로그인만 쓰는 계정이 됩니다. */}
        <label className="field">
          <span>비밀번호 (선택, {MIN_PASSWORD_LENGTH}자 이상)</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {password.length > 0 && (
          <label className="field">
            <span>비밀번호 확인</span>
            <input
              type="password"
              value={passwordConfirm}
              autoComplete="new-password"
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </label>
        )}

        {error && <p className="warn">{error}</p>}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !nickname.trim()}
          >
            {busy ? '저장 중…' : '이 이름으로 시작하기'}
          </button>
          {/* 건너뛰어도 로그인은 그대로입니다. 표시를 끄지 않으므로 다음 로그인에
              다시 묻습니다 — 임의로 붙인 이름을 조용히 확정하지 않으려는 것입니다. */}
          <Link className="btn" href={next}>
            나중에 정하기
          </Link>
        </div>
      </form>
    </main>
  );
}
