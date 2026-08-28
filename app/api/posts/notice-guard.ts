import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { isNotice } from '@/lib/board-types';

/**
 * 공지 말머리는 관리자만.
 *
 * 글쓰기(POST)와 수정(PUT) 두 곳이 같은 판정을 봐야 해서 여기 모았습니다 —
 * 한쪽만 막으면 "일반 글로 올린 뒤 말머리만 공지로 고치는" 길이 남습니다.
 *
 * 근거는 요청 본문의 playerId 가 아니라 **세션 쿠키**입니다. playerId 는
 * 클라이언트가 적어 보내는 값이라 그것만 보면 아무나 관리자 번호를 적을 수
 * 있습니다. 화면에서 공지 칩을 감추는 것도 표시일 뿐입니다 (PostForm).
 *
 * 관리자가 로그인한 채로 **남의 이름으로** 공지를 올리는 것도 막습니다. 공지는
 * 작성자 이름이 그대로 공지의 출처가 되므로, 세션 주인과 달라지면 안 됩니다.
 *
 * @returns 막아야 하면 그 응답, 통과면 null
 */
export async function noticeGuard(
  request: Request,
  input: { category: string; playerId: number },
): Promise<NextResponse | null> {
  if (!isNotice(input.category)) return null;

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  if (guard.user.playerId !== input.playerId) {
    return NextResponse.json(
      { error: '공지는 관리자 본인 이름으로만 쓸 수 있습니다' },
      { status: 403 },
    );
  }
  return null;
}
