import { createHash, randomBytes } from 'node:crypto';
import { openPayload, sealPayload } from './auth';
import type { OAuthProviderId } from './oauth-types';

/**
 * 소셜 로그인 (Google · 카카오 · 네이버).
 *
 * 셋 다 OAuth 2.0 인가 코드 흐름이라 다른 건 **주소와 프로필 JSON 모양**
 * 뿐입니다. 그래서 제공자마다 라우트를 만들지 않고 표 하나(PROVIDERS)로 두고
 * `/api/auth/oauth/[provider]` 한 벌이 셋을 다 처리합니다. 넷째가 붙어도
 * 여기 한 줄만 늘어납니다.
 *
 * 라이브러리(next-auth 등)를 쓰지 않는 이유는 세션이 이미 있기 때문입니다.
 * next-auth 를 넣으면 세션·쿠키·DB 어댑터가 통째로 따라와서, 지금 잘 도는
 * 관리자 로그인(lib/auth.ts)과 두 벌이 됩니다. 여기서 필요한 건 "인가 코드를
 * 사람으로 바꾸는" 스무 줄이고, 그 뒤는 기존 setSessionCookie 가 받습니다.
 *
 * 흐름:
 *   1. 사용자가 `/api/auth/oauth/kakao?next=/community` 로 이동
 *   2. state 쿠키를 심고 제공자 인가 화면으로 302
 *   3. 제공자가 `/api/auth/oauth/kakao/callback?code=…&state=…` 로 돌려보냄
 *   4. state 대조 → 토큰 교환 → 프로필 조회 → linkOAuthAccount() → 세션 쿠키
 *
 * ⚠ 어느 키도 클라이언트로 나가지 않습니다. 토큰 교환은 전부 서버에서 합니다
 *   (그래서 NEXT_PUBLIC_ 접두사가 붙은 변수가 하나도 없습니다).
 */

// ─── 제공자 표 ───────────────────────────────────────────────

export interface OAuthProfile {
  /** 제공자가 주는 회원 번호. 이메일이 아닙니다 — 이메일은 바뀝니다 */
  uid: string;
  nickname: string | null;
  email: string | null;
}

export interface ProviderSpec {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  /** 빈 문자열이면 scope 파라미터를 보내지 않습니다 (카카오는 콘솔 설정을 따릅니다) */
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** 시크릿 없이도 동작하는가 (카카오는 콘솔에서 '사용 안 함' 이 기본) */
  secretOptional?: boolean;
  /**
   * PKCE 지원 여부. 인가 코드가 새어 나가도 code_verifier 없이는 토큰으로 못
   * 바꾸게 합니다. 네이버는 공식 지원이 없어 끕니다 — 보내면 무시되는 게 아니라
   * 서명 검증에서 튕겨낼 수 있습니다.
   */
  pkce: boolean;
  /** 인가 URL 에 더 붙일 값 */
  authParams?: Record<string, string>;
  parseProfile(raw: unknown): OAuthProfile;
}

/** 프로필 JSON 을 훑을 때 쓰는 좁은 도우미 — any 를 흩뿌리지 않으려고 둡니다 */
function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const PROVIDERS: Record<OAuthProviderId, ProviderSpec> = {
  // https://developers.google.com/identity/protocols/oauth2/web-server
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    pkce: true,
    parseProfile: (raw) => ({
      uid: String(pick(raw, 'sub') ?? ''),
      nickname: str(pick(raw, 'name')) ?? str(pick(raw, 'given_name')),
      email: str(pick(raw, 'email')),
    }),
  },

  // https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api
  //
  // 이메일(account_email)은 **비즈 앱 심사를 통과해야** 동의를 받을 수 있고,
  // 통과 전에 scope 에 넣으면 인가 화면에서 바로 에러가 납니다. 그래서 기본
  // scope 는 닉네임만입니다 — 이메일은 어차피 계정을 합치는 근거로 쓰지 않습니다
  // (lib/auth.ts linkOAuthAccount 주석).
  kakao: {
    label: '카카오',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    scope: 'profile_nickname',
    clientIdEnv: 'KAKAO_REST_API_KEY',
    clientSecretEnv: 'KAKAO_CLIENT_SECRET',
    secretOptional: true,
    pkce: true,
    parseProfile: (raw) => ({
      uid: String(pick(raw, 'id') ?? ''),
      nickname:
        str(pick(raw, 'kakao_account', 'profile', 'nickname')) ??
        str(pick(raw, 'properties', 'nickname')),
      email: str(pick(raw, 'kakao_account', 'email')),
    }),
  },

  // https://developers.naver.com/docs/login/api/api.md
  naver: {
    label: '네이버',
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    profileUrl: 'https://openapi.naver.com/v1/nid/me',
    scope: '',
    clientIdEnv: 'NAVER_CLIENT_ID',
    clientSecretEnv: 'NAVER_CLIENT_SECRET',
    pkce: false,
    parseProfile: (raw) => ({
      uid: String(pick(raw, 'response', 'id') ?? ''),
      nickname: str(pick(raw, 'response', 'nickname')) ?? str(pick(raw, 'response', 'name')),
      email: str(pick(raw, 'response', 'email')),
    }),
  },
};

export function providerSpec(provider: OAuthProviderId): ProviderSpec {
  return PROVIDERS[provider];
}

