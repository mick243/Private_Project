import { NextResponse } from 'next/server';
import { listGames } from '@/lib/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/games — 서열표가 있는 게임(= tier_settings 가 등록된 기종) + 모드 목록 */
export async function GET() {
  return NextResponse.json({ games: await listGames() });
}
