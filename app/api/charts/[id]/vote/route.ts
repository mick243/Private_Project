import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NotClearedError, getChartDetail, getSettings, setVote } from '@/lib/tier';
import { formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  playerId: z.number().int().positive(),
  /** null 이면 투표 취소 */
  value: z.number().nullable(),
});

/**
 * POST /api/charts/:id/vote — 체감 난이도 투표
 *
 * 클리어 기록이 없으면 403. 투표 범위는 tier_settings 에서 읽어 검증하므로
 * 스케일을 바꿔도 코드를 고칠 필요가 없습니다.
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

  const { playerId, value } = parsed.data;

  if (value !== null) {
    const { voteMin, voteMax } = await getSettings();
    if (value < voteMin || value > voteMax) {
      return NextResponse.json(
        { error: `투표값은 ${voteMin} ~ ${voteMax} 사이여야 합니다` },
        { status: 400 },
      );
    }
  }

  try {
    await setVote(playerId, chartId, value);
  } catch (err) {
    if (err instanceof NotClearedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  return NextResponse.json({ chart: await getChartDetail(chartId, playerId) });
}
