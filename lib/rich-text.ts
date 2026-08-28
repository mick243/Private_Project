import { imageMarker, parseContent, videoMarker } from './board-content';
import { isVideo, type PostAttachment } from './board-types';

/**
 * 서식 있는 본문의 문서 모델.
 *
 * ─── 왜 HTML 이 아닌가 ───
 * 편집은 Tiptap(ProseMirror)으로 하지만, 저장물은 **JSON 문서 트리**입니다.
 * HTML 을 넣으면 출력마다 sanitizer 를 통과해야 하고, sanitizer 는 그 자체로
 * 계속 구멍이 나는 표면입니다 (lib/board-content.ts 의 같은 판단).
 * JSON 은 렌더러가 React 요소로 바꾸므로 `dangerouslySetInnerHTML` 이 없고,
 * 문서에 없는 노드·속성은 아래 normalizeDoc 이 **통째로 버립니다**.
 *
 * ─── 평문(posts.body)은 그대로 남습니다 ───
 * 문서는 posts.body_doc, 그 **평문 투영본**은 기존 posts.body 에 저장합니다.
 * 목록 미리보기(excerpt)·본문 검색(ILIKE)·챗봇(lib/chat-tools.ts)이 손대지 않고
 * 그대로 돌고, body_doc 이 없는 옛 글도 지금처럼 읽힙니다.
 * 첨부가 어디 붙는지의 근거도 여전히 평문의 마커입니다 — 사진 `[[image:N]]`,
 * 동영상 `[[video:N]]` (lib/board.ts syncAttachments). 저장 형식이 둘로 갈려도
 * 근거는 하나입니다.
 *
 * ─── 값은 자유가 아니라 닫힌 집합입니다 ───
 * 색·크기·서체는 사용자가 임의 CSS 를 넣는 게 아니라 아래 목록 중 하나입니다.
 * 이유가 둘입니다: (1) 임의 값이면 style 문자열이 사실상 자유 입력이 되고,
 * (2) 어두운 배경에 검정 글씨처럼 **읽을 수 없는 글**을 쓸 수 있습니다.
 * 목록은 지금의 어두운 테마(app/globals.css)에 맞춰 고른 값입니다 — 밝은 테마를
 * 붙이는 날에는 이 목록을 다시 골라야 합니다.
 */

// ─── 고를 수 있는 값 ─────────────────────────────────────────

export interface Choice {
  value: string;
  label: string;
}

/** 글자색. '기본' 은 항목이 아니라 mark 를 떼는 것(unsetColor)입니다 */
export const TEXT_COLORS: readonly Choice[] = [
  { value: '#f2555a', label: '빨강' },
  { value: '#f2913d', label: '주황' },
  { value: '#e2b93b', label: '노랑' },
  { value: '#22d3a6', label: '초록' },
  { value: '#4ea8ff', label: '파랑' },
  { value: '#6d5efc', label: '보라' },
  { value: '#ff7ab6', label: '분홍' },
  { value: '#8b93a7', label: '회색' },
];

/** 배경색(형광펜). 글자가 묻히지 않게 같은 색상의 20% 투명도만 씁니다 */
export const BG_COLORS: readonly Choice[] = [
  { value: '#f2555a33', label: '빨강' },
  { value: '#f2913d33', label: '주황' },
  { value: '#e2b93b33', label: '노랑' },
  { value: '#22d3a633', label: '초록' },
  { value: '#4ea8ff33', label: '파랑' },
  { value: '#6d5efc33', label: '보라' },
  { value: '#ff7ab633', label: '분홍' },
  { value: '#8b93a733', label: '회색' },
];

/** 글자 크기. 본문 기본은 .post-body 의 13.5px 이고, '보통' 은 그것보다 한 눈금 큽니다 */
export const FONT_SIZES: readonly Choice[] = [
  { value: '13px', label: '13' },
  { value: '15px', label: '15' },
  { value: '19px', label: '19' },
  { value: '24px', label: '24' },
];

