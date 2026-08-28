import { OAUTH_LABELS, OAUTH_PROVIDERS, type OAuthProviderId } from '@/lib/oauth-types';

/**
 * 소셜 로그인 버튼 줄 (Google · 카카오 · 네이버).
 *
 * `<a>` 입니다 — fetch 가 아니라 **주소창이 통째로 제공자에게 넘어가야** 합니다.
 * 인가 화면은 우리 도메인 밖이라 XHR 로는 열 수 없고, 사용자도 지금 어디에
 * 로그인하는지 주소로 확인할 수 있어야 합니다.
 *
 * 어떤 제공자가 실제로 설정돼 있는지는 여기서 모릅니다 — 키는 서버에만 있고,
 * 알려면 NEXT_PUBLIC_ 로 내보내야 합니다. 미설정인 곳을 누르면 시작 라우트가
 * `/login?error=unconfigured` 로 돌려보내며 안내합니다
 * (app/api/auth/oauth/[provider]/route.ts).
 *
 * 로그인/가입 두 화면이 같은 줄을 씁니다. 소셜은 "가입" 과 "로그인" 이 같은
 * 동작이라(처음이면 계정이 생기고, 아니면 그 계정으로 들어옵니다) 버튼도 하나면
 * 충분합니다 — 대신 문구를 화면마다 `verb` 로 바꿉니다.
 */
export default function OAuthButtons({
  next,
  verb = '로그인',
}: {
  /** 끝나고 돌아갈 앱 안쪽 경로 */
  next: string;
  verb?: string;
}) {
  return (
    <div className="oauth">
      {/* 위쪽 로그인 버튼과 24px 떨어뜨리는 건 .oauth 의 margin-top 입니다
          (globals.css) — 여기서 두 벌로 적지 않습니다. */}
      <p className="oauth-divider">
        <span>또는</span>
      </p>
      <div className="oauth-list">
        {OAUTH_PROVIDERS.map((id) => (
          <a
            key={id}
            className={`btn btn-oauth btn-oauth-${id}`}
            href={`/api/auth/oauth/${id}?next=${encodeURIComponent(next)}`}
          >
            <ProviderIcon id={id} />
            <span>
              {OAUTH_LABELS[id]}
              {verb ? ` ${verb}` : ''}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * 브랜드 마크. 파일로 두지 않고 인라인 SVG 인 이유는 크기가 작고(각 1KB 미만)
 * 버튼과 함께 색이 정해져 있어서입니다 — 이미지로 두면 요청이 세 번 더 나갑니다.
 * ⚠ 각 사의 브랜드 가이드가 색·비율 변경을 금지합니다. 여기 값을 임의로 바꾸지 마세요.
 */
function ProviderIcon({ id }: { id: OAuthProviderId }) {
  if (id === 'google') {
    return (
      <svg className="oauth-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    );
  }
  if (id === 'kakao') {
    return (
      <svg className="oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3C6.48 3 2 6.52 2 10.86c0 2.8 1.86 5.26 4.66 6.65-.15.53-.97 3.36-1 3.58 0 0-.02.17.09.24.11.06.24.01.24.01.31-.04 3.6-2.36 4.17-2.76.6.09 1.22.13 1.84.13 5.52 0 10-3.52 10-7.85S17.52 3 12 3z"
        />
      </svg>
    );
  }
  return (
    <svg className="oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.27 12.84 7.4 0H0v24h7.73V11.16L16.6 24H24V0h-7.73v12.84z" />
    </svg>
  );
}
