import { NextResponse } from 'next/server';
import { listPlayers } from '@/lib/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/players
 * 프로토타입에는 인증이 없어 "현재 플레이어"를 직접 고릅니다.
 * 실제로는 카카오 OAuth 세션이 이 자리를 대신합니다.
 */
export async function GET() {
  return NextResponse.json({ players: await listPlayers() });
}
