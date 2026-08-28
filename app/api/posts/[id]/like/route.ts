import { NextResponse } from 'next/server';
import { getPost, toggleLike } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/posts/:id/like — 추천 토글 `{playerId, commentOffset?}`
 *
 * 켜고 끄는 두 엔드포인트로 나누지 않는 이유: 클라이언트가 현재 상태를 알고
 * 있어야 하고, 그 상태가 틀리면 (다른 탭에서 이미 눌렀다면) 조용히 어긋납니다.
 * 토글은 DB 의 현재 상태를 기준으로 판단하므로 그럴 일이 없습니다.
 *
 * commentOffset 은 보고 있던 댓글 페이지를 유지하기 위한 것입니다 — 추천을
 * 눌렀다고 댓글이 1페이지로 돌아가면 안 됩니다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const postId = parseId((await ctx.params).id);
  if (postId === null) {
    return NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const playerId = parseId((body as { playerId?: unknown })?.playerId);
  if (playerId === null) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  const rawOffset = Number((body as { commentOffset?: unknown })?.commentOffset);
  const commentOffset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  if (!(await getPost(postId, null))) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
  }

  const { liked } = await toggleLike(postId, playerId);
  return NextResponse.json({
    liked,
    post: await getPost(postId, playerId, commentOffset),
  });
}
