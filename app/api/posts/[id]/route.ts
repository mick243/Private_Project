import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { bumpView, deletePost, deletePostAsAdmin, getPost, updatePost } from '@/lib/board';
import { isForeignKeyViolation } from '@/lib/pg-errors';
import { formatIssues, postInputSchema } from '@/lib/validation';
import { noticeGuard } from '../notice-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
const NOT_FOUND = () => NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
/** 남의 글을 고치거나 지우려는 경우. 존재 여부는 알려주되 권한은 막는다. */
const NOT_MINE = () =>
  NextResponse.json({ error: '본인이 쓴 글만 수정·삭제할 수 있습니다' }, { status: 403 });

/**
 * GET /api/posts/:id?playerId=1&view=1&commentOffset=10
 *   view=1 이면 조회수를 올립니다. 목록에서 상세를 열 때만 붙이고,
 *   수정·삭제·추천 후 다시 읽을 때는 붙이지 않습니다.
 *   commentOffset 은 댓글 페이지의 시작 위치입니다. 범위를 벗어나면 마지막
 *   페이지로 당겨지고, 실제로 쓰인 값이 post.commentOffset 으로 나갑니다.
 */
export async function GET(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  const { searchParams } = new URL(request.url);
  const rawPlayer = Number(searchParams.get('playerId'));
  const playerId = Number.isInteger(rawPlayer) && rawPlayer > 0 ? rawPlayer : null;

  const rawOffset = Number(searchParams.get('commentOffset'));
  const commentOffset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  if (searchParams.get('view') === '1') await bumpView(id);

  const post = await getPost(id, playerId, commentOffset);
  return post ? NextResponse.json({ post }) : NOT_FOUND();
}

/** PUT /api/posts/:id — 본인 글 수정 */
export async function PUT(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = postInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const existing = await getPost(id, null);
  if (!existing) return NOT_FOUND();

  // 일반 글로 올린 뒤 말머리만 공지로 바꾸는 길도 같이 막는다 (../notice-guard.ts)
  const denied = await noticeGuard(request, parsed.data);
  if (denied) return denied;

  try {
    const updated = await updatePost(id, parsed.data.playerId, parsed.data);
    if (!updated) return NOT_MINE();
    return NextResponse.json({ post: await getPost(id, parsed.data.playerId) });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(
        { error: '말머리 또는 게임을 다시 확인해 주세요' },
        { status: 400 },
      );
    }
    throw err;
  }
}

/**
 * DELETE /api/posts/:id?playerId=1 — 글 삭제 (본인 또는 **관리자**)
 *
 * 관리자는 `playerId` 없이도 지울 수 있습니다 — 근거가 쿼리스트링이 아니라
 * 세션 쿠키이기 때문입니다. 반대로 일반 사용자에게는 지금까지와 똑같이
 * `playerId` 가 필요하고 남의 글은 403 입니다.
 *
 * 수정(PUT)은 열지 않았습니다. 지우는 것과 달리 고치는 건 남의 이름으로 남는
 * 글의 내용이 바뀌는 일이라, 관리에 필요한 최소한을 넘습니다.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  const existing = await getPost(id, null);
  if (!existing) return NOT_FOUND();

  if (await isAdminRequest(request)) {
    await deletePostAsAdmin(id);
    return new NextResponse(null, { status: 204 });
  }

  const playerId = parseId(new URL(request.url).searchParams.get('playerId') ?? '');
  if (playerId === null) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  const deleted = await deletePost(id, playerId);
  return deleted ? new NextResponse(null, { status: 204 }) : NOT_MINE();
}
