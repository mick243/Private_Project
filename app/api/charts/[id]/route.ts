import { NextResponse } from 'next/server';
import { getChartDetail } from '@/lib/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/charts/:id?playerId=1 — 채보 상세 + 투표 분포 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
  }

  const raw = Number(new URL(request.url).searchParams.get('playerId'));
  const playerId = Number.isInteger(raw) && raw > 0 ? raw : null;

  const chart = await getChartDetail(id, playerId);
  return chart
    ? NextResponse.json({ chart })
    : NextResponse.json({ error: '채보를 찾을 수 없습니다' }, { status: 404 });
}
