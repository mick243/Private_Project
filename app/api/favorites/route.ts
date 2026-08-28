import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { addFavorite, listFavoriteIds, removeFavorite } from '@/lib/favorites';
import { isForeignKeyViolation } from '@/lib/pg-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 즐겨찾기 — 내가 담아 둔 오락실 id 목록.
 *
 * 누구인지는 **세션에서만** 읽습니다. 이 프로젝트의 옛 쓰기 경로들은 본문의
 * playerId 를 그대로 믿는데(로그인이 없던 시절의 잔재), 그러면 남의 즐겨찾기에
 * 곳을 담을 수 있습니다. 리뷰·제보는 공개되는 값이라 티가 나지만 즐겨찾기는
 * 조용히 어긋납니다.
 */

function playerOf(request: Request): number | null {
  return getSession(request)?.playerId ?? null;
}

function parseArcadeId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NEED_LOGIN = () =>
  NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

/**
 * GET /api/favorites
 *
 * 비로그인은 401 이 아니라 빈 목록입니다 — 화면은 로그인 여부와 무관하게 이걸
 * 한 번 부르고(사이드바가 별을 그릴지 정하려면 필요합니다), 로그인하지 않은
 * 상태는 오류가 아니라 정상입니다.
 */
export async function GET(request: Request) {
  const playerId = playerOf(request);
  return NextResponse.json({
    arcadeIds: playerId === null ? [] : await listFavoriteIds(playerId),
  });
}

/** POST /api/favorites — 담기 `{arcadeId}`. 이미 담아 뒀으면 그대로 성공 */
export async function POST(request: Request) {
  const playerId = playerOf(request);
  if (playerId === null) return NEED_LOGIN();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const arcadeId = parseArcadeId((body as { arcadeId?: unknown })?.arcadeId);
  if (arcadeId === null) {
    return NextResponse.json({ error: 'arcadeId 가 필요합니다' }, { status: 400 });
  }

  try {
    await addFavorite(playerId, arcadeId);
  } catch (err) {
    // 없는 오락실이면 FK 위반이다. 존재 확인을 따로 하면 그 사이에 지워지는
    // 틈이 남으므로 DB 제약을 그대로 답으로 옮긴다.
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: '오락실을 찾을 수 없습니다' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ arcadeIds: await listFavoriteIds(playerId) });
}

/**
 * DELETE /api/favorites?arcadeId=3 — 빼기.
 *
 * 담아 두지 않았던 곳이어도 200 입니다. 별을 두 번 누른 것뿐인데 오류를 띄우면,
 * 화면에는 이미 빠져 있는 상태라 사람이 고칠 방법이 없습니다.
 */
export async function DELETE(request: Request) {
  const playerId = playerOf(request);
  if (playerId === null) return NEED_LOGIN();

  const arcadeId = parseArcadeId(new URL(request.url).searchParams.get('arcadeId'));
  if (arcadeId === null) {
    return NextResponse.json({ error: 'arcadeId 가 필요합니다' }, { status: 400 });
  }

  await removeFavorite(playerId, arcadeId);
  return NextResponse.json({ arcadeIds: await listFavoriteIds(playerId) });
}
