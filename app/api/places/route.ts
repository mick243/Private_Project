import { NextResponse } from 'next/server';
import { NaverLocalError, searchLocal } from '@/lib/naver-local';
import { isPlaceQuery, pickPlace } from '@/lib/place-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/places?q=강남역 — 대충 친 지역 이름을 좌표 하나로.
 *
 * 검색창에서 "그 지역으로 지도 이동" 을 눌렀을 때만 불립니다. 타이핑마다
 * 부르지 않는 이유: 네이버 지역 검색은 일일 호출 한도가 있고(우리가 오락실
 * 수집에도 같은 키를 씁니다), 부분 입력("강남ㅇ")으로 지도가 튀는 것은
 * 검색을 돕는 게 아니라 방해입니다.
 *
 * 키를 서버에만 두려고 라우트로 감쌉니다 — searchLocal 의 자격증명은
 * NAVER_HUB_API_KEY_* 환경변수라 클라이언트에서 직접 부를 수 없습니다.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (!isPlaceQuery(q)) {
    return NextResponse.json({ error: '검색어는 2~60자여야 합니다' }, { status: 400 });
  }

  try {
    const items = await searchLocal(q.trim(), { display: 5 });
    return NextResponse.json({ place: pickPlace(items) });
  } catch (err) {
    if (err instanceof NaverLocalError && err.status === 0) {
      // 자격증명 미설정 — 배포 환경 문제지 사용자의 검색어 문제가 아닙니다.
      return NextResponse.json({ error: '지역 검색이 설정되지 않았습니다' }, { status: 503 });
    }
    console.error('[places] 지역 검색 실패', err);
    return NextResponse.json({ error: '지역 검색에 실패했습니다' }, { status: 502 });
  }
}
