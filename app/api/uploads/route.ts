import { NextResponse } from 'next/server';
import { createAttachment } from '@/lib/board';
import {
  MAX_UPLOAD_BYTES,
  save,
  UnsupportedUploadError,
  UploadTooLargeError,
} from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/uploads — 첨부 1개 업로드 (multipart: `file`, `playerId`)
 *
 * 사진과 동영상이 같은 라우트를 씁니다. 종류는 클라이언트가 말하는 것이 아니라
 * 매직 바이트로 판정하므로(lib/uploads.ts detect), 나눠 둘 이유가 없습니다 —
 * 응답의 `mime` 을 보고 화면이 사진/동영상 노드를 고릅니다.
 *
 * 글보다 먼저 올라갑니다. 작성 중에 업로드해 미리보기를 띄우고, 글을 저장할 때
 * 본문의 마커(`[[image:N]]` · `[[video:N]]`)가 그 글에 붙일 첨부를 가리킵니다
 * (lib/board.ts syncAttachments).
 * 저장하지 않고 나가면 post_id 가 NULL 인 채로 남습니다 — 청소 배치는 아직 없습니다.
 *
 * `image` 필드명도 아직 받습니다 — 예전 화면이 그 이름으로 보냈습니다.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '업로드 본문을 읽을 수 없습니다' }, { status: 400 });
  }

  const file = form.get('file') ?? form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file 이 필요합니다' }, { status: 400 });
  }

  const rawPlayer = Number(form.get('playerId'));
  if (!Number.isInteger(rawPlayer) || rawPlayer <= 0) {
    return NextResponse.json({ error: 'playerId 가 필요합니다' }, { status: 400 });
  }

  // 본문을 버퍼로 올리기 전에 신고된 크기부터 거른다 — 제한이 50MB 인데 500MB 를
  // 메모리에 다 읽고 나서 거절하면 제한이 방어 역할을 못 한다.
  // 여기서는 가장 느슨한 상한(동영상)만 보고, 형식별 상한은 save() 가 본다.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: new UploadTooLargeError().message }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const saved = await save(buffer);
    const attachment = await createAttachment({ playerId: rawPlayer, ...saved });
    // `image` 로도 함께 내보냅니다 — 응답 모양을 갑자기 좁히지 않기 위한 별칭입니다.
    return NextResponse.json({ file: attachment, image: attachment }, { status: 201 });
  } catch (err) {
    // 형식·크기 위반은 사용자 입력 문제이므로 4xx 로 돌려준다.
    if (err instanceof UnsupportedUploadError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
}
