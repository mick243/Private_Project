import { NextResponse } from 'next/server';
import { deleteArcade, getArcade, updateArcade } from '@/lib/arcades';
import { requireAdmin } from '@/lib/auth';
import { arcadeInputSchema, formatIssues } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const BAD_ID = () => NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
const NOT_FOUND = () =>
  NextResponse.json({ error: '오락실을 찾을 수 없습니다' }, { status: 404 });

export async function GET(_request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  const arcade = await getArcade(id);
  return arcade ? NextResponse.json({ arcade }) : NOT_FOUND();
}

/**
 * PUT /api/arcades/:id — 오락실 수정 (관리자 전용)
 *
 * 여기서 보유 기종·대수도 함께 바뀝니다. 제보의 자동 반영을 되돌리는 유일한
 * 경로이기도 해서(lib/reports.ts deleteReport 주석), 아무나 열 수 없습니다.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = arcadeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const arcade = await updateArcade(id, parsed.data);
  return arcade ? NextResponse.json({ arcade }) : NOT_FOUND();
}

/** DELETE /api/arcades/:id — 삭제 (관리자 전용). 제보·리뷰가 CASCADE 로 함께 사라집니다 */
export async function DELETE(request: Request, ctx: Ctx) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const id = parseId((await ctx.params).id);
  if (id === null) return BAD_ID();

  const deleted = await deleteArcade(id);
  return deleted ? new NextResponse(null, { status: 204 }) : NOT_FOUND();
}
