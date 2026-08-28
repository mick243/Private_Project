import { NextResponse } from 'next/server';
import {
  clearLoginFailures,
  getSession,
  loginLockRemainingMs,
  noteLoginFailure,
  verifyPlayerPassword,
} from '@/lib/auth';
import { accountVerifySchema, formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 개인정보 수정 화면의 **입장 검증** — 비밀번호가 맞는지만 답합니다.
 *
 * 통과해도 서버는 아무것도 열어 두지 않습니다. 실제 변경(PUT /api/account)이
 * 같은 비밀번호를 다시 받아 재확인합니다 — 여기서 "확인됨" 상태를 세션에 담으면
 * 그 상태가 곧 두 번째 세션이 되어 만료·회수를 따로 관리해야 합니다.
 * 시도 제한 키는 PUT 과 같습니다 — 이 라우트로 우회 대입하는 것을 막습니다.
 */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = accountVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatIssues(parsed.error)[0] ?? '입력값이 올바르지 않습니다' },
      { status: 400 },
    );
  }

  const key = `account:${session.playerId}`;
  const lockedMs = loginLockRemainingMs(key);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: `시도가 너무 많습니다. ${Math.ceil(lockedMs / 60000)}분 뒤에 다시 해 주세요` },
      { status: 429 },
    );
  }

  if (!(await verifyPlayerPassword(session.playerId, parsed.data.password))) {
    noteLoginFailure(key);
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 403 });
  }

  clearLoginFailures(key);
  return NextResponse.json({ ok: true });
}
