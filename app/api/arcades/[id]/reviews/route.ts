import { NextResponse } from 'next/server';
import { getArcade } from '@/lib/arcades';
import { deleteReview, listReviews, upsertReview } from '@/lib/reviews';
import { formatIssues, reviewInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });

/** GET /api/arcades/:id/reviews */
export async function GET(_request: Request, ctx: Ctx) {
  const arcadeId = parseId((await ctx.params).id);
  if (arcadeId === null) return BAD_ID();

  return NextResponse.json({ reviews: await listReviews(arcadeId) });
}

/**
 * POST /api/arcades/:id/reviews — 리뷰 등록/수정 (1인 1리뷰라 UPSERT)
 * 평점 캐시가 갱신되므로 오락실도 함께 돌려줍니다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const arcadeId = parseId((await ctx.params).id);
  if (arcadeId === null) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = reviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  if (!(await getArcade(arcadeId))) {
    return NextResponse.json({ error: '오락실을 찾을 수 없습니다' }, { status: 404 });
  }

  const review = await upsertReview({ ...parsed.data, arcadeId });
  return NextResponse.json(
    { review, reviews: await listReviews(arcadeId), arcade: await getArcade(arcadeId) },
    { status: 201 },
  );
}

/** DELETE /api/arcades/:id/reviews?playerId=1 — 본인 리뷰 삭제 */
export async function DELETE(request: Request, ctx: Ctx) {
  const arcadeId = parseId((await ctx.params).id);
  if (arcadeId === null) return BAD_ID();

  const playerId = parseId(new URL(request.url).searchParams.get('playerId') ?? '');
  if (playerId === null) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  const deleted = await deleteReview(arcadeId, playerId);
  if (!deleted) {
    return NextResponse.json({ error: '삭제할 리뷰가 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    reviews: await listReviews(arcadeId),
    arcade: await getArcade(arcadeId),
  });
}
