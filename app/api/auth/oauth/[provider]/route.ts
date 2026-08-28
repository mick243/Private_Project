import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/auth-types';
import {
  authorizeUrl,
  newStateSecrets,
  oauthCredentials,
  providerSpec,
  redirectUri,
  sealState,
  OAUTH_STATE_TTL_S,
} from '@/lib/oauth';
import { isOAuthProvider, OAUTH_STATE_COOKIE } from '@/lib/oauth-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

/**
 * GET /api/auth/oauth/:provider?next=… — 소셜 로그인 **시작**
 *
 * 화면에서 fetch 로 부르지 않고 링크로 이동합니다. 제공자 인가 화면은 우리
 * 도메인 밖이라 XHR 로는 못 열고, 브라우저 주소창이 바뀌어야 사용자도 지금
 * 어디에 로그인하는지 볼 수 있습니다.
 *
 * 여기서 하는 일은 state 쿠키 한 장을 심고 제공자로 보내는 것뿐입니다.
 * 실패하면 제공자 쪽 영문 에러 대신 `/login?error=…` 로 돌려보냅니다.
 */
export async function GET(request: Request, ctx: Ctx) {
  const { provider } = await ctx.params;
  const next = safeNext(new URL(request.url).searchParams.get('next'));

  const back = (error: string) =>
    NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&error=${error}`, request.url),
    );

  if (!isOAuthProvider(provider)) return back('unconfigured');

  const credentials = oauthCredentials(provider);
  // 키가 없으면 제공자로 보내지 않습니다 — 보내 봐야 그쪽 에러 화면만 보게 됩니다.
  if (!credentials) return back('unconfigured');

  const { nonce, verifier } = newStateSecrets(providerSpec(provider).pkce);
  const res = NextResponse.redirect(
    authorizeUrl({
      provider,
      clientId: credentials.clientId,
      redirectUri: redirectUri(request, provider),
      nonce,
      verifier,
    }),
  );

  // 콜백이 "우리가 보낸 요청의 답" 인지 아는 유일한 근거입니다.
  // sameSite: 'lax' — 제공자에서 우리 콜백으로 돌아오는 건 top-level 이동이라
  // lax 로 함께 갑니다. 'strict' 면 그 첫 요청에 쿠키가 빠져 매번 실패합니다.
  res.cookies.set(OAUTH_STATE_COOKIE, sealState({ p: provider, n: nonce, next, v: verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_STATE_TTL_S,
  });
  return res;
}
