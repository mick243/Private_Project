import { NextResponse } from 'next/server';
import {
  claimNickname,
  clearSessionCookie,
  getSession,
  nicknameStatus,
  setPlayerPassword,
  setSessionCookie,
} from '@/lib/auth';
import { formatIssues, nicknameInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 소셜로 막 들어온 사람이 **이름을 정하는** 자리 (/welcome 화면의 짝).
 *
 * 아이디/비밀번호 가입에는 이 라우트가 필요 없습니다 — 가입 화면에서 이미 본인이
 * 이름을 골랐습니다. 소셜만 그 화면이 없어서, 로그인 뒤 한 번 묻고 그 답을
 * 여기서 받습니다 (lib/auth.ts claimNickname).
 *
 * "한 번" 인 것이 중요합니다. 조건 없이 이름을 바꿔 주면 이 라우트가 곧 개명
 * 기능이 되는데, 비운 이름을 다른 사람이 곧바로 차지해 예전 글의 작성자를
 * 사칭할 수 있습니다. 그래서 nickname_pending 이 켜진 계정만 통과시킵니다.
 */

/** GET — 지금 물어볼 상태인가, 미리 채워 둘 이름은 무엇인가 */
export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const status = await nicknameStatus(session.playerId);
  // 계정이 사라졌다면 쿠키도 같이 정리합니다 (app/api/auth/session 과 같은 처리).
  if (!status) return clearSessionCookie(NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }));

  return NextResponse.json(status);
}

/** POST — `{nickname, password?}` → 이름 확정 (+ 선택한 경우 비밀번호 설정) + 세션 쿠키 재발급 */
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = nicknameInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const result = await claimNickname(session.playerId, parsed.data.nickname);
  if (!result.ok) {
    if (result.reason === 'gone') {
      return clearSessionCookie(
        NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
      );
    }
    if (result.reason === 'settled') {
      // 뒤로 가기로 이 화면에 다시 온 경우가 대부분입니다. 실패이긴 하지만
      // 사용자가 고칠 것이 없으므로 무엇이 끝났는지만 알려 줍니다.
      return NextResponse.json({ error: '닉네임은 이미 정해졌습니다' }, { status: 409 });
    }
    if (result.reason === 'reserved') {
      return NextResponse.json({ error: '사용할 수 없는 닉네임입니다' }, { status: 409 });
    }
    // 가입과 같은 이유로 "이미 있다"를 숨기지 않습니다 — 숨기면 무엇을 고쳐야
    // 하는지 알려 줄 방법이 없고, 어차피 플레이어 목록에 이름이 그대로 보입니다.
    return NextResponse.json({ error: '이미 사용 중인 닉네임입니다' }, { status: 409 });
  }

  // 비밀번호는 이름이 확정된 뒤에 겁니다 — 이름이 409 로 반려됐는데 비밀번호만
  // 먼저 박히면, 사용자는 실패로 알고 있는데 계정 상태는 바뀌어 있게 됩니다.
  if (parsed.data.password !== undefined) {
    await setPlayerPassword(session.playerId, parsed.data.password);
  }

  // 세션 쿠키에는 닉네임이 **박혀 있습니다**(lib/auth.ts createSessionToken).
  // 다시 서명해 주지 않으면 상단 네비와 글 작성자에 예전 이름이 남습니다.
  return setSessionCookie(NextResponse.json({ user: result.user }), result.user);
}
