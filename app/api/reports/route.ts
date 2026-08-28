import { NextResponse } from 'next/server';
import { getReportSettings, listReports } from '@/lib/reports';
import { parseReportQuery } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/reports — 전국 실시간 제보 피드
 *   ?arcadeId= &machineId= &kind=queue,condition &sinceHours=24 &limit=50
 *   &q=강남            오락실 이름 · 기종 · 메모 부분 일치 (피드 검색창)
 *
 * 커뮤니티의 "지금 저기 어때요?" 를 한 화면에 모은 것입니다. 오락실 상세를
 * 하나씩 열지 않아도 최근 움직임이 보여야 제보를 남길 이유가 생깁니다.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = parseReportQuery(searchParams);

  const [reports, settings] = await Promise.all([listReports(params), getReportSettings()]);
  return NextResponse.json({ reports, settings });
}