// ─── 설정 ────────────────────────────────────────────────────

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * 환경변수에서 키를 꺼냅니다. 하나라도 없으면 null — 그 제공자는 **없는 것처럼**
 * 다룹니다(버튼을 눌러도 안내만 하고 제공자로 보내지 않습니다). 빈 값으로 보내면
 * 사용자가 제공자 쪽 영문 에러 화면을 보게 되는데, 그건 우리가 설명해야 할
 * 상황입니다.
 */
export function oauthCredentials(provider: OAuthProviderId): OAuthCredentials | null {
  const spec = PROVIDERS[provider];
  const clientId = process.env[spec.clientIdEnv]?.trim();
  const clientSecret = process.env[spec.clientSecretEnv]?.trim() ?? '';
  if (!clientId) return null;
  if (!clientSecret && !spec.secretOptional) return null;
  return { clientId, clientSecret };
}

export function isOAuthConfigured(provider: OAuthProviderId): boolean {
  return oauthCredentials(provider) !== null;
}

/**
 * 콜백 주소. 제공자 콘솔에 **글자 하나까지 똑같이** 등록해야 합니다.
 *
 * 요청 헤더에서 유추하는 건 마지막 수단입니다 — 프록시 뒤에서는 Host 가 내부
 * 주소일 수 있고, 그러면 등록해 둔 주소와 달라 토큰 교환이 실패합니다. 운영에서는
 * APP_URL 을 못박아 두세요.
 */
export function redirectUri(request: Request, provider: OAuthProviderId): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured || requestOrigin(request);
  return `${base.replace(/\/+$/, '')}/api/auth/oauth/${provider}/callback`;
}

function requestOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? request.headers.get('host');
  if (host) return `${proto || 'http'}://${host}`;
  return new URL(request.url).origin;
}

// ─── state (+ PKCE) ──────────────────────────────────────────

/** state 쿠키에 봉해 두는 것. 쿠키는 서명돼 있어 사용자가 고칠 수 없습니다 */
export interface OAuthState {
  /** 어느 제공자로 나갔는지 — 콜백 경로와 맞지 않으면 버립니다 */
  p: OAuthProviderId;
  /** 제공자에게 넘긴 state 값과 대조할 난수 */
  n: string;
  /** 끝나고 돌아갈 앱 안쪽 경로 */
  next: string;
  /** PKCE code_verifier. 이것만은 제공자에게 미리 보내지 않습니다 */
  v?: string;
}

/** 인가 요청이 끝나기까지 주는 시간. 길게 둘 이유가 없습니다 */
export const OAUTH_STATE_TTL_S = 10 * 60;

export function sealState(state: OAuthState): string {
  return sealPayload(state, OAUTH_STATE_TTL_S);
}

export function openState(token: string | null): OAuthState | null {
  const state = openPayload<OAuthState>(token);
  if (!state || typeof state.n !== 'string' || typeof state.p !== 'string') return null;
  return state;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** 인가 요청 한 건에 필요한 난수들 */
export function newStateSecrets(pkce: boolean): { nonce: string; verifier?: string } {
  return {
    nonce: base64url(randomBytes(16)),
    // RFC 7636 은 43~128자를 요구합니다. 32바이트 → base64url 43자.
    verifier: pkce ? base64url(randomBytes(32)) : undefined,
  };
}

function codeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

// ─── 인가 URL ────────────────────────────────────────────────

export function authorizeUrl(params: {
  provider: OAuthProviderId;
  clientId: string;
  redirectUri: string;
  nonce: string;
  verifier?: string;
}): string {
  const spec = PROVIDERS[params.provider];
  const url = new URL(spec.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.nonce);
  if (spec.scope) url.searchParams.set('scope', spec.scope);
  if (spec.pkce && params.verifier) {
    url.searchParams.set('code_challenge', codeChallenge(params.verifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(spec.authParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

// ─── 토큰 교환 · 프로필 ──────────────────────────────────────

/**
 * 인가 코드를 액세스 토큰으로 바꿉니다.
 *
 * 세 곳 모두 `application/x-www-form-urlencoded` 를 받습니다. 네이버만 토큰
 * 요청에도 state 를 요구합니다 — 없으면 400 이 옵니다.
 */
export async function exchangeCode(params: {
  provider: OAuthProviderId;
  code: string;
  redirectUri: string;
  credentials: OAuthCredentials;
  state: string;
  verifier?: string;
}): Promise<string | null> {
  const spec = PROVIDERS[params.provider];
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.credentials.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    state: params.state,
  });
  if (params.credentials.clientSecret) {
    body.set('client_secret', params.credentials.clientSecret);
  }
  if (spec.pkce && params.verifier) body.set('code_verifier', params.verifier);

  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    cache: 'no-store',
  });

  // 네이버는 실패해도 200 에 error 필드를 담아 주는 경우가 있어 본문을 먼저 봅니다.
  const json = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
  const token = json && typeof json.access_token === 'string' ? json.access_token : null;
  if (!token) {
    console.warn(`[oauth] ${params.provider} 토큰 교환 실패 — ${res.status}`);
    return null;
  }
  return token;
}

export async function fetchProfile(
  provider: OAuthProviderId,
  accessToken: string,
): Promise<OAuthProfile | null> {
  const spec = PROVIDERS[provider];
  const res = await fetch(spec.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    console.warn(`[oauth] ${provider} 프로필 조회 실패 — ${res.status}`);
    return null;
  }

  const profile = spec.parseProfile(await res.json().catch(() => null));
  // uid 가 없으면 계정을 붙일 곳이 없습니다 — 여기서 멈추지 않으면 빈 문자열
  // 하나에 여러 사람이 묶입니다.
  return profile.uid ? profile : null;
}
