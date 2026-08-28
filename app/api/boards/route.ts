import { NextResponse } from 'next/server';
import { listBoards, listCategories } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/boards — 게임 탭 목록 + 말머리 목록
 *
 * 글이 0건인 게임도 함께 돌려줍니다. 글이 있는 게임만 보여주면 새 게임에
 * 첫 글을 쓸 방법이 없어집니다.
 */
export async function GET() {
  const [boards, categories] = await Promise.all([listBoards(), listCategories()]);
  return NextResponse.json({ boards, categories });
}
