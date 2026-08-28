import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session — 지금 로그인한 사람 `{user}` (없으면 `{user: null}`)
 *
 * 화면이 관리자 버튼을 그릴지 정하는 근거입니다. 쿠키만 읽지 않고 DB 를 한 번
 * 더 보는 이유는 requireAdmin 과 같습니다 — 권한이 회수됐는데 버튼만 남아 있으면
 * 누를 때마다 403 을 보게 됩니다.
 */
export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ user: null });

  const db = await getDb();
  const { rows } = await db.query<{ nickname: string; is_admin: boolean }>(
    `SELECT nickname, is_admin FROM players WHERE id = $1`,
    [session.playerId],
  );

  // 계정이 사라졌다면 쿠키도 같이 정리한다 — 남겨 두면 매 요청 DB 를 한 번씩 더 본다.
  if (!rows[0]) return clearSessionCookie(NextResponse.json({ user: null }));

  return NextResponse.json({
    user: {
      playerId: session.playerId,
      nickname: rows[0].nickname,
      isAdmin: !!rows[0].is_admin,
    },
  });
}
