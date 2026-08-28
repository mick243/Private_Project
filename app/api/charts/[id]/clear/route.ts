import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getChartDetail, setClear } from '@/lib/tier';
import { formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  playerId: z.number().int().positive(),
  cleared: z.boolean(),
});

/**
 * POST /api/charts/:id/clear — 클리어 기록 등록/해제
 *
 * 해제하면 그 채보에 남긴 투표도 FK CASCADE 로 함께 사라집니다.
 * (클리어하지 않은 사람의 투표가 남아 있으면 안 되므로)
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const chartId = Number((await ctx.params).id);
  if (!Number.isInteger(chartId) || chartId <= 0) {
    return NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  await setClear(parsed.data.playerId, chartId, parsed.data.cleared);
  return NextResponse.json({ chart: await getChartDetail(chartId, parsed.data.playerId) });
}