/**
 * 서체.
 *
 * 웹폰트를 싣지 않습니다 — 지정한 이름이 없는 기기에서는 기본 폰트로 보여서
 * 쓴 사람만 다르게 보게 됩니다. 그래서 어느 OS 에나 있는 계열만 둡니다.
 */
export const FONT_FAMILIES: readonly Choice[] = [
  { value: 'inherit', label: '기본서체' },
  { value: "'Nanum Myeongjo', Batang, serif", label: '명조' },
  { value: "ui-monospace, SFMono-Regular, Consolas, monospace", label: '고정폭' },
];

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/**
 * 문단 스타일의 제목 단계.
 *
 * 본문 안에서 h1 을 쓰지 않습니다 — 글 제목이 이미 h1 이라 문서에 h1 이 둘이
 * 되면 화면 낭독기의 개요가 어긋납니다. 렌더러가 level+1 (h2·h3·h4)로 그립니다.
 */
export const HEADING_LEVELS = [1, 2, 3] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

const values = (list: readonly Choice[]) => new Set(list.map((c) => c.value));
const COLOR_VALUES = values(TEXT_COLORS);
const BG_VALUES = values(BG_COLORS);
const SIZE_VALUES = values(FONT_SIZES);
const FAMILY_VALUES = values(FONT_FAMILIES);

// ─── 문서 모델 ───────────────────────────────────────────────

export interface TextStyleAttrs {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
}

export type RichMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { type: 'link'; attrs: { href: string } }
  | { type: 'textStyle'; attrs: TextStyleAttrs };

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
}

export interface RichDoc {
  type: 'doc';
  content: RichNode[];
}

/**
 * 문서가 커지는 것을 막는 상한.
 *
 * 글자 수는 평문 투영본(posts.body, 20,000자)이 이미 제한합니다. 여기서 막는
 * 것은 **글자 없이 구조만 부풀린 문서**입니다 — 빈 표 수천 개나 수백 겹 중첩은
 * 글자 수 제한을 통과하면서 렌더러를 재귀로 태웁니다.
 */
const MAX_NODES = 2000;
const MAX_DEPTH = 12;
/** 링크 주소 길이. data: URL 같은 걸 막는 것은 아래 safeHref 가 합니다 */
const MAX_HREF = 2000;

// ─── 정규화(=검증) ───────────────────────────────────────────

/** 블록 노드 — 문서·인용구·목록항목·표칸의 자식으로 올 수 있는 것 */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'table',
  'postImage',
  'postVideo',
  'youtube',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * 링크 주소.
 *
 * `http`/`https` 만 통과시킵니다. `javascript:` 는 클릭 한 번에 스크립트가 되고,
 * `data:`·`blob:` 은 우리 도메인에서 임의 페이지를 띄우는 길입니다.
 * 상대 경로도 막습니다 — 본문에서 앱 안쪽으로 보내는 링크는 필요가 없고,
 * 허용하면 `/api/...` 를 클릭 한 번에 호출하게 만드는 글이 가능합니다.
 */
export function safeHref(raw: unknown): string | null {
  const href = str(raw)?.trim();
  if (!href || href.length > MAX_HREF) return null;
  return /^https?:\/\/[^\s]+$/i.test(href) ? href : null;
}

/** 유튜브 영상 id — 11자 고정. 이것만 저장하고 주소는 렌더러가 만든다 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * 유튜브 주소에서 영상 id 만 뽑습니다.
 *
 * 주소를 그대로 저장하지 않는 이유: iframe 의 src 가 사용자 입력이 되는 순간
 * "우리 페이지 안에 남의 페이지" 를 띄울 수 있게 됩니다. id 만 저장하면 src 는
 * 항상 우리가 만든 문자열입니다.
 */
export function youtubeId(raw: string): string | null {
  const url = raw.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = re.exec(url);
    if (m) return m[1];
  }
  return YOUTUBE_ID.test(url) ? url : null;
}

