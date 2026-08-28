import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import {
  createComment,
  deleteComment,
  deleteCommentAsAdmin,
  getPost,
  lastCommentOffset,
} from '@/lib/board';
import { formatIssues, postCommentInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });

/**
 * POST /api/posts/:id/comments — 댓글 작성
 *
 * 갱신된 글 전체를 돌려줍니다 — 댓글 수 캐시(comment_count)가 함께 바뀌므로,
 * 목록과 상세가 각자 다른 숫자를 들고 있지 않게 하기 위해서입니다.
 *
 * 댓글은 오래된 것부터 정렬되므로 방금 쓴 것은 항상 **마지막 페이지**에 있습니다.
 * 그 페이지를 담아 보냅니다 — 1페이지를 보고 있었다면 방금 쓴 댓글이 화면에
 * 없는 상태로 응답이 오게 되고, 사용자는 등록이 안 된 줄 압니다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const postId = parseId((await ctx.params).id);
  if (postId === null) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = postCommentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const existing = await getPost(postId, null);
  if (!existing) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
  }

  await createComment({ ...parsed.data, postId });
  return NextResponse.json(
    {
      post: await getPost(
        postId,
        parsed.data.playerId,
        lastCommentOffset(existing.commentCount + 1),
      ),
    },
    { status: 201 },
  );
}

/**
 * DELETE /api/posts/:id/comments?commentId=5&playerId=1&commentOffset=10
 *   댓글 삭제 (본인 또는 **관리자**). commentOffset 을 넘기면 보고 있던 페이지를
 *   유지합니다 (그 페이지가 비면 getPost 가 마지막 페이지로 당깁니다).
 *
 *   관리자는 playerId 없이도 지울 수 있습니다 — 근거가 세션 쿠키입니다.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const postId = parseId((await ctx.params).id);
  if (postId === null) return BAD_ID();

  const { searchParams } = new URL(request.url);
  const commentId = parseId(searchParams.get('commentId') ?? '');
  const playerId = parseId(searchParams.get('playerId') ?? '');
  if (commentId === null) {
    return NextResponse.json({ error: 'commentId 가 필요합니다' }, { status: 400 });
  }

  const isAdmin = await isAdminRequest(request);
  if (!isAdmin && playerId === null) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  const rawOffset = Number(searchParams.get('commentOffset'));
  const commentOffset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const removedFrom = isAdmin
    ? await deleteCommentAsAdmin(commentId)
    : await deleteComment(commentId, playerId!);

  if (removedFrom === null) {
    // 관리자에게는 "없는 댓글", 그 외에는 "남의 댓글" — 관리자는 소유자 검사를
    // 거치지 않으므로 실패의 뜻이 하나뿐이다.
    return isAdmin
      ? NextResponse.json({ error: '댓글을 찾을 수 없습니다' }, { status: 404 })
      : NextResponse.json({ error: '본인이 쓴 댓글만 삭제할 수 있습니다' }, { status: 403 });
  }

  return NextResponse.json({ post: await getPost(postId, playerId, commentOffset) });
}
