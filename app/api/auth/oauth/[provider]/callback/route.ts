import { NextResponse } from 'next/server';
import { linkOAuthAccount, readCookie, setSessionCookie } from '@/lib/auth';
import { safeNext } from '@/lib/auth-types';
import {
  exchangeCode,
  fetchProfile,
  oauthCredentials,
  openState,
  redirectUri,
} from '@/lib/oauth';
import { isOAuthProvider, OAUTH_STATE_COOKIE, type OAuthErrorCode } from '@/lib/oauth-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

/**
 * GET /api/auth/oauth/:provider/callback — 제공자가 돌려보내는 자리
 *
 * `?code` 를 세션 쿠키로 바꾸고 원래 보던 화면으로 돌려보냅니다. 여기서부터는
 * 아이디/비밀번호 로그인과 완전히 같습니다 — 다른 건 "무엇으로 본인을
 * 증명했는가" 뿐이라 세션 발급은 setSessionCookie 하나를 같이 씁니다.
 *
 * 처음 들어온 사람만 한 정거장을 더 거칩니다 — `/welcome`(닉네임 정하기).
 * 소셜에는 이름을 고르는 화면이 없어서 그냥 두면 제공자가 준 이름이 그대로
 * 글에 찍힙니다 (lib/auth.ts linkOAuthAccount).
 *
 * 어디서 실패하든 사용자에게는 `/login?error=…` 한 곳으로 돌아갑니다. 이유를
 * 자세히 적어 주면(=state 가 틀렸는지, 토큰 교환이 막혔는지) 공격자에게 어디까지
 * 통했는지 알려 주는 셈이라, 자세한 건 서버 로그에만 남깁니다.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);

  const state = openState(readCookie(request, OAUTH_STATE_COOKIE));
  // 돌아갈 곳은 state 쿠키에 적어 둔 것만 믿습니다 — 콜백 URL 의 쿼리는 제공자를
  // 거쳐 오므로 우리가 넣은 값이라는 보장이 없습니다.
  const next = safeNext(state?.next);

  const fail = (code: OAuthErrorCode) => {
    const res = NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&error=${code}`, request.url),
    );
    // 한 번 쓴 state 는 성공이든 실패든 지웁니다 (재사용 방지).
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  if (!isOAuthProvider(provider)) return fail('unconfigured');
  // 사용자가 인가 화면에서 '취소' 를 누른 경우. 에러가 아니라 선택입니다.
  if (url.searchParams.get('error')) return fail('denied');

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || !returnedState) return fail('provider');

  // state 세 가지를 모두 봅니다: 쿠키가 있는가 · 값이 같은가 · 같은 제공자인가.
  // 마지막 하나가 빠지면 카카오로 시작한 흐름을 네이버 콜백에 밀어 넣을 수 있습니다.
  if (!state || state.n !== returnedState || state.p !== provider) return fail('state');

  const credentials = oauthCredentials(provider);
  if (!credentials) return fail('unconfigured');

  try {
    const accessToken = await exchangeCode({
      provider,
      code,
      redirectUri: redirectUri(request, provider),
      credentials,
      state: returnedState,
      verifier: state.v,
    });
    if (!accessToken) return fail('provider');

    const profile = await fetchProfile(provider, accessToken);
    if (!profile) return fail('provider');

    const { user, needsNickname } = await linkOAuthAccount({
      provider,
      providerUid: profile.uid,
      nickname: profile.nickname,
      email: profile.email,
    });

    // 처음 들어온 사람은 보던 화면 대신 이름을 정하는 화면을 먼저 봅니다.
    // 세션 쿠키는 여기서 이미 나갑니다 — 로그인은 끝났고, 남은 건 "무슨 이름으로
    // 활동할지" 뿐입니다. 그 화면을 닫고 나가도 로그인 상태는 유지되고, 답하지
    // 않은 표시(nickname_pending)가 남아 다음 로그인에 다시 묻습니다.
    const landing = needsNickname ? `/welcome?next=${encodeURIComponent(next)}` : next;

    const res = setSessionCookie(NextResponse.redirect(new URL(landing, request.url)), user);
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error(`[oauth] ${provider} 콜백 실패`, err);
    return fail('provider');
  }
}
