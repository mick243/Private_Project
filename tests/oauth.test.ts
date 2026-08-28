import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/auth-types';
import {
  authorizeUrl,
  newStateSecrets,
  oauthCredentials,
  openState,
  providerSpec,
  redirectUri,
  sealState,
} from '@/lib/oauth';
import { oauthErrorMessage } from '@/lib/oauth-types';

/**
 * 소셜 로그인에서 **틀려도 조용한** 부분만 골라 봅니다.
 *
 * 실제 왕복(토큰 교환·프로필 조회)은 제공자 서버가 있어야 하고, 거기서 틀리면
 * 화면에 에러라도 뜹니다. 반대로 여기 있는 것들은 틀려도 로그인이 그냥 되는
 * 것처럼 보입니다 — state 대조를 빼먹으면 남이 만든 링크로도 로그인되고,
 * PKCE 챌린지가 안 붙어도 흐름은 정상으로 끝납니다.
 */

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'KAKAO_REST_API_KEY',
  'KAKAO_CLIENT_SECRET',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('oauthCredentials — 키가 없는 제공자는 없는 것처럼 다룬다', () => {
  it('클라이언트 ID 가 없으면 null', () => {
    expect(oauthCredentials('google')).toBeNull();
  });

  it('구글·네이버는 시크릿까지 있어야 한다', () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    expect(oauthCredentials('google')).toBeNull();

    process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
    expect(oauthCredentials('google')).toEqual({ clientId: 'gid', clientSecret: 'gsecret' });
  });

  it('카카오는 시크릿 없이도 동작한다 — 콘솔 기본값이 사용 안 함이다', () => {
    process.env.KAKAO_REST_API_KEY = 'kid';
    expect(oauthCredentials('kakao')).toEqual({ clientId: 'kid', clientSecret: '' });
  });
});

describe('redirectUri — 콘솔에 등록한 주소와 한 글자도 달라선 안 된다', () => {
  const req = (headers: Record<string, string> = {}) =>
    new Request('http://internal.local/api/auth/oauth/naver', { headers });

  it('APP_URL 이 있으면 그것만 쓴다 (프록시 뒤에서 Host 는 내부 주소다)', () => {
    process.env.APP_URL = 'https://arcade.example.com/';
    expect(redirectUri(req({ host: 'internal.local' }), 'naver')).toBe(
      'https://arcade.example.com/api/auth/oauth/naver/callback',
    );
  });

  it('없으면 전달 헤더로 유추한다', () => {
    const uri = redirectUri(
      req({ host: 'internal.local', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'a.com' }),
      'kakao',
    );
    expect(uri).toBe('https://a.com/api/auth/oauth/kakao/callback');
  });
});

describe('authorizeUrl — 제공자에게 넘어가는 것과 넘어가면 안 되는 것', () => {
  const build = (provider: 'google' | 'kakao' | 'naver', verifier?: string) =>
    new URL(
      authorizeUrl({
        provider,
        clientId: 'cid',
        redirectUri: 'https://a.com/cb',
        nonce: 'NONCE',
        verifier,
      }),
    );

  it('PKCE 제공자는 verifier 가 아니라 해시(S256)를 보낸다', () => {
    const url = build('google', 'verifier-value');
    const expected = createHash('sha256').update('verifier-value').digest('base64url');
    expect(url.searchParams.get('code_challenge')).toBe(expected);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // verifier 자체가 새어 나가면 PKCE 가 아무것도 막지 못한다.
    expect(url.toString()).not.toContain('verifier-value');
  });

  it('네이버는 PKCE 를 지원하지 않으므로 챌린지를 붙이지 않는다', () => {
    const url = build('naver', 'verifier-value');
    expect(url.searchParams.get('code_challenge')).toBeNull();
    expect(url.searchParams.get('scope')).toBeNull();
  });

  it('공통 파라미터는 셋 다 같다', () => {
    for (const p of ['google', 'kakao', 'naver'] as const) {
      const url = build(p, 'v');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('cid');
      expect(url.searchParams.get('redirect_uri')).toBe('https://a.com/cb');
      expect(url.searchParams.get('state')).toBe('NONCE');
    }
  });

  it('카카오 범위에 이메일을 넣지 않는다 — 비즈 앱 심사 전에는 인가 화면이 에러난다', () => {
    expect(build('kakao').searchParams.get('scope')).toBe('profile_nickname');
  });
});

