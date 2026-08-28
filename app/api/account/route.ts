import { NextResponse } from 'next/server';
import {
  accountStatus,
  changeNickname,
  clearLoginFailures,
  clearSessionCookie,
  getSession,
  loginLockRemainingMs,
  noteLoginFailure,
  setPlayerPassword,
  setSessionCookie,
  verifyPlayerPassword,
} from '@/lib/auth';
import { accountUpdateSchema, formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 개인정보 수정 (/account 화면의 짝).
 *
 * 세션 쿠키만으로 이름·비밀번호를 바꿔 주지 않습니다 — 쿠키는 열어 둔 자리에서
 * 집어갈 수 있으므로, **비밀번호를 다시 물어** 본인임을 확인합니다.
 * 예외는 소셜로만 가입해 비밀번호가 아직 없는 계정입니다(대조할 것이 없음).
 * 그 경우 로그인 세션만으로 첫 비밀번호 설정을 허용하고, 그다음부터는 여기도
 * 비밀번호를 요구합니다.
 *
 * 시도 제한은 로그인과 같은 장치를 계정 단위 키로 씁니다 — 세션을 쥔 사람이
 * 비밀번호를 무한정 대입해 보는 것을 막습니다.
 */

const lockKey = (playerId: number) => `account:${playerId}`;

/** GET — 화면을 그리는 데 필요한 것: 지금 이름과 "비밀번호가 있는가" */
export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const status = await accountStatus(session.playerId);
  if (!status) {
    return clearSessionCookie(
      NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
    );
  }
  return NextResponse.json({ nickname: status.nickname, hasPassword: status.hasPassword });
}

/** PUT — `{currentPassword?, nickname?, newPassword?}` → 변경 + 세션 쿠키 재발급 */
export async function PUT(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatIssues(parsed.error)[0] ?? '입력값이 올바르지 않습니다' },
      { status: 400 },
    );
  }

  const status = await accountStatus(session.playerId);
  if (!status) {
    return clearSessionCookie(
      NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
    );
  }

  // 비밀번호가 있는 계정은 반드시 현재 비밀번호로 본인 확인.
  if (status.hasPassword) {
    const key = lockKey(session.playerId);
    const lockedMs = loginLockRemainingMs(key);
    if (lockedMs > 0) {
      return NextResponse.json(
        { error: `시도가 너무 많습니다. ${Math.ceil(lockedMs / 60000)}분 뒤에 다시 해 주세요` },
        { status: 429 },
      );
    }
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: '현재 비밀번호를 입력해 주세요' }, { status: 400 });
    }
    if (!(await verifyPlayerPassword(session.playerId, parsed.data.currentPassword))) {
      noteLoginFailure(key);
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 403 });
    }
    clearLoginFailures(key);
  }

  // 닉네임 → 비밀번호 순서. 닉네임이 반려되면(409) 아무것도 바뀌지 않은 상태로
  // 돌려주기 위해 비밀번호는 마지막에 겁니다.
  let user = { ...session, nickname: status.nickname, isAdmin: status.isAdmin };
  if (parsed.data.nickname !== undefined) {
    const result = await changeNickname(session.playerId, parsed.data.nickname);
    if (!result.ok) {
      if (result.reason === 'gone') {
        return clearSessionCookie(
          NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
        );
      }
      if (result.reason === 'reserved') {
        return NextResponse.json({ error: '사용할 수 없는 닉네임입니다' }, { status: 409 });
      }
      return NextResponse.json({ error: '이미 사용 중인 닉네임입니다' }, { status: 409 });
    }
    user = result.user;
  }

  if (parsed.data.newPassword !== undefined) {
    await setPlayerPassword(session.playerId, parsed.data.newPassword);
  }

  // 닉네임이 바뀌었을 수 있으므로 세션 쿠키를 새 이름으로 다시 서명합니다.
  return setSessionCookie(NextResponse.json({ user }), user);
}
