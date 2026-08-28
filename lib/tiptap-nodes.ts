import { Node, mergeAttributes } from '@tiptap/core';
import { youtubeEmbedUrl } from './rich-text';

/**
 * 편집기 전용 커스텀 노드 — 첨부 사진 · 첨부 동영상 · 유튜브 영상.
 *
 * Tiptap 기본 Image 확장을 쓰지 않는 이유: 그건 `src` 를 문서에 저장합니다.
 * 우리 문서에는 **id 만** 들어가고 주소는 코드가 만듭니다 (`/api/uploads/:id`).
 * 그래야 남의 파일을 본문에 끌어오거나, 문서에 임의 URL 을 심을 수 없습니다
 * (lib/rich-text.ts · lib/board-content.ts 의 같은 판단).
 *
 * 유튜브는 우리 서버에 파일이 없으므로 첨부가 아니라 **영상 id** 를 듭니다.
 * 그래서 노드가 둘로 갈립니다: `postVideo`(업로드한 mp4·mov) / `youtube`(링크).
 *
 * 노드뷰(React)를 쓰지 않고 renderHTML 로만 그립니다 — 편집 중 보이는 모양이
 * 저장 후 화면(components/RichText.tsx)과 같아야 하고, 그 이상 상호작용이
 * 필요하지 않습니다 (드래그는 ProseMirror 가 알아서 합니다).
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    postImage: {
      /** 커서 위치에 첨부 사진을 넣는다 */
      setPostImage: (attachmentId: number) => ReturnType;
    };
    postVideo: {
      /** 커서 위치에 첨부 동영상을 넣는다 */
      setPostVideo: (attachmentId: number) => ReturnType;
    };
    youtube: {
      /** 커서 위치에 유튜브 영상을 넣는다 (id 는 검증된 11자) */
      setYoutube: (videoId: string) => ReturnType;
    };
  }
}

/** 첨부 id 하나만 갖는 속성 정의 — 사진·동영상이 같은 모양을 쓴다 */
const attachmentAttribute = () => ({
  attachmentId: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      Number(element.getAttribute('data-attachment-id')) || null,
    renderHTML: (attributes: Record<string, unknown>) => ({
      'data-attachment-id': String(attributes.attachmentId),
    }),
  },
});

/**
 * 첨부 노드 뒤에는 빈 문단을 함께 넣습니다.
 *
 * 이미지·영상이 문서의 마지막 블록이면 그 아래에 커서를 놓을 자리가 없어서,
 * 사용자가 "다음 줄에 글을 쓸 수" 없게 됩니다.
 */
const insertBlock = (type: string, attrs: Record<string, unknown>) => [
  { type, attrs },
  { type: 'paragraph' },
];

export const PostImage = Node.create({
  name: 'postImage',
  group: 'block',
  // atom — 내용이 없는 한 덩어리. 커서가 안으로 들어가지 않는다.
  atom: true,
  draggable: true,

  addAttributes: attachmentAttribute,

  parseHTML() {
    return [{ tag: 'img[data-attachment-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: `/api/uploads/${Number(node.attrs.attachmentId)}`,
        alt: '첨부 사진',
        class: 'rt-image',
      }),
    ];
  },

  addCommands() {
    return {
      setPostImage:
        (attachmentId) =>
        ({ commands }) =>
          commands.insertContent(insertBlock(this.name, { attachmentId })),
    };
  },
});

export const PostVideo = Node.create({
  name: 'postVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes: attachmentAttribute,

  parseHTML() {
    return [{ tag: 'video[data-attachment-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        src: `/api/uploads/${Number(node.attrs.attachmentId)}`,
        class: 'rt-video',
        controls: 'true',
        // 편집 중에는 첫 화면만 받아 둔다 — 글 쓰는 동안 영상을 통째로
        // 내려받게 만들 이유가 없다.
        preload: 'metadata',
      }),
    ];
  },

  addCommands() {
    return {
      setPostVideo:
        (attachmentId) =>
        ({ commands }) =>
          commands.insertContent(insertBlock(this.name, { attachmentId })),
    };
  },
});

export const Youtube = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-youtube-id'),
        renderHTML: (attributes) => ({ 'data-youtube-id': String(attributes.videoId) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-youtube-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const videoId = String(node.attrs.videoId);
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'post-embed' }),
      ['iframe', { src: youtubeEmbedUrl(videoId), allowfullscreen: 'true' }],
    ];
  },

  addCommands() {
    return {
      setYoutube:
        (videoId) =>
        ({ commands }) =>
          commands.insertContent(insertBlock(this.name, { videoId })),
    };
  },
});