export function youtubeEmbedUrl(videoId: string): string {
  // nocookie 도메인 — 본문에 영상 하나 넣었다고 추적 쿠키가 깔리지 않게.
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function normalizeMarks(input: unknown): RichMark[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: RichMark[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const type = str(raw.type);
    if (!type) continue;

    if (type === 'bold' || type === 'italic' || type === 'underline' || type === 'strike' || type === 'code') {
      if (!out.some((m) => m.type === type)) out.push({ type });
      continue;
    }

    if (type === 'link') {
      const href = safeHref(isRecord(raw.attrs) ? raw.attrs.href : null);
      if (href) out.push({ type: 'link', attrs: { href } });
      continue;
    }

    if (type === 'textStyle') {
      const attrs = isRecord(raw.attrs) ? raw.attrs : {};
      const kept: TextStyleAttrs = {};
      const color = str(attrs.color);
      const background = str(attrs.backgroundColor);
      const size = str(attrs.fontSize);
      const family = str(attrs.fontFamily);
      if (color && COLOR_VALUES.has(color)) kept.color = color;
      if (background && BG_VALUES.has(background)) kept.backgroundColor = background;
      if (size && SIZE_VALUES.has(size)) kept.fontSize = size;
      if (family && FAMILY_VALUES.has(family)) kept.fontFamily = family;
      // 통째로 버린다 — 남은 속성이 없는 textStyle 은 <span> 만 남기는 잡음이다.
      if (Object.keys(kept).length > 0) out.push({ type: 'textStyle', attrs: kept });
      continue;
    }
    // 그 밖의 mark(하이라이트·구독 전용 확장 등)는 조용히 버린다.
  }

  return out.length > 0 ? out : undefined;
}

interface Budget {
  nodes: number;
}

function normalizeInline(input: unknown, budget: Budget): RichNode[] {
  if (!Array.isArray(input)) return [];
  const out: RichNode[] = [];

  for (const raw of input) {
    if (budget.nodes <= 0) break;
    if (!isRecord(raw)) continue;
    const type = str(raw.type);

    if (type === 'text') {
      const text = str(raw.text);
      if (!text) continue;
      budget.nodes -= 1;
      const marks = normalizeMarks(raw.marks);
      out.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
      continue;
    }
    if (type === 'hardBreak') {
      budget.nodes -= 1;
      out.push({ type: 'hardBreak' });
    }
    // 인라인 자리에 온 블록은 버린다 (편집기가 만들 수 없는 모양).
  }

  return out;
}

function normalizeBlocks(input: unknown, budget: Budget, depth: number): RichNode[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];

  for (const raw of input) {
    if (budget.nodes <= 0) break;
    if (!isRecord(raw)) continue;
    const type = str(raw.type);
    if (!type || !BLOCK_TYPES.has(type)) continue;

    const attrs = isRecord(raw.attrs) ? raw.attrs : {};
    budget.nodes -= 1;

    switch (type) {
      case 'paragraph': {
        const node: RichNode = { type, content: normalizeInline(raw.content, budget) };
        const align = alignOf(attrs);
        if (align) node.attrs = { textAlign: align };
        out.push(node);
        break;
      }
      case 'heading': {
        const level = int(attrs.level, 1, 3) ?? 1;
        const node: RichNode = {
          type,
          attrs: { level },
          content: normalizeInline(raw.content, budget),
        };
        const align = alignOf(attrs);
        if (align) node.attrs = { level, textAlign: align };
        out.push(node);
        break;
      }
      case 'horizontalRule':
        out.push({ type });
        break;
      case 'blockquote':
        out.push({ type, content: normalizeBlocks(raw.content, budget, depth + 1) });
        break;
      case 'bulletList':
      case 'orderedList':
        out.push({ type, content: normalizeListItems(raw.content, budget, depth + 1) });
        break;
      case 'table':
        out.push({ type, content: normalizeRows(raw.content, budget, depth + 1) });
        break;
      case 'postImage':
      case 'postVideo': {
        // 첨부는 id 만 저장한다 — 주소는 코드가 만든다 (lib/tiptap-nodes.ts 주석 참고)
        const attachmentId = int(attrs.attachmentId, 1, Number.MAX_SAFE_INTEGER);
        if (attachmentId) out.push({ type, attrs: { attachmentId } });
        break;
      }
      case 'youtube': {
        const videoId = str(attrs.videoId);
        if (videoId && YOUTUBE_ID.test(videoId)) out.push({ type, attrs: { videoId } });
        break;
      }
    }
  }

  return out;
}

