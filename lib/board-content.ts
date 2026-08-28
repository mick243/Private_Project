import { isVideo, type PostAttachment } from './board-types';

/**
 * 본문 안 첨부 위치를 나타내는 표기와 그 파싱 규칙.
 *
 * ─── 왜 평문에 마커를 두는가 ───
 * 서식 있는 글의 저장물은 JSON 문서(lib/rich-text.ts)지만, 그 **평문 투영본**이
 * 여전히 posts.body 에 들어갑니다. 목록 미리보기·검색이 그 값을 보고, 무엇보다
 * "이 글에 어떤 첨부가 붙는가" 의 근거가 이 마커입니다 (lib/board.ts syncAttachments).
 * 그래서 첨부 종류마다 마커가 하나씩 있습니다:
 *   `[[image:12]]` 사진 · `[[video:12]]` 동영상
 *
 * ─── 마커를 사용자가 직접 타이핑하면? ───
 * 손으로 쳐도, 그 글에 실제로 붙어 있는 첨부가 아니면 렌더러가 **그냥 텍스트로**
 * 보여줍니다 (parseContent 의 조회 실패). 남의 파일을 본문에 끌어오는 것도 그래서
 * 불가능합니다.
 */

/** 예: `[[image:12]]` */
export const IMAGE_MARKER = /\[\[image:(\d+)\]\]/g;
/** 예: `[[video:12]]` */
export const VIDEO_MARKER = /\[\[video:(\d+)\]\]/g;
/** 사진·동영상 어느 쪽이든 (1: 종류, 2: id) */
export const ATTACHMENT_MARKER = /\[\[(image|video):(\d+)\]\]/g;

export function imageMarker(attachmentId: number): string {
  return `[[image:${attachmentId}]]`;
}

export function videoMarker(attachmentId: number): string {
  return `[[video:${attachmentId}]]`;
}

/** 첨부의 종류에 맞는 마커 */
export function attachmentMarker(attachment: PostAttachment): string {
  return isVideo(attachment.mime) ? videoMarker(attachment.id) : imageMarker(attachment.id);
}

/** 본문에 등장한 순서대로 첨부 id 목록 (사진·동영상 함께, 중복 제거) */
export function attachmentIdsInBody(body: string): number[] {
  const ids: number[] = [];
  for (const match of body.matchAll(ATTACHMENT_MARKER)) {
    const id = Number(match[2]);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export type ContentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'file'; file: PostAttachment };

/**
 * 본문을 텍스트/첨부 조각으로 쪼갭니다.
 *
 * `attachments` 에 없는 id 의 마커는 첨부가 아니라 **원문 텍스트 그대로** 남습니다 —
 * 첨부가 아닌 것을 그려 주면 남의 파일을 본문에 끌어올 수 있습니다.
 *
 * 마커의 종류(image/video)와 실제 mime 이 다르면 **mime 을 따릅니다** — 그리는 쪽이
 * 사실이어야 합니다 (mov 를 `[[image:…]]` 로 적어도 동영상으로 나옵니다).
 */
export function parseContent(body: string, attachments: PostAttachment[]): ContentSegment[] {
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const segments: ContentSegment[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    // 마커가 첨부로 인정되지 않으면 앞 텍스트와 이어 붙는다.
    if (last?.kind === 'text') last.text += text;
    else segments.push({ kind: 'text', text });
  };

  for (const match of body.matchAll(ATTACHMENT_MARKER)) {
    const at = match.index ?? 0;
    const file = byId.get(Number(match[2]));

    pushText(body.slice(cursor, at));
    if (file) segments.push({ kind: 'file', file });
    else pushText(match[0]); // 첨부가 아닌 마커 → 텍스트
    cursor = at + match[0].length;
  }
  pushText(body.slice(cursor));

  return segments;
}

/** 목록 미리보기·검증용 — 마커를 걷어낸 순수 텍스트 */
export function stripMarkers(body: string): string {
  return body.replace(ATTACHMENT_MARKER, ' ');
}
