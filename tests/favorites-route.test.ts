import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '@/lib/auth-types';
import { createSessionToken } from '@/lib/auth';

/**
 * 즐겨찾기 라우트 — **누구로 담기는가**를 봅니다.
 *
 * 이 경로의 위험은 조회 결과가 아니라 신원입니다. 옛 쓰기 경로들은 본문의
 * playerId 를 그대로 믿는데(로그인이 없던 시절의 잔재), 즐겨찾기가 그러면
 * 남의 목록에 곳을 담을 수 있고 **조용히** 어긋납니다.
 *
 * DB 는 대역으로 세웁니다 — 확인하려는 것은 "세션에서 읽은 playerId 로
 * 저장하는가" 이고, 실제 SQL 은 lib/favorites.ts 의 일입니다.
 */

const calls: { fn: string; args: unknown[] }[] = [];

vi.mock('@/lib/favorites', () => ({
  listFavoriteIds: vi.fn(async (...args: unknown[]) => {
    calls.push({ fn: 'list', args });
    return [7, 3];
  }),
  addFavorite: vi.fn(async (...args: unknown[]) => {
    calls.push({ fn: 'add', args });
  }),
  removeFavorite: vi.fn(async (...args: unknown[]) => {
    calls.push({ fn: 'remove', args });
    return true;
  }),
}));

const { GET, POST, DELETE } = await import('@/app/api/favorites/route');

/** 로그인한 사람의 요청 — 쿠키는 실제 서명 토큰을 쓴다 */
function signedIn(playerId: number, init?: RequestInit): Request {
  const token = createSessionToken({ playerId, nickname: '테스터', isAdmin: false });
  return new Request('http://localhost/api/favorites', {
    ...init,
    headers: { ...(init?.headers ?? {}), cookie: `${SESSION_COOKIE}=${token}` },
  });
}

const anonymous = (init?: RequestInit) =>
  new Request('http://localhost/api/favorites', init);

beforeEach(() => {
  calls.length = 0;
});

describe('GET /api/favorites', () => {
  it('로그인했으면 그 사람의 목록을 돌려준다', async () => {
    const res = await GET(signedIn(42));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ arcadeIds: [7, 3] });
    expect(calls).toEqual([{ fn: 'list', args: [42] }]);
  });

  it('비로그인은 401 이 아니라 빈 목록 — 화면은 로그인 여부와 무관하게 이걸 부른다', async () => {
    const res = await GET(anonymous());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ arcadeIds: [] });
    // DB 를 건드리지 않는다 — 물을 것이 없다
    expect(calls).toEqual([]);
  });
});

describe('POST /api/favorites — 담기', () => {
  const body = (payload: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  it('세션의 playerId 로 담고, 갱신된 목록을 돌려준다', async () => {
    const res = await POST(signedIn(42, body({ arcadeId: 9 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ arcadeIds: [7, 3] });
    expect(calls[0]).toEqual({ fn: 'add', args: [42, 9] });
  });

  it('본문의 playerId 는 무시한다 — 남의 목록에 담을 수 없다', async () => {
    await POST(signedIn(42, body({ arcadeId: 9, playerId: 999 })));
    expect(calls[0]).toEqual({ fn: 'add', args: [42, 9] });
  });

  it('비로그인은 401 · 아무것도 저장하지 않는다', async () => {
    const res = await POST(anonymous(body({ arcadeId: 9 })));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('arcadeId 가 없거나 이상하면 400', async () => {
    for (const bad of [undefined, 0, -3, 'abc', 1.5]) {
      const res = await POST(signedIn(42, body({ arcadeId: bad })));
      expect(res.status, String(bad)).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe('DELETE /api/favorites — 빼기', () => {
  it('쿼리스트링의 arcadeId 를 세션 주인에게서 뺀다', async () => {
    const token = createSessionToken({ playerId: 42, nickname: '테스터', isAdmin: false });
    const res = await DELETE(
      new Request('http://localhost/api/favorites?arcadeId=9', {
        method: 'DELETE',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(calls[0]).toEqual({ fn: 'remove', args: [42, 9] });
  });

  it('비로그인은 401', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/favorites?arcadeId=9', { method: 'DELETE' }),
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('arcadeId 가 없으면 400', async () => {
    const token = createSessionToken({ playerId: 42, nickname: '테스터', isAdmin: false });
    const res = await DELETE(
      new Request('http://localhost/api/favorites', {
        method: 'DELETE',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
