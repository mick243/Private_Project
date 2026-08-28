import { NextResponse } from 'next/server';
import { getArcade } from '@/lib/arcades';
import {
  CabinetNotFoundError,
  createReport,
  listReports,
  MachineNotAtArcadeError,
} from '@/lib/reports';
import { formatIssues, reportInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });

/** GET /api/arcades/:id/reports?limit=30 — 그 오락실의 최근 제보 */
export async function GET(request: Request, ctx: Ctx) {
  const arcadeId = parseId((await ctx.params).id);
  if (arcadeId === null) return BAD_ID();

  const raw = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 200) : 30;

  const reports = await listReports({ arcadeId, limit });
  return NextResponse.json({ reports });
}

/**
 * POST /api/arcades/:id/reports — 제보 등록
 *
 * 응답에 갱신된 오락실을 함께 실어 보냅니다. 있어요/없어졌어요 제보는
 * 임계값이 차는 순간 보유 기종 목록을 바꾸므로, 클라이언트가 목록을 다시
 * 받아오지 않아도 화면과 DB 가 어긋나지 않게 하기 위해서입니다.
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

  const parsed = reportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  if (!(await getArcade(arcadeId))) {
    return NextResponse.json({ error: '오락실을 찾을 수 없습니다' }, { status: 404 });
  }

  try {
    const result = await createReport({ ...parsed.data, arcadeId });
    return NextResponse.json(
      { ...result, arcade: await getArcade(arcadeId) },
      { status: 201 },
    );
  } catch (err) {
    // 둘 다 "화면이 낡았다" 는 뜻이라 409 — 입력이 틀린 게 아니라 그 사이에
    // 보유 기종/대수가 바뀐 것이다.
    if (err instanceof MachineNotAtArcadeError || err instanceof CabinetNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
