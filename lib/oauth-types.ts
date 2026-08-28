/**
 * 소셜 로그인에서 **화면도 함께 봐야 하는** 것들.
 *
 * lib/oauth.ts 는 node:crypto 와 환경변수를 끌고 오므로 컴포넌트에서 못 씁니다.
 * 버튼이 알아야 하는 건 "무엇이 있고 뭐라고 부르는가" 뿐이라 여기 둡니다
 * (lib/auth-types.ts 와 같은 규칙).
 */

/** 버튼에 그려지는 순서이기도 합니다 */
export const OAUTH_PROVIDERS = ['google', 'kakao', 'naver'] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

/** 버튼에 적히는 이름. 브랜드 표기라서 번역하지 않습니다 */
export const OAUTH_LABELS: Record<OAuthProviderId, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * 인가 요청과 콜백을 잇는 쿠키.
 *
 * 콜백은 우리가 보낸 요청의 답인지 알 방법이 이것뿐입니다 — 없으면 남이 만든
 * `?code=…` 링크를 누른 사람이 남의 계정으로 로그인됩니다(CSRF).
 * 쿠키 안에 무엇이 들었는지는 lib/oauth.ts 의 OAuthState 를 보세요.
 */
export const OAUTH_STATE_COOKIE = 'arcade_oauth_state';

/**
 * 실패했을 때 `/login?error=…` 로 돌아오는 코드.
 *
 * 사람이 읽을 문장을 쿼리에 실어 나르면 우리 도메인에 아무 문구나 띄우는
 * 링크가 됩니다. 코드만 넘기고 문장은 화면이 고릅니다.
 */
export const OAUTH_ERRORS = {
  unconfigured: '아직 준비되지 않은 로그인 방식입니다 (관리자에게 문의해 주세요)',
  state: '로그인 요청이 만료되었습니다. 다시 시도해 주세요',
  denied: '소셜 로그인이 취소되었습니다',
  provider: '소셜 로그인 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요',
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERRORS;

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in OAUTH_ERRORS ? OAUTH_ERRORS[code as OAuthErrorCode] : OAUTH_ERRORS.provider;
}
