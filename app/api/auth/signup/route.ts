import { NextResponse } from 'next/server';
import {
  clearLoginFailures,
  clientKey,
  createAccount,
  loginLockRemainingMs,
  noteLoginFailure,
  setSessionCookie,
} from '@/lib/auth';
import { isUniqueViolation } from '@/lib/pg-errors';
import { formatIssues, signupInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/signup — 회원가입 `{nickname, password, passwordConfirm}`
 *
 * 성공하면 **곧바로 로그인 상태**로 만듭니다(세션 쿠키). 방금 정한 비밀번호를
 * 다시 치게 하는 화면은 아무것도 확인해 주지 않습니다.
 *
 * 이메일 인증은 없습니다 — 이메일을 받지 않기 때문입니다. 가입해서 얻는 건
 * "이 닉네임은 내 것" 뿐이고, 관리자 권한은 여기로 오지 않습니다
 * (lib/auth.ts createAccount 는 is_admin 을 건드리지 않습니다).
 *
 * 시도 제한은 로그인과 같은 통을 쓰되 키를 나눕니다 — 가입 실패로 로그인이
 * 잠기면 이미 계정이 있는 사람이 남의 시도 때문에 못 들어옵니다.
 */
export async function POST(request: Request) {
  const key = `signup:${clientKey(request)}`;
  const lockedFor = loginLockRemainingMs(key);
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: `가입 시도가 많습니다. ${Math.ceil(lockedFor / 60000)}분 후 다시 시도해 주세요` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = signupInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const result = await createAccount(parsed.data.nickname, parsed.data.password);
    if (!result.ok) {
      // 로그인과 달리 "이미 있는 아이디" 를 숨기지 않습니다. 숨기면 가입이
      // 불가능해집니다 — 무엇을 고쳐야 하는지 알려 줄 방법이 없습니다.
      // 어차피 플레이어 목록에 닉네임이 그대로 보입니다.
      noteLoginFailure(key);
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
    }

    clearLoginFailures(key);
    return setSessionCookie(NextResponse.json({ user: result.user }, { status: 201 }), result.user);
  } catch (err) {
    // 같은 순간에 같은 아이디로 두 명이 가입한 경우 (createAccount 의 선검사와
    // INSERT 사이). 500 이 아니라 위와 같은 안내로 돌려줍니다.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
    }
    throw err;
  }
}
