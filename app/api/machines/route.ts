import { NextResponse } from 'next/server';
import { listMachines } from '@/lib/arcades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/machines — 기종 마스터 목록 (필터/등록 폼용) */
export async function GET() {
  const machines = await listMachines();
  return NextResponse.json({ machines });
}
