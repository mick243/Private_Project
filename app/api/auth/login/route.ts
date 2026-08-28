import { NextResponse } from 'next/server';
import {
  authenticate,
  clearLoginFailures,
  clientKey,
  configuredAdminPassword,
  ensureAdminAccount,
  loginLockRemainingMs,
  noteLoginFailure,
  setSessionCookie,
} from '@/lib/auth';
import { formatIssues, loginInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login — 관리자 로그인 `{nickname, password}`
 *
 * 성공하면 서명된 세션 쿠키를 심고 `{user}` 를 돌려줍니다.
 * 실패 이유는 한 문장으로 통일합니다 — "그런 계정 없음"과 "비밀번호 틀림"을
 * 나누면 닉네임이 존재하는지가 밖에서 확인됩니다.
 */
export async function POST(request: Request) {
  const key = clientKey(request);
  const lockedFor = loginLockRemainingMs(key);
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 많습니다. ${Math.ceil(lockedFor / 60000)}분 후 다시 시도해 주세요` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  if (!configuredAdminPassword()) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD 가 설정되지 않아 로그인할 수 없습니다' },
      { status: 503 },
    );
  }

  // env 의 관리자 계정을 DB 에 맞춰 둡니다. 첫 로그인이면 여기서 계정이 생기고,
  // .env 의 비밀번호를 바꿨다면 여기서 해시가 갱신됩니다 (lib/auth.ts).
  await ensureAdminAccount();

  const user = await authenticate(parsed.data.nickname, parsed.data.password);
  if (!user) {
    noteLoginFailure(key);
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    );
  }

  clearLoginFailures(key);
  return setSessionCookie(NextResponse.json({ user }), user);
}