function alignOf(attrs: Record<string, unknown>): TextAlign | null {
  const align = str(attrs.textAlign);
  // 'left' 는 기본값이라 저장하지 않는다 — 저장하면 모든 문단에 붙어 문서가 커진다.
  return align && align !== 'left' && (TEXT_ALIGNS as readonly string[]).includes(align)
    ? (align as TextAlign)
    : null;
}

function normalizeListItems(input: unknown, budget: Budget, depth: number): RichNode[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];
  for (const raw of input) {
    if (budget.nodes <= 0) break;
    if (!isRecord(raw) || str(raw.type) !== 'listItem') continue;
    budget.nodes -= 1;
    out.push({ type: 'listItem', content: normalizeBlocks(raw.content, budget, depth + 1) });
  }
  return out;
}

function normalizeRows(input: unknown, budget: Budget, depth: number): RichNode[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];
  for (const raw of input) {
    if (budget.nodes <= 0) break;
    if (!isRecord(raw) || str(raw.type) !== 'tableRow') continue;
    budget.nodes -= 1;
    out.push({ type: 'tableRow', content: normalizeCells(raw.content, budget, depth + 1) });
  }
  return out;
}

function normalizeCells(input: unknown, budget: Budget, depth: number): RichNode[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];
  for (const raw of input) {
    if (budget.nodes <= 0) break;
    if (!isRecord(raw)) continue;
    const type = str(raw.type);
    if (type !== 'tableCell' && type !== 'tableHeader') continue;

    const attrs = isRecord(raw.attrs) ? raw.attrs : {};
    const cell: RichNode = {
      type,
      content: normalizeBlocks(raw.content, budget, depth + 1),
    };
    const colspan = int(attrs.colspan, 1, 20);
    const rowspan = int(attrs.rowspan, 1, 20);
    const keep: Record<string, unknown> = {};
    if (colspan && colspan > 1) keep.colspan = colspan;
    if (rowspan && rowspan > 1) keep.rowspan = rowspan;
    if (Object.keys(keep).length > 0) cell.attrs = keep;

    budget.nodes -= 1;
    out.push(cell);
  }
  return out;
}

