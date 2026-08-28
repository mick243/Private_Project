import type { CSSProperties, ReactNode } from 'react';
import { isVideo, type PostAttachment } from '@/lib/board-types';
import { PostImage, PostVideo } from './PostMedia';
import {
  youtubeEmbedUrl,
  type RichDoc,
  type RichMark,
  type RichNode,
  type TextStyleAttrs,
} from '@/lib/rich-text';

/**
 * 서식 있는 본문 렌더러 — 문서 트리를 React 요소로 그립니다.
 *
 * `dangerouslySetInnerHTML` 이 한 군데도 없습니다. 글자는 텍스트 노드로 들어가고,
 * 태그는 이 파일에 적힌 것만 나오며, style 에 들어가는 값은 저장 전에 닫힌 집합으로
 * 걸러진 것뿐입니다 (lib/rich-text.ts normalizeDoc). 그래서 출력 단계에 sanitizer 가
 * 없어도 됩니다 — 스키마에 없는 것은 애초에 여기까지 오지 않습니다.
 *
 * 모르는 노드 타입은 **그리지 않고 넘깁니다**. 나중에 노드를 추가했다가 되돌리는
 * 경우, 옛 글이 오류 화면이 되는 대신 그 부분만 비어 보입니다.
 */

interface Props {
  doc: RichDoc;
  /**
   * 이 글에 실제로 붙어 있는 첨부(사진·동영상).
   *
   * 문서의 `postImage`·`postVideo` 는 id 만 들고 있고, 주소는 여기서 찾습니다 —
   * 목록에 없는 id 는 그리지 않습니다. 남의 글 첨부 id 를 문서에 적어 끌어오는 것을
   * 막는 규칙이고, 평문 경로(lib/board-content.ts parseContent)와 같은 판단입니다.
   */
  attachments: PostAttachment[];
}

export default function RichText({ doc, attachments }: Props) {
  const byId = new Map(attachments.map((a) => [a.id, a]));
  return <>{blocks(doc.content, byId)}</>;
}

type AttachmentMap = Map<number, PostAttachment>;

function blocks(nodes: RichNode[] | undefined, images: AttachmentMap): ReactNode {
  return (nodes ?? []).map((node, i) => block(node, i, images));
}

function block(node: RichNode, key: number, images: AttachmentMap): ReactNode {
  const align = node.attrs?.textAlign as string | undefined;
  const style: CSSProperties | undefined = align ? { textAlign: align as 'center' } : undefined;

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} style={style}>
          {/* 빈 문단은 높이가 0이 되어 사용자가 넣은 빈 줄이 사라진다 */}
          {node.content?.length ? inlines(node.content) : <br />}
        </p>
      );

    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      // 문서 안에서 h1 을 쓰지 않는 이유는 lib/rich-text.ts HEADING_LEVELS 참고
      const Tag = (['h2', 'h3', 'h4'][level - 1] ?? 'h4') as 'h2' | 'h3' | 'h4';
      return (
        <Tag key={key} style={style}>
          {inlines(node.content)}
        </Tag>
      );
    }

    case 'blockquote':
      return <blockquote key={key}>{blocks(node.content, images)}</blockquote>;

    case 'horizontalRule':
      return <hr key={key} />;

    case 'bulletList':
      return <ul key={key}>{blocks(node.content, images)}</ul>;

    case 'orderedList':
      return <ol key={key}>{blocks(node.content, images)}</ol>;

    case 'listItem':
      return <li key={key}>{blocks(node.content, images)}</li>;

    case 'table':
      // 좁은 화면에서 표가 본문을 밀어내지 않도록 표만 따로 가로 스크롤한다.
      return (
        <div key={key} className="post-table-wrap">
          <table>
            <tbody>{blocks(node.content, images)}</tbody>
          </table>
        </div>
      );

    case 'tableRow':
      return <tr key={key}>{blocks(node.content, images)}</tr>;

    case 'tableCell':
    case 'tableHeader': {
      const Cell = node.type === 'tableHeader' ? 'th' : 'td';
      const colSpan = node.attrs?.colspan as number | undefined;
      const rowSpan = node.attrs?.rowspan as number | undefined;
      return (
        <Cell key={key} colSpan={colSpan} rowSpan={rowSpan}>
          {blocks(node.content, images)}
        </Cell>
      );
    }

    case 'postImage':
    case 'postVideo': {
      const file = images.get(Number(node.attrs?.attachmentId));
      if (!file) return null;
      // 노드 종류가 아니라 **실제 mime** 을 따른다 — 그리는 쪽이 사실이어야 한다
      // (lib/board-content.ts parseContent 의 같은 규칙).
      // 지연 로딩 규칙은 PostMedia 에 있다 — 평문 경로(PostBody)와 같은 것을 쓴다.
      if (isVideo(file.mime)) return <PostVideo key={key} src={file.url} />;
      return <PostImage key={key} src={file.url} />;
    }

    case 'youtube': {
      const videoId = String(node.attrs?.videoId ?? '');
      if (!videoId) return null;
      return (
        <div key={key} className="post-embed">
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title="유튜브 영상"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            /*
              임베드 하나가 플레이어 JS·이미지로 1MB 이상을 받는다 — 임베드가
              여러 개인 글에서 화면 밖 것까지 즉시 받을 이유가 없다. iframe 은
              CSS 가 크기를 잡아 주므로(.post-embed 16:9) lazy 가 그대로 동작한다
              (이미지처럼 크기가 무너지는 문제가 없다 — PostMedia 주석).
            */
            loading="lazy"
          />
        </div>
      );
    }

    default:
      return null;
  }
}

function inlines(nodes: RichNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />;
    if (node.type !== 'text') return null;
    return <Inline key={i} text={node.text ?? ''} marks={node.marks} />;
  });
}

function cssOf(attrs: TextStyleAttrs): CSSProperties {
  // 값은 이미 닫힌 집합으로 걸러져 있다 (normalizeDoc). 그래서 그대로 style 에 준다.
  const style: CSSProperties = {};
  if (attrs.color) style.color = attrs.color;
  if (attrs.backgroundColor) style.backgroundColor = attrs.backgroundColor;
  if (attrs.fontSize) style.fontSize = attrs.fontSize;
  if (attrs.fontFamily) style.fontFamily = attrs.fontFamily;
  return style;
}

function Inline({ text, marks = [] }: { text: string; marks?: RichMark[] }) {
  const has = (type: RichMark['type']) => marks.some((m) => m.type === type);
  const textStyle = marks.find((m) => m.type === 'textStyle');
  const link = marks.find((m) => m.type === 'link');

  // 안쪽에서 바깥쪽으로 감싼다. 링크가 가장 바깥이라 클릭 영역이 서식 전체를 덮는다.
  let out: ReactNode = text;
  if (has('code')) out = <code>{out}</code>;
  if (has('bold')) out = <strong>{out}</strong>;
  if (has('italic')) out = <em>{out}</em>;
  if (has('underline')) out = <u>{out}</u>;
  if (has('strike')) out = <s>{out}</s>;
  if (textStyle && textStyle.type === 'textStyle') {
    out = <span style={cssOf(textStyle.attrs)}>{out}</span>;
  }
  if (link && link.type === 'link') {
    out = (
      // 남의 사이트로 나가는 링크 — 새 탭 + noopener(우리 창을 조작하지 못하게)
      <a href={link.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
        {out}
      </a>
    );
  }
  return <>{out}</>;
}
