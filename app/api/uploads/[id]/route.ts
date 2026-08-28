import { NextResponse } from 'next/server';
import { getAttachment } from '@/lib/board';
import { read } from '@/lib/uploads';

export const runtime = 'nodejs';

/**
 * GET /api/uploads/:id — 첨부 원본 (사진 · 동영상)
 *
 * 업로드 파일은 `public/` 이 아니라 이 라우트로만 나갑니다. 비공개 게시판이나
 * 신고 숨김이 생기면 여기 한 곳에 조건을 넣으면 됩니다.
 *
 * 파일명이 내용 해시라 같은 id 의 내용은 절대 바뀌지 않습니다 → 영구 캐시.
 *
 * ─── 구간 요청(Range) ───
 * 동영상 때문에 필요합니다. `<video>` 는 재생 막대를 끌 때 "이 바이트부터"를
 * 요청하는데, 서버가 언제나 200 으로 전체를 돌려주면 브라우저는 탐색을 포기하거나
 * 매번 처음부터 다시 받습니다. 그래서 206 을 지원합니다.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '잘못된 id 입니다' }, { status: 400 });
  }

  const attachment = await getAttachment(id);
  if (!attachment) {
    return NextResponse.json({ error: '첨부를 찾을 수 없습니다' }, { status: 404 });
  }

  const data = await read(attachment.storageKey);
  if (!data) {
    // DB 행은 있는데 파일이 없는 경우 (수동 삭제 등). 500 이 아니라 404 가 맞다.
    return NextResponse.json({ error: '첨부 파일이 없습니다' }, { status: 404 });
  }

  const base = {
    'Content-Type': attachment.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // 이 헤더가 없으면 브라우저는 구간 요청을 시도하지 않는다.
    'Accept-Ranges': 'bytes',
  };

  const range = parseRange(request.headers.get('range'), data.byteLength);

  if (range === 'invalid') {
    return new NextResponse(null, {
      status: 416,
      headers: { ...base, 'Content-Range': `bytes */${data.byteLength}` },
    });
  }

  if (range) {
    const slice = data.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...base,
        'Content-Range': `bytes ${range.start}-${range.end}/${data.byteLength}`,
        'Content-Length': String(slice.byteLength),
      },
    });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: { ...base, 'Content-Length': String(data.byteLength) },
  });
}

/**
 * `Range: bytes=시작-끝` 한 구간만 해석합니다.
 *
 * 여러 구간(`bytes=0-1,5-6`)은 다루지 않습니다 — multipart/byteranges 응답을
 * 만들어야 하고, `<video>` 는 쓰지 않습니다. 그런 요청은 전체를 돌려줍니다(200).
 *
 * @returns null = 구간 요청이 아님 · 'invalid' = 범위를 벗어남(416)
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return 'invalid';

  // `bytes=-500` = 끝에서 500바이트
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return 'invalid';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}
