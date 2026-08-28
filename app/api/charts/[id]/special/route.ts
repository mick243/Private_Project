import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getChartDetail, setSpecial } from '@/lib/tier';
import { formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  playerId: z.number().int().positive(),
  special: z.boolean(),
});

/**
 * POST /api/charts/:id/special — 특수 패턴 표시 켜기/끄기
 *
 * 클리어 기록은 요구하지 않습니다 (평가란과 같은 이유 — 못 깬 사람도 기믹은
 * 보입니다). playerId 는 "로그인한 사람인지" 만 확인하는 용도이고, 값 자체는
 * 채보에 하나뿐이라 누가 켰는지는 저장하지 않습니다.
 *
 * ⚠ 투표·평가와 달리 **한 사람이 켜면 모두에게 그렇게 보입니다.** 프로토타입의
 *   신뢰 모델(클라이언트가 보낸 playerId 를 그대로 믿는 /clear · /vote 와 동일)을
 *   따릅니다. 남용이 문제가 되면 관리자 전용으로 좁히거나 표시한 사람을 기록해
 *   합산(min_votes 처럼)하는 쪽으로 바꿔야 합니다.
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

  await setSpecial(parsed.data.playerId, chartId, parsed.data.special);
  return NextResponse.json({ chart: await getChartDetail(chartId, parsed.data.playerId) });
}
