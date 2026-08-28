import { NextResponse } from 'next/server';
import { deleteComment, listComments, upsertComment } from '@/lib/comments';
import { getChartDetail } from '@/lib/tier';
import { commentInputSchema, formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });

/** GET /api/charts/:id/comments — 채보 평가 목록 */
export async function GET(_request: Request, ctx: Ctx) {
  const chartId = parseId((await ctx.params).id);
  if (chartId === null) return BAD_ID();

  return NextResponse.json({ comments: await listComments(chartId) });
}

/**
 * POST /api/charts/:id/comments — 평가 등록/수정 (1인 1평가라 UPSERT)
 *
 * 투표(/vote)와 달리 클리어 게이트가 없습니다 — 못 깬 사람의 "여기서 막힌다"
 * 도 정보이기 때문입니다. 대신 응답의 comments[].cleared 로 구분됩니다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const chartId = parseId((await ctx.params).id);
  if (chartId === null) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = commentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  // 채보 존재 확인 겸, 갱신된 상세를 그대로 돌려주기 위해 먼저 읽는다.
  if (!(await getChartDetail(chartId, null))) {
    return NextResponse.json({ error: '채보를 찾을 수 없습니다' }, { status: 404 });
  }

  await upsertComment({ ...parsed.data, chartId });
  const chart = await getChartDetail(chartId, parsed.data.playerId);
  return NextResponse.json({ chart }, { status: 201 });
}

/** DELETE /api/charts/:id/comments?playerId=1 — 본인 평가 삭제 */
export async function DELETE(request: Request, ctx: Ctx) {
  const chartId = parseId((await ctx.params).id);
  if (chartId === null) return BAD_ID();

  const playerId = parseId(new URL(request.url).searchParams.get('playerId') ?? '');
  if (playerId === null) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  const deleted = await deleteComment(chartId, playerId);
  if (!deleted) {
    return NextResponse.json({ error: '삭제할 평가가 없습니다' }, { status: 404 });
  }

  return NextResponse.json({ chart: await getChartDetail(chartId, playerId) });
}
