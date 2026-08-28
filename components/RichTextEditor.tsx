'use client';

import { useEffect, useRef, useState } from 'react';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { isVideo, MAX_ATTACHMENTS_PER_POST, type PostAttachment } from '@/lib/board-types';
// 노드는 별칭으로 가져온다 (아래 상수·타입과 이름이 섞이지 않게)
import {
  PostImage as PostImageNode,
  PostVideo as PostVideoNode,
  Youtube as YoutubeNode,
} from '@/lib/tiptap-nodes';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  fromPlainText,
  HEADING_LEVELS,
  normalizeDoc,
  toPlainText,
  TEXT_COLORS,
  BG_COLORS,
  youtubeId,
  type Choice,
  type RichDoc,
} from '@/lib/rich-text';

/**
 * 서식 있는 본문 편집기 — Tiptap(ProseMirror).
 *
 * ─── 왜 직접 만들지 않는가 ───
 * 이전 편집기는 `contenteditable` 을 직접 다뤘습니다(이미지 삽입 하나 때문에).
 * 거기에 선택 영역 서식·되돌리기·한글 조합 중 서식 적용까지 얹으면 브라우저별로
 * 조용히 어긋나는 버그가 길게 남습니다. ProseMirror 는 그 부분이 본업입니다.
 *
 * ─── 저장물은 여전히 HTML 이 아닙니다 ───
 * 부모에게 넘기는 것은 `editor.getJSON()` 을 정규화한 문서와 그 평문 투영본입니다
 * (lib/rich-text.ts). 서버도 같은 정규화를 다시 하므로, 이 화면을 우회한 요청이
 * 스키마 밖의 문서를 넣을 수는 없습니다.
 *
 * ─── React 가 이 노드를 다시 그리지 않습니다 ───
 * `content` 는 mount 시 1회만 반영됩니다. 매 입력마다 문서를 되돌려 주면 캐럿이
 * 튑니다 — 이전 편집기와 같은 이유입니다.
 */

interface Props {
  /** 서식 있는 본문 (수정 모드). null 이면 initialBody 를 문서로 바꿔 시작합니다 */
  initialDoc: RichDoc | null;
  /** body_doc 이 없는 옛 글을 수정할 때의 평문 */
  initialBody: string;
  initialAttachments: PostAttachment[];
  playerId: number | null;
  disabled?: boolean;
  /** 문서와 그 평문 투영본. 부모는 저장·검증에만 쓰고 되돌려 주지 않는다 */
  onChange: (value: { doc: RichDoc | null; text: string }) => void;
}

