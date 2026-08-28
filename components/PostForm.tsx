'use client';

import { useState } from 'react';
import { attachmentIdsInBody, stripMarkers } from '@/lib/board-content';
import {
  defaultCategoryCode,
  isNotice,
  type Board,
  type BoardCategory,
  type PostDetail,
} from '@/lib/board-types';
import type { RichDoc } from '@/lib/rich-text';
import { usePlayerId } from '@/lib/use-player';
import { useIsAdmin } from '@/lib/use-session';
import RichTextEditor from './RichTextEditor';

/** 글자도 첨부도 없으면 빈 본문. lib/validation.ts 의 서버 검증과 같은 규칙 */
function isBodyEmpty(body: string): boolean {
  return stripMarkers(body).trim().length === 0 && attachmentIdsInBody(body).length === 0;
}

interface Props {
  boards: Board[];
  categories: BoardCategory[];
  /** null 이면 새 글, 있으면 수정 */
  initial: PostDetail | null;
  /** 새 글일 때 어느 게임 탭에서 눌렀는지 */
  defaultMachineId: number | null;
  onCancel: () => void;
  onSaved: (post: PostDetail) => void;
}

export default function PostForm({
  boards,
  categories,
  initial,
  defaultMachineId,
  onCancel,
  onSaved,
}: Props) {
  const playerId = usePlayerId();
  const isAdmin = useIsAdmin();

  /**
   * 고른 게임. `''` = 고르지 않음 (공지에서만 허용).
   *
   * 수정 모드에서는 **글의 값을 그대로** 씁니다 — `initial.machineId ?? defaultMachineId`
   * 로 적으면 게임 없이 쓴 공지를 열었을 때 탭 기본값이 슬쩍 채워집니다.
   */
  const [machineId, setMachineId] = useState<number | ''>(
    initial ? (initial.machineId ?? '') : (defaultMachineId ?? ''),
  );
  /** 공지는 맨 앞 말머리지만 기본값이 아니다 (defaultCategoryCode 주석 참고) */
  const [category, setCategory] = useState(
    initial?.category ?? defaultCategoryCode(categories),
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  /**
   * 편집기가 올려 주는 본문. 저장·검증에만 씁니다 — 편집기로 다시 내려보내면
   * 매 입력마다 캐럿이 튑니다 (RichTextEditor 주석 참고).
   *
   * `body` 는 평문(마커 포함)이고 `bodyDoc` 은 서식 있는 문서입니다. 서버는
   * 문서가 있으면 평문을 문서에서 다시 만들지만, 등록 버튼을 언제 열지는 화면이
   * 판단해야 하므로 평문도 함께 들고 있습니다.
   */
  const [body, setBody] = useState(initial?.body ?? '');
  const [bodyDoc, setBodyDoc] = useState<RichDoc | null>(initial?.bodyDoc ?? null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const save = async () => {
    if (!playerId || (machineId === '' && !noticeSelected)) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch(initial ? `/api/posts/${initial.id}` : '/api/posts', {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // imageIds 는 보내지 않는다 — 본문의 마커가 유일한 근거다 (lib/validation.ts)
        body: JSON.stringify({
          // 공지는 게임에 속하지 않는다 (아래 noticeSelected 주석). 서버도 같은
          // 판단을 다시 하지만, 화면이 보내는 값과 화면에 보이는 값이 같아야 한다.
          machineId: noticeSelected || machineId === '' ? null : machineId,
          category,
          playerId,
          title,
          body,
          bodyDoc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.details ?? [data.error ?? '저장에 실패했습니다']);
        return;
      }
      onSaved(data.post as PostDetail);
    } catch {
      setErrors(['네트워크 오류']);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 고를 수 있는 말머리.
   *
   * '공지' 는 관리자에게만 보여 줍니다 — 커뮤니티 전체 맨 위에 고정되는 글이라
   * 아무나 올릴 수 있으면 고정 자리가 광고판이 됩니다. 여기서 감추는 것은 표시일
   * 뿐이고, 실제 판정은 세션 쿠키를 보는 서버가 합니다
   * (app/api/posts/notice-guard.ts) — 이 목록을 우회해 요청해도 403 입니다.
   *
   * 이미 고른 말머리는 권한과 무관하게 남깁니다. 관리자 세션이 만료된 채 공지를
   * 수정하는 경우, 칩이 사라지면 "아무것도 선택되지 않은 폼" 이 되어 무엇이
   * 잘못됐는지 알 수 없게 됩니다 (저장은 서버가 막습니다).
   */
  const pickable = categories.filter(
    (c) => !isNotice(c.code) || isAdmin || c.code === category,
  );

  /**
   * 공지를 고른 상태.
   *
   * 공지는 모든 게임 탭 맨 위에 붙는 글이라 어느 게시판에 썼는지가 뜻이 없어서,
   * 게임을 **고르지 않아도** 되고 골라도 저장하지 않습니다
   * (lib/validation.ts postInputSchema). 그래서 고를 수 없게 잠가 둡니다 —
   * 고를 수는 있는데 저장은 안 되는 칸이 더 헷갈립니다.
   */
  const noticeSelected = isNotice(category);

  return (
    <div className="post-form">
      <header className="board-head">
        <h1>{initial ? '글 수정' : '글쓰기'}</h1>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          취소
        </button>
      </header>

      <div className="field">
        <label htmlFor="post-game">게임{noticeSelected && ' (공지는 선택하지 않습니다)'}</label>
        <select
          id="post-game"
          /* 공지일 때는 저장될 값(게임 없음)을 그대로 보여준다 — 화면과 저장물이
             어긋나지 않게. 말머리를 되돌리면 골라 둔 게임이 다시 나온다. */
          value={noticeSelected ? '' : machineId}
          disabled={busy || noticeSelected}
          onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">{noticeSelected ? '게임 없음 (커뮤니티 전체)' : '게임 선택'}</option>
          {boards.map((b) => (
            <option key={b.machineId} value={b.machineId}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>말머리</label>
        <div className="chips">
          {pickable.map((c) => (
            <button
              key={c.code}
              type="button"
              className={category === c.code ? 'chip is-on' : 'chip'}
              disabled={busy}
              onClick={() => setCategory(c.code)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="post-title">제목</label>
        <input
          id="post-title"
          type="text"
          maxLength={120}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label>내용</label>
        <RichTextEditor
          initialDoc={initial?.bodyDoc ?? null}
          initialBody={initial?.body ?? ''}
          initialAttachments={initial?.attachments ?? []}
          playerId={playerId}
          disabled={busy}
          onChange={({ doc, text }) => {
            setBodyDoc(doc);
            setBody(text);
          }}
        />
      </div>

      {errors.length > 0 && (
        <ul className="form-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          /* 첨부만 있는 글도 허용 — 그래서 글자 수가 아니라 "글자 또는 첨부" 를 본다 */
          disabled={
            busy ||
            (machineId === '' && !noticeSelected) ||
            title.trim().length < 2 ||
            isBodyEmpty(body)
          }
          onClick={save}
        >
          {initial ? '수정' : '등록'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