describe('state — 콜백이 우리 요청의 답인지 아는 유일한 근거', () => {
  it('봉했다 풀면 그대로 나온다', () => {
    const token = sealState({ p: 'kakao', n: 'nonce', next: '/community', v: 'ver' });
    const state = openState(token);
    expect(state).toMatchObject({ p: 'kakao', n: 'nonce', next: '/community', v: 'ver' });
  });

  it('한 글자만 고쳐도 열리지 않는다', () => {
    const token = sealState({ p: 'kakao', n: 'nonce', next: '/' });
    // 본문만 바꾸고 서명은 그대로 — 서명 검증이 없으면 통과한다.
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ p: 'kakao', n: 'nonce', next: '/', exp: 2 ** 40 }),
    ).toString('base64url');
    expect(forged).not.toBe(body);
    expect(openState(`${forged}.${sig}`)).toBeNull();
  });

  it('서명이 없으면 열리지 않는다', () => {
    expect(openState(null)).toBeNull();
    expect(openState('그냥-문자열')).toBeNull();
  });

  it('PKCE 를 쓰는 제공자만 verifier 를 만든다', () => {
    expect(newStateSecrets(true).verifier).toMatch(/^[\w-]{43}$/);
    expect(newStateSecrets(false).verifier).toBeUndefined();
    // nonce 는 매번 달라야 한다 — 같으면 재사용을 막지 못한다.
    expect(newStateSecrets(false).nonce).not.toBe(newStateSecrets(false).nonce);
  });
});

describe('parseProfile — 제공자마다 다른 JSON 에서 같은 세 값을 꺼낸다', () => {
  it('google', () => {
    expect(
      providerSpec('google').parseProfile({ sub: '1234', name: '홍길동', email: 'a@b.com' }),
    ).toEqual({ uid: '1234', nickname: '홍길동', email: 'a@b.com' });
  });

  it('kakao — id 는 숫자로 온다', () => {
    expect(
      providerSpec('kakao').parseProfile({
        id: 987654321,
        kakao_account: { profile: { nickname: '펌린이' } },
      }),
    ).toEqual({ uid: '987654321', nickname: '펌린이', email: null });
  });

  it('naver — 한 겹 안쪽(response)에 들어 있다', () => {
    expect(
      providerSpec('naver').parseProfile({
        response: { id: 'abc', nickname: '', name: '김철수', email: 'c@d.com' },
      }),
    ).toEqual({ uid: 'abc', nickname: '김철수', email: 'c@d.com' });
  });

  it('모양이 아주 다르면 uid 가 빈 문자열이 된다 (호출부에서 거른다)', () => {
    expect(providerSpec('google').parseProfile(null).uid).toBe('');
    expect(providerSpec('naver').parseProfile({ error: 'nope' }).uid).toBe('');
  });
});

describe('safeNext — 로그인 뒤 돌아갈 곳', () => {
  it('앱 안쪽 경로만 통과시킨다', () => {
    expect(safeNext('/community')).toBe('/community');
    expect(safeNext('/?arcade=3')).toBe('/?arcade=3');
  });

  it('바깥으로 튕겨 보내는 값은 전부 / 로 접는다', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    // 프로토콜 상대 URL — 슬래시로 시작한다고 안심하면 뚫린다.
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
  });
});

describe('oauthErrorMessage — 문장은 화면이 고른다', () => {
  it('아는 코드는 그 안내를, 모르는 코드는 일반 안내를 준다', () => {
    expect(oauthErrorMessage('denied')).toContain('취소');
    expect(oauthErrorMessage('unconfigured')).toContain('준비되지 않은');
    expect(oauthErrorMessage('<script>')).toBe(oauthErrorMessage('provider'));
    expect(oauthErrorMessage(null)).toBeNull();
  });
});