export default function RichTextEditor({
  initialDoc,
  initialBody,
  initialAttachments,
  playerId,
  disabled,
  onChange,
}: Props) {
  // 사진과 동영상은 고를 수 있는 형식이 달라서 입력 칸을 따로 둔다 (accept).
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 링크·동영상 주소를 받는 한 줄 입력. window.prompt 는 브라우저가 막는 곳이 있다 */
  const [ask, setAsk] = useState<'link' | 'youtube' | null>(null);
  const [askValue, setAskValue] = useState('');

  const editor = useEditor({
    // Next 의 서버 렌더에서 편집기를 만들지 않는다 (hydration 불일치 방지)
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [...HEADING_LEVELS] },
        // 소스코드 블록은 쓰지 않는다 — 툴바에서 뺐고 스키마에도 남기지 않는다
        // (마크다운 입력만으로 만들어지는 길까지 닫는다).
        codeBlock: false,
        link: {
          openOnClick: false,
          // 편집 중 자동 링크는 끈다 — 타이핑 중에 주소가 링크로 굳으면
          // 뒤에 글자를 이어 쓸 때 링크가 같이 늘어난다.
          autolink: false,
          protocols: ['http', 'https'],
        },
      }),
      // 색·배경색·크기·서체 (모두 textStyle mark 의 속성). 행간은 쓰지 않는다.
      TextStyleKit.configure({ lineHeight: false }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      TableKit.configure({ table: { resizable: true } }),
      PostImageNode,
      PostVideoNode,
      YoutubeNode,
    ],
    content: initialDoc ?? fromPlainText(initialBody, initialAttachments),
    editorProps: {
      attributes: { class: 'rt-content' },
      // 사진·동영상 파일 붙여넣기/드롭 → 업로드. 그 밖의 붙여넣기는 Tiptap 이
      // 처리한다 (서식은 스키마에 있는 것만 남고 나머지는 걸러진다).
      handlePaste: (_view, event) => handleFiles(Array.from(event.clipboardData?.files ?? [])),
      handleDrop: (_view, event) => handleFiles(Array.from(event.dataTransfer?.files ?? [])),
    },
    onUpdate: ({ editor: ed }) => emit(ed),
  });

  const emit = (ed: Editor) => {
    const doc = normalizeDoc(ed.getJSON());
    onChange({ doc, text: doc ? toPlainText(doc) : '' });
  };

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // ─── 업로드 ────────────────────────────────────────────────

  /** 문서에 붙어 있는 첨부 수 — 사진과 동영상을 합쳐 센다 */
  const attachmentCount = (ed: Editor): number => {
    let count = 0;
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'postImage' || node.type.name === 'postVideo') count += 1;
    });
    return count;
  };

  const upload = async (files: File[]) => {
    if (!editor || !playerId || files.length === 0) return;

    const room = MAX_ATTACHMENTS_PER_POST - attachmentCount(editor);
    if (room <= 0) {
      setError(`첨부는 사진·동영상 합쳐 ${MAX_ATTACHMENTS_PER_POST}개까지 붙일 수 있습니다`);
      return;
    }

    setUploading(true);
    setError(null);
    const failed: string[] = [];

    for (const file of files.slice(0, room)) {
      const form = new FormData();
      form.append('file', file);
      form.append('playerId', String(playerId));
      try {
        const res = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok) {
          const saved = data.file as PostAttachment;
          // 어떤 노드로 넣을지는 보낸 파일이 아니라 **서버가 판정한 mime** 으로
          // 정한다 (매직 바이트 기준 — lib/uploads.ts detect).
          if (isVideo(saved.mime)) editor.chain().focus().setPostVideo(saved.id).run();
          else editor.chain().focus().setPostImage(saved.id).run();
        } else {
          failed.push(`${file.name}: ${data.error ?? '업로드 실패'}`);
        }
      } catch {
        failed.push(`${file.name}: 네트워크 오류`);
      }
    }

    if (files.length > room) {
      failed.push(`${MAX_ATTACHMENTS_PER_POST}개 제한으로 ${files.length - room}개는 건너뜀`);
    }
    setError(failed.length ? failed.join(' · ') : null);
    setUploading(false);
    if (imageInput.current) imageInput.current.value = '';
    if (videoInput.current) videoInput.current.value = '';
  };

  /** @returns 우리가 처리했으면 true (ProseMirror 기본 동작을 막는다) */
  function handleFiles(files: File[]): boolean {
    const media = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    if (media.length === 0) return false;
    void upload(media);
    return true;
  }

  // ─── 링크 · 동영상 입력 ────────────────────────────────────

  const submitAsk = () => {
    if (!editor) return;
    const raw = askValue.trim();

    if (ask === 'link') {
      if (!raw) {
        editor.chain().focus().unsetLink().run();
      } else {
        const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
      }
    }

    if (ask === 'youtube') {
      const id = youtubeId(raw);
      if (!id) {
        setError('유튜브 주소를 알아볼 수 없습니다 (youtu.be/… 또는 youtube.com/watch?v=…)');
        return;
      }
      editor.chain().focus().setYoutube(id).run();
    }

    setAsk(null);
    setAskValue('');
    setError(null);
  };

  if (!editor) {
    // 편집기는 클라이언트에서만 만들어진다 (immediatelyRender: false).
    return <div className="rt-shell rt-loading">편집기를 불러오는 중…</div>;
  }

  return (
    <div className="rt-shell">
      <Toolbar
        editor={editor}
        disabled={disabled}
        uploading={uploading}
        onPick={(kind) => (kind === 'image' ? imageInput : videoInput).current?.click()}
        onAsk={(kind) => {
          setAsk(kind);
          setAskValue(
            kind === 'link' ? (editor.getAttributes('link').href as string) ?? '' : '',
          );
        }}
      />

      {ask && (
        <div className="rt-ask">
          <input
            type="url"
            autoFocus
            value={askValue}
            placeholder={
              ask === 'link' ? 'https://… (비우고 확인하면 링크 해제)' : '유튜브 주소'
            }
            onChange={(e) => setAskValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitAsk();
              }
              if (e.key === 'Escape') setAsk(null);
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={submitAsk}>
            확인
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setAsk(null)}>
            취소
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      <input
        ref={imageInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      {/* 형식을 좁게 적습니다 — 브라우저가 못 그리는 파일을 고르고 나서 업로드가
          거절되는 것보다 아예 고를 수 없는 쪽이 낫습니다. 확장자도 함께 적는 이유:
          mov 의 Content-Type 을 비워 보내는 기기가 있습니다. */}
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        multiple
        hidden
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />

      <div className="rt-foot muted small">
        {uploading
          ? '올리는 중…'
          : `첨부 ${attachmentCount(editor)}/${MAX_ATTACHMENTS_PER_POST} · 동영상은 MP4 · MOV`}
        {!playerId && ' · 로그인하면 첨부를 넣을 수 있습니다'}
      </div>

      {error && <p className="warn small">{error}</p>}
    </div>
  );
}

// ─── 툴바 ────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor;
  disabled?: boolean;
  uploading: boolean;
  /** 파일 선택창을 연다. 사진과 동영상은 고를 수 있는 형식이 다르다 */
  onPick: (kind: 'image' | 'video') => void;
  onAsk: (kind: 'link' | 'youtube') => void;
}

