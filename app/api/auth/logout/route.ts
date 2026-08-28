import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — 세션 쿠키를 지웁니다 */
export async function POST() {
  return clearSessionCookie(NextResponse.json({ user: null }));
}
