'use client';

import { attachmentIdsInBody, parseContent } from '@/lib/board-content';
import { isVideo, type PostAttachment } from '@/lib/board-types';
import type { RichDoc } from '@/lib/rich-text';
import { PostImage, PostVideo } from './PostMedia';
import RichText from './RichText';

interface Props {
  body: string;
  /** 서식 있는 본문. null 이면 평문 경로로 그린다 (아래 주석 참고) */
  bodyDoc: RichDoc | null;
  attachments: PostAttachment[];
}

/**
 * 본문 렌더러 — 마커 위치에 이미지를 끼워 넣습니다.
 *
 * 텍스트는 React 가 텍스트 노드로 넣으므로 HTML 로 해석되지 않습니다.
 * `white-space: pre-wrap` 이 줄바꿈을 살립니다 (마크다운은 해석하지 않습니다).
 */
export default function PostBody({ body, bodyDoc, attachments }: Props) {
  /**
   * 서식 있는 글은 문서를 그립니다. body_doc 이 없는 글(= 서식 기능이 붙기 전에
   * 쓰인 글)은 예전 그대로 평문 + 마커로 그립니다 — 과거 글을 변환하지 않아도
   * 되고, 변환 실패로 글이 깨질 일도 없습니다.
   *
   * pre-wrap 을 쓰지 않는 이유(post-rich): 문서 쪽은 줄바꿈이 문단 요소로
   * 표현되므로, 공백을 그대로 살리면 태그 사이 여백까지 눈에 보입니다.
   */
  if (bodyDoc) {
    return (
      <div className="post-body post-rich">
        <RichText doc={bodyDoc} attachments={attachments} />
      </div>
    );
  }

  const segments = parseContent(body, attachments);

  // 본문에 마커가 없는데 첨부는 있는 글 — 인라인 배치 이전에 쓰인 글이거나,
  // 본문에서 이미지를 지웠지만 아직 저장되지 않은 상태. 뒤에 붙여서 보여준다.
  // (보이지 않으면 사용자는 이미지가 사라진 줄 안다.)
  const referenced = new Set(attachmentIdsInBody(body));
  const trailing = attachments.filter((a) => !referenced.has(a.id));

  return (
    <div className="post-body">
      {segments.map((seg, i) =>
        seg.kind === 'file' ? (
          <Attachment key={`file-${seg.file.id}-${i}`} file={seg.file} />
        ) : (
          <span key={`txt-${i}`}>{seg.text}</span>
        ),
      )}

      {trailing.map((file) => (
        <Attachment key={`tail-${file.id}`} file={file} />
      ))}
    </div>
  );
}

/** 첨부 하나 — 사진이면 <img>, 동영상이면 <video> (판단 근거는 mime 뿐).
 *  지연 로딩 규칙은 PostMedia 에 있다 — 서식 경로(RichText)와 같은 것을 쓴다. */
function Attachment({ file }: { file: PostAttachment }) {
  if (isVideo(file.mime)) return <PostVideo src={file.url} />;
  return <PostImage src={file.url} />;
}
