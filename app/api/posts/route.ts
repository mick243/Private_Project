import { NextResponse } from 'next/server';
import { createPost, getPost, listPosts } from '@/lib/board';
import { isForeignKeyViolation } from '@/lib/pg-errors';
import { formatIssues, parsePostQuery, postInputSchema } from '@/lib/validation';
import { noticeGuard } from './notice-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/posts — 글 목록
 *   ?machineId=1     게임 탭 (없으면 '전체')
 *   &category=guide  말머리
 *   &sort=recent|popular   (popular 은 추천 5개 이상인 글만 — POPULAR_MIN_LIKES)
 *   &playerId=1      내 추천 여부 표시용
 *   &q=발판          제목·본문 부분 일치 (게시판 검색창)
 *   &limit=20&offset=20
 *
 * 응답의 `notices` 는 게임 탭·말머리·정렬과 무관하게 목록 맨 위에 고정되는
 * 공지입니다 (`posts` 와 겹치지 않습니다 — lib/board.ts listPosts 주석 참고).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await listPosts(parsePostQuery(searchParams));
  return NextResponse.json(result);
}

/** POST /api/posts — 글 작성 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 });
  }

  const parsed = postInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  // 공지 말머리는 관리자만 (세션 쿠키로 판정 — ./notice-guard.ts)
  const denied = await noticeGuard(request, parsed.data);
  if (denied) return denied;

  try {
    const id = await createPost(parsed.data);
    const post = await getPost(id, parsed.data.playerId);
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    // 없는 말머리(board_categories FK) 나 없는 기종/플레이어. 값 검증은 DB 가
    // 하고 있으므로, 위반을 500 이 아니라 400 으로 바꿔 준다.
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(
        { error: '말머리 또는 게임을 다시 확인해 주세요' },
        { status: 400 },
      );
    }
    throw err;
  }
}