function Toolbar({ editor, disabled, uploading, onPick, onAsk }: ToolbarProps) {
  /**
   * 버튼의 눌림 표시는 커서 위치마다 달라지므로 편집기 상태를 구독합니다.
   * `useEditorState` 는 selector 결과가 바뀔 때만 다시 그립니다 — 타이핑
   * 한 글자마다 툴바 전체를 다시 그리지 않습니다.
   */
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      quote: ed.isActive('blockquote'),
      bullet: ed.isActive('bulletList'),
      ordered: ed.isActive('orderedList'),
      table: ed.isActive('table'),
      align: (['center', 'right'] as const).find((a) => ed.isActive({ textAlign: a })) ?? 'left',
      block: ed.isActive('heading', { level: 1 })
        ? 'h1'
        : ed.isActive('heading', { level: 2 })
          ? 'h2'
          : ed.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p',
      fontSize: (ed.getAttributes('textStyle').fontSize as string) ?? '',
      fontFamily: (ed.getAttributes('textStyle').fontFamily as string) ?? 'inherit',
      color: (ed.getAttributes('textStyle').color as string) ?? '',
      background: (ed.getAttributes('textStyle').backgroundColor as string) ?? '',
    }),
  });

  const chain = () => editor.chain().focus();
  const off = disabled || uploading;

  return (
    <div className="rt-toolbar">
      {/* ── 1행: 넣기 ── */}
      <div className="rt-row">
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() => onPick('image')}
        >
          사진
        </button>
        {/* 업로드하는 동영상(mp4·mov)과 링크로 넣는 유튜브는 저장물이 아예 다르다 —
            앞은 우리 서버의 첨부, 뒤는 영상 id 하나 (lib/tiptap-nodes.ts). */}
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() => onPick('video')}
        >
          동영상
        </button>
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() => onAsk('youtube')}
        >
          유튜브
        </button>
        <button
          type="button"
          className={state?.quote ? 'rt-btn rt-wide is-on' : 'rt-btn rt-wide'}
          disabled={off}
          onClick={() => chain().toggleBlockquote().run()}
        >
          인용구
        </button>
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() => chain().setHorizontalRule().run()}
        >
          구분선
        </button>
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() =>
            chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          표
        </button>
        <button
          type="button"
          className="rt-btn rt-wide"
          disabled={off}
          onClick={() => onAsk('link')}
        >
          링크
        </button>
      </div>

      {/* ── 2행: 서식 ── */}
      <div className="rt-row">
        <select
          className="rt-select"
          value={state?.block ?? 'p'}
          disabled={off}
          aria-label="문단 스타일"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') chain().setParagraph().run();
            else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">본문</option>
          <option value="h1">제목 1</option>
          <option value="h2">제목 2</option>
          <option value="h3">제목 3</option>
        </select>

        <select
          className="rt-select"
          value={state?.fontFamily ?? 'inherit'}
          disabled={off}
          aria-label="서체"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'inherit') chain().unsetFontFamily().run();
            else chain().setFontFamily(v).run();
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          className="rt-select rt-narrow"
          value={state?.fontSize ?? ''}
          disabled={off}
          aria-label="글자 크기"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) chain().unsetFontSize().run();
            else chain().setFontSize(v).run();
          }}
        >
          <option value="">기본</option>
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <span className="rt-sep" />

        <button
          type="button"
          className={state?.bold ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="굵게 (Ctrl+B)"
          onClick={() => chain().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={state?.italic ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="기울임 (Ctrl+I)"
          onClick={() => chain().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className={state?.underline ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="밑줄 (Ctrl+U)"
          onClick={() => chain().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className={state?.strike ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="취소선"
          onClick={() => chain().toggleStrike().run()}
        >
          <s>S</s>
        </button>

        <Swatches
          label="글자색"
          swatches={TEXT_COLORS}
          current={state?.color ?? ''}
          disabled={off}
          onPick={(value) => (value ? chain().setColor(value).run() : chain().unsetColor().run())}
        />
        <Swatches
          label="배경색"
          swatches={BG_COLORS}
          current={state?.background ?? ''}
          disabled={off}
          onPick={(value) =>
            value
              ? chain().setBackgroundColor(value).run()
              : chain().unsetBackgroundColor().run()
          }
        />

        <span className="rt-sep" />

        <select
          className="rt-select rt-narrow"
          value={state?.align ?? 'left'}
          disabled={off}
          aria-label="정렬"
          onChange={(e) => chain().setTextAlign(e.target.value).run()}
        >
          <option value="left">왼쪽</option>
          <option value="center">가운데</option>
          <option value="right">오른쪽</option>
        </select>

        <span className="rt-sep" />

        <button
          type="button"
          className={state?.bullet ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="글머리 목록"
          onClick={() => chain().toggleBulletList().run()}
        >
          ·—
        </button>
        <button
          type="button"
          className={state?.ordered ? 'rt-btn is-on' : 'rt-btn'}
          disabled={off}
          title="번호 목록"
          onClick={() => chain().toggleOrderedList().run()}
        >
          1—
        </button>
      </div>

      {/* ── 표 안에서만: 행·열 편집 ── */}
      {state?.table && (
        <div className="rt-row rt-row-table">
          <span className="muted small">표</span>
          <button type="button" className="rt-btn rt-wide" disabled={off} onClick={() => chain().addRowAfter().run()}>
            행 추가
          </button>
          <button type="button" className="rt-btn rt-wide" disabled={off} onClick={() => chain().deleteRow().run()}>
            행 삭제
          </button>
          <button type="button" className="rt-btn rt-wide" disabled={off} onClick={() => chain().addColumnAfter().run()}>
            열 추가
          </button>
          <button type="button" className="rt-btn rt-wide" disabled={off} onClick={() => chain().deleteColumn().run()}>
            열 삭제
          </button>
          <button type="button" className="rt-btn rt-wide" disabled={off} onClick={() => chain().deleteTable().run()}>
            표 삭제
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 색 팔레트 ───────────────────────────────────────────────

interface SwatchesProps {
  label: string;
  swatches: readonly Choice[];
  current: string;
  disabled?: boolean;
  onPick: (value: string) => void;
}

/** 색 버튼 — 누르면 견본이 열립니다. 임의 색은 고를 수 없습니다 (lib/rich-text.ts) */
function Swatches({ label, swatches, current, disabled, onPick }: SwatchesProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다. 열려 있는 동안만 듣는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="rt-swatch-wrap" ref={box}>
      <button
        type="button"
        className="rt-btn"
        disabled={disabled}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rt-swatch-chip" style={{ background: current || 'transparent' }} />
        {label === '글자색' ? '가' : '밑'}
      </button>

      {open && (
        <div className="rt-swatches">
          {swatches.map((c) => (
            <button
              key={c.value}
              type="button"
              className={current === c.value ? 'rt-swatch is-on' : 'rt-swatch'}
              style={{ background: c.value }}
              title={c.label}
              aria-label={`${label} ${c.label}`}
              onClick={() => {
                onPick(c.value);
                setOpen(false);
              }}
            />
          ))}
          <button
            type="button"
            className="rt-swatch-reset"
            onClick={() => {
              onPick('');
              setOpen(false);
            }}
          >
            기본
          </button>
        </div>
      )}
    </div>
  );
}