/** 글자도 이미지도 영상도 없는 문서 — 저장할 이유가 없다 */
function isEmptyDoc(doc: RichDoc): boolean {
  let empty = true;
  const walk = (nodes: RichNode[]) => {
    for (const n of nodes) {
      if (!empty) return;
      if (
        n.type === 'postImage' ||
        n.type === 'postVideo' ||
        n.type === 'youtube' ||
        n.type === 'horizontalRule'
      ) {
        empty = false;
        return;
      }
      if (n.type === 'text' && (n.text ?? '').trim()) {
        empty = false;
        return;
      }
      if (n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return empty;
}

/**
 * 알 수 없는 것을 전부 버리고 **우리 스키마 안의 문서**만 남깁니다.
 *
 * 이 함수를 통과한 문서만 저장·렌더에 씁니다. 편집기(클라이언트)가 보낸 값을
 * 그대로 믿지 않는다는 뜻입니다 — 화면을 우회해 API 를 직접 부를 수 있으니까요.
 *
 * @returns 남은 게 없으면 null (그 글은 평문만 있는 글로 다룬다)
 */
export function normalizeDoc(input: unknown): RichDoc | null {
  const raw = typeof input === 'string' ? safeParse(input) : input;
  if (!isRecord(raw) || raw.type !== 'doc') return null;

  const budget: Budget = { nodes: MAX_NODES };
  const content = normalizeBlocks(raw.content, budget, 0);
  if (content.length === 0) return null;

  const doc: RichDoc = { type: 'doc', content };
  return isEmptyDoc(doc) ? null : doc;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── 평문 투영 ───────────────────────────────────────────────

/**
 * 문서 → posts.body 에 저장할 평문.
 *
 * 이 문자열이 검색·미리보기·이미지 연결(`[[image:N]]`)의 근거이므로, 서버는
 * 클라이언트가 보낸 평문을 쓰지 않고 **문서에서 다시 만듭니다**
 * (lib/validation.ts postInputSchema) — 둘이 어긋날 여지를 없앱니다.
 */
export function toPlainText(doc: RichDoc): string {
  const lines: string[] = [];

  const inline = (nodes: RichNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? '')))
      .join('');

  const block = (nodes: RichNode[], indent: string) => {
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph':
        case 'heading':
          lines.push(indent + inline(n.content));
          break;
        case 'horizontalRule':
          lines.push('');
          break;
        case 'blockquote':
          block(n.content ?? [], `${indent}> `);
          break;
        case 'bulletList':
        case 'orderedList':
          (n.content ?? []).forEach((item, i) => {
            const bullet = n.type === 'bulletList' ? '· ' : `${i + 1}. `;
            const before = lines.length;
            block(item.content ?? [], indent);
            // 첫 줄에만 글머리를 붙인다 (항목 안에 문단이 여럿일 수 있다).
            if (lines.length > before) lines[before] = indent + bullet + lines[before].slice(indent.length);
          });
          break;
        case 'table':
          for (const row of n.content ?? []) {
            const cells = (row.content ?? []).map((cell) => {
              const buf: string[] = [];
              const cellLines = lines.length;
              block(cell.content ?? [], '');
              buf.push(...lines.splice(cellLines).filter((l) => l !== ''));
              return buf.join(' ');
            });
            lines.push(indent + cells.join('\t'));
          }
          break;
        case 'postImage':
          lines.push(imageMarker(Number(n.attrs?.attachmentId)));
          break;
        case 'postVideo':
          lines.push(videoMarker(Number(n.attrs?.attachmentId)));
          break;
        case 'youtube':
          // 주소를 남긴다 — 영상만 있는 글도 본문이 비지 않고 검색에도 걸린다.
          lines.push(`https://youtu.be/${String(n.attrs?.videoId)}`);
          break;
      }
    }
  };

  block(doc.content, '');
  // 문단 사이 빈 줄은 살리되, 끝의 빈 줄은 정리한다.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * posts.body(평문 + 마커) → 편집기에 넣을 문서.
 *
 * body_doc 이 없는 옛 글을 수정할 때 씁니다. 줄바꿈은 문단으로, 이미지 마커는
 * postImage 블록으로 바뀝니다 — 첨부가 아닌 마커는 이미지가 되지 않고 글자로
 * 남습니다 (parseContent 의 규칙과 같습니다).
 */
export function fromPlainText(body: string, attachments: PostAttachment[]): RichDoc {
  const content: RichNode[] = [];

  for (const seg of parseContent(body, attachments)) {
    if (seg.kind === 'file') {
      content.push({
        type: isVideo(seg.file.mime) ? 'postVideo' : 'postImage',
        attrs: { attachmentId: seg.file.id },
      });
      continue;
    }
    for (const line of seg.text.split('\n')) {
      // 마커 앞뒤에 남은 빈 줄은 문단을 하나 더 만들 뿐이라 버린다.
      if (line === '' && content.length > 0) continue;
      content.push(
        line === ''
          ? { type: 'paragraph', content: [] }
          : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      );
    }
  }

  if (content.length === 0) content.push({ type: 'paragraph', content: [] });
  return { type: 'doc', content };
}
