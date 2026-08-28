import { NextResponse } from 'next/server';
import { createArcade, listArcades } from '@/lib/arcades';
import { requireAdmin } from '@/lib/auth';
import { arcadeInputSchema, formatIssues, parseListQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/arcades
 *   ?q=          이름/주소 검색어
 *   &machines=1,3  선택 기종을 모두 보유한 곳만
 *   &lat=&lng=&radius=  반경(km) 검색 + 거리 정렬
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const arcades = await listArcades(parseListQuery(searchParams));
  return NextResponse.json({ arcades });
}

/**
 * POST /api/arcades — 오락실 등록 (관리자 전용)
 *
 * 오락실 레코드 자체를 만드는 일은 관리자만 합니다. 크라우드소싱은 그 위에
 * 얹히는 제보(있어요/없어졌어요/대기/컨디션)와 리뷰로 굴러갑니다 — 이름·주소·
 * 좌표는 한 번 틀리면 지도에서 엉뚱한 곳이 되고, 되돌릴 사람이 없습니다.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

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

  const arcade = await createArcade(parsed.data);
  return NextResponse.json({ arcade }, { status: 201 });
}
