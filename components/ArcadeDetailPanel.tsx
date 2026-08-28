'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import {
  REPORT_KIND_LABEL,
  WAIT_CHOICES,
  timeAgo,
  waitChoiceLabel,
  waitCountLabel,
  type MachineReport,
  type PresenceOutcome,
  type ReportKind,
} from '@/lib/community-types';
import type { Arcade, ArcadeCabinet, ArcadeMachine, Machine } from '@/lib/types';
import { useFavorites } from '@/lib/use-favorites';
import { usePlayerId } from '@/lib/use-player';
import { useIsAdmin } from '@/lib/use-session';
import ArcadeReviews from './ArcadeReviews';
import { ConditionBadge, WaitBadge } from './LiveBadge';

interface Props {
  arcade: Arcade;
  machines: Machine[];
  onClose: () => void;
  /**
   * 지도를 이 오락실로 다시 옮긴다.
   *
   * 주변을 보다가 화면이 그 지점에서 벗어나면 상세만 열려 있고 "어디였는지" 를
   * 볼 길이 없다. 지도가 접혀 있는 폭에서는 부모가 사이드바를 접어 지도를
   * 드러낸다 (ArcadeFinder handleLocate).
   */
  onLocate: () => void;
  /** 제보로 보유 기종/평점이 바뀌면 목록·지도도 같이 갱신되어야 한다 */
  onArcadeChanged: (arcade: Arcade) => void;
}

/**
 * 열려 있는 제보 폼 하나.
 *
 * 대기는 기종에, 컨디션은 기체에 달린다 — 그래서 같은 기종 안에서 1호기 폼과
 * 2호기 폼이 서로 다른 폼이어야 하고, 키에 cabinetId 가 들어간다.
 */
type OpenForm =
  | { kind: 'queue'; machineId: number }
  | { kind: 'condition'; machineId: number; cabinetId: number }
  | null;

function sameForm(a: OpenForm, b: OpenForm): boolean {
  if (!a || !b || a.kind !== b.kind || a.machineId !== b.machineId) return false;
  return a.kind === 'condition' && b.kind === 'condition' ? a.cabinetId === b.cabinetId : true;
}

function outcomeMessage(kind: ReportKind, outcome: PresenceOutcome, support: number, need: number) {
  if (outcome === 'added') return '제보가 모여 보유 기종에 반영되었습니다.';
  if (outcome === 'removed') return '제보가 모여 보유 기종에서 제외되었습니다.';
  if (kind === 'presence' || kind === 'absence') {
    return `제보 ${support}/${need} — ${need}명이 모이면 자동 반영됩니다.`;
  }
  return '제보가 등록되었습니다. 감사합니다!';
}

/**
 * memo 인 이유: 부모(ArcadeFinder)는 GPS 좌표·지도 이동(idle)·검색어 타이핑마다
 * 다시 렌더되는데, 이 패널의 재료(arcade·machines)는 그때 바뀌지 않는다.
 * 상세를 열어 둔 채 지도를 끌면 기종 행 + 기체 카드 + 제보 20건 + 리뷰가
 * 렌더마다 통째로 다시 그려지던 것이 "상세가 열려 있을 때만 무겁다" 의 정체였다.
 * 조건: 내려오는 콜백(onClose·onArcadeChanged)이 useCallback 이어야 한다.
 */
export default memo(ArcadeDetailPanel);

function ArcadeDetailPanel({
  arcade,
  machines,
  onClose,
  onLocate,
  onArcadeChanged,
}: Props) {
  const playerId = usePlayerId();
  const isAdmin = useIsAdmin();
  const favorites = useFavorites();

  const [reports, setReports] = useState<MachineReport[]>([]);
  const [open, setOpen] = useState<OpenForm>(null);
  const [memo, setMemo] = useState('');
  /**
   * 대기·컨디션 모두 **고른 다음 등록** 합니다 — 고르는 순간 전송하면 그 아래
   * 메모 칸에 뭘 쓸 기회가 없습니다. 대기가 드롭다운이 된 뒤로는 더 그렇습니다:
   * 목록을 훑다 스친 값이 그대로 제보가 되면 안 됩니다.
   */
  const [draftCondition, setDraftCondition] = useState<number | null>(null);
  const [draftWait, setDraftWait] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newMachineId, setNewMachineId] = useState<number | ''>('');

  const loadReports = useCallback(async () => {
    const data = await fetch(`/api/arcades/${arcade.id}/reports?limit=20`).then((r) => r.json());
    setReports((data.reports as MachineReport[]) ?? []);
  }, [arcade.id]);

  useEffect(() => {
    setOpen(null);
    setNotice(null);
    setError(null);
    setNewMachineId('');
    void loadReports();
  }, [loadReports]);

  const submit = async (body: {
    machineId: number;
    kind: ReportKind;
    cabinetId?: number | null;
    waitCount?: number | null;
    condition?: number | null;
  }) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/arcades/${arcade.id}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          comment: memo.trim() || null,
          cabinetId: null,
          waitCount: null,
          condition: null,
          ...body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '제보에 실패했습니다');
        return;
      }

      setNotice(
        outcomeMessage(
          body.kind,
          data.outcome as PresenceOutcome,
          data.support?.count ?? 0,
          data.support?.threshold ?? 2,
        ),
      );
      setOpen(null);
      setMemo('');
      setDraftCondition(null);
      setDraftWait(null);
      setNewMachineId('');
      if (data.arcade) onArcadeChanged(data.arcade as Arcade);
      await loadReports();
    } catch {
      setError('네트워크 오류');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 제보 삭제 — 관리자만. 지운 뒤 목록을 다시 받는다: 전국 피드와 달리 여기는
   * 20건짜리 고정 목록이라, 한 줄이 빠지면 그 자리를 다음 제보가 채워야 한다.
   */
  const removeReport = async (r: MachineReport) => {
    if (!confirm(`${r.machineShortName} 제보를 삭제할까요?`)) return;
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/reports/${r.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '삭제에 실패했습니다');
      return;
    }
    setNotice('제보를 삭제했습니다. 이미 반영된 보유 기종은 오락실 수정에서 되돌리세요.');
    await loadReports();
  };

  const toggleForm = (next: NonNullable<OpenForm>) => {
    setMemo('');
    setDraftCondition(null);
    setDraftWait(null);
    setNotice(null);
    setError(null);
    setOpen((prev) => (sameForm(prev, next) ? null : next));
  };

  const ownedIds = new Set(arcade.machines.map((m) => m.id));
  const missing = machines.filter((m) => !ownedIds.has(m.id));

  return (
    <div className="detail arcade-detail">
      <div className="detail-head">
        <div className="detail-title">
          {/* 이름 오른쪽에 붙인다 — '이 지점' 을 가리키는 버튼이라 이름과 한 덩어리다 */}
          <div className="detail-title-row">
            <h2>{arcade.name}</h2>
            <button
              type="button"
              className="btn btn-sm locate-btn"
              title="지도를 이 오락실로 옮깁니다"
              onClick={onLocate}
            >
              위치
            </button>
          </div>
          <p className="muted small">{arcade.address}</p>
        </div>
        <div className="detail-head-actions">
          {/*
            비로그인에는 별을 그리지 않는다. 즐겨찾기는 계정에 붙는 값이라
            (app/api/favorites 가 세션에서 playerId 를 읽는다) 담아 둘 곳이 없다.
          */}
          {favorites.canFavorite && (
            <button
              type="button"
              className={`fav-btn fav-btn-lg ${favorites.isFavorite(arcade.id) ? 'is-on' : ''}`}
              aria-pressed={favorites.isFavorite(arcade.id)}
              title={
                favorites.isFavorite(arcade.id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'
              }
              onClick={() => void favorites.toggle(arcade.id)}
            >
              {favorites.isFavorite(arcade.id) ? '★' : '☆'}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="warn">{error}</p>}

      <div className="section">
        {arcade.machines.length === 0 ? (
          <p className="muted small">등록된 기종이 없습니다.</p>
        ) : (
          <ul className="live-list">
            {arcade.machines.map((m) => (
              <li key={m.id}>
                <MachineRow
                  machine={m}
                  open={open}
                  busy={busy}
                  memo={memo}
                  onMemo={setMemo}
                  draftCondition={draftCondition}
                  onDraftCondition={setDraftCondition}
                  draftWait={draftWait}
                  onDraftWait={setDraftWait}
                  onToggle={toggleForm}
                  onSubmit={submit}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        {missing.length === 0 ? (
          <p className="muted small">기종 마스터의 모든 게임이 이미 등록돼 있습니다.</p>
        ) : (
          <div className="presence-row">
            <select
              value={newMachineId}
              onChange={(e) => setNewMachineId(e.target.value ? Number(e.target.value) : '')}
              disabled={busy}
            >
              <option value="">기종 선택</option>
              {missing.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || newMachineId === ''}
              onClick={() => submit({ machineId: Number(newMachineId), kind: 'presence' })}
            >
              제보
            </button>
          </div>
        )}
        <p className="hint">
          서로 다른 사람의 제보가 모이면 자동으로 보유 기종에 반영됩니다.
          {!playerId && ' 익명 제보는 기록만 남고 자동 반영에는 세지 않습니다.'}
        </p>
      </div>

      <div className="section">
        {reports.length === 0 ? (
          <p className="muted small">아직 제보가 없습니다.</p>
        ) : (
          <ul className="feed feed-compact">
            {reports.map((r) => (
              <li key={r.id}>
                <span className={`kind kind-${r.kind}`}>{REPORT_KIND_LABEL[r.kind]}</span>
                <span className="feed-body">
                  <strong>
                    {r.machineShortName}
                    {/* 옛 제보는 어느 기체였는지 기록이 없어 번호가 비어 있다 */}
                    {r.cabinetNo !== null && <em className="feed-cabinet">{r.cabinetNo}호기</em>}
                  </strong>
                  {r.kind === 'queue' &&
                    r.waitCount !== null &&
                    ` 대기 ${waitCountLabel(r.waitCount)}`}
                  {r.kind === 'condition' && ` 컨디션 ${r.condition}/5`}
                  {r.comment && <em className="feed-memo">{r.comment}</em>}
                </span>
                <span className="muted small feed-meta">
                  {r.nickname ?? '익명'} · {timeAgo(r.createdAt)}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger feed-del"
                      title="이 제보를 삭제합니다 (관리자)"
                      onClick={() => void removeReport(r)}
                    >
                      삭제
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ArcadeReviews arcade={arcade} onArcadeChanged={onArcadeChanged} />
    </div>
  );
}

// ─── 기종 1블록 ───────────────────────────────────────────────

/** MachineRow → CabinetCard 로 그대로 흘려보내는 제보 폼 상태 */
interface ReportFormProps {
  open: OpenForm;
  busy: boolean;
  memo: string;
  onMemo: (v: string) => void;
  draftCondition: number | null;
  onDraftCondition: (v: number | null) => void;
  draftWait: number | null;
  onDraftWait: (v: number | null) => void;
  onToggle: (next: NonNullable<OpenForm>) => void;
  onSubmit: (body: {
    machineId: number;
    kind: ReportKind;
    cabinetId?: number | null;
    waitCount?: number | null;
    condition?: number | null;
  }) => void;
}

/**
 * 기종 하나 = 헤더(대기) + 기체 카드 N장(컨디션).
 *
 * 대기는 기종에 한 번만 붙는다 — 줄은 게임 앞에 서지 호기별로 서지 않는다.
 * 반대로 컨디션은 카드마다 따로다: 1호기는 멀쩡한데 2호기 발판만 죽어 있는
 * 오락실이 흔한데, 기종에 컨디션 한 칸만 두면 그 사실을 적을 자리가 없다.
 */
function MachineRow({ machine, ...form }: { machine: ArcadeMachine } & ReportFormProps) {
  const { open, busy, memo, onMemo, draftWait, onDraftWait, onToggle, onSubmit } = form;
  const queueForm = { kind: 'queue', machineId: machine.id } as const;
  const queueOpen = sameForm(open, queueForm);

  return (
    <div className="live-row">
      <div className="live-head">
        <span className={`badge badge-${machine.category}`}>
          {machine.shortName}
          {machine.cabinetCount > 1 && <em>×{machine.cabinetCount}</em>}
        </span>
        <WaitBadge live={machine.live} cabinets={machine.cabinetCount} />
      </div>

      <div className="live-actions">
        <button
          type="button"
          className={queueOpen ? 'btn btn-sm btn-on' : 'btn btn-sm'}
          onClick={() => onToggle(queueForm)}
        >
          대기 제보
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={busy}
          onClick={() => onSubmit({ machineId: machine.id, kind: 'absence' })}
        >
          없어졌어요
        </button>
      </div>

      {queueOpen && (
        <div className="report-form">
          <p className="muted small">
            지금 대기 중인 사람 수
            {machine.cabinetCount > 1 && (
              <span className="muted"> · {machine.cabinetCount}대 합쳐서</span>
            )}
          </p>
          {/* 0 은 유효한 값('없음')이므로 "안 고른 상태"를 0 으로 표현할 수 없다.
              빈 문자열 ↔ null 로 따로 둔다. */}
          <select
            value={draftWait ?? ''}
            disabled={busy}
            aria-label="대기 인원"
            onChange={(e) => onDraftWait(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">인원 선택</option>
            {WAIT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {waitChoiceLabel(n)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="한 줄 메모 (선택)"
            value={memo}
            maxLength={200}
            onChange={(e) => onMemo(e.target.value)}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || draftWait === null}
              onClick={() =>
                onSubmit({ machineId: machine.id, kind: 'queue', waitCount: draftWait })
              }
            >
              대기 제보
            </button>
            <span className="muted small">
              {draftWait === null ? '인원을 먼저 고르세요' : '메모는 선택입니다'}
            </span>
          </div>
        </div>
      )}

      <ul className="cabinet-list">
        {machine.cabinets.map((c) => (
          <li key={c.id}>
            <CabinetCard machine={machine} cabinet={c} {...form} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 기체 1대 ─────────────────────────────────────────────────

function CabinetCard({
  machine,
  cabinet,
  open,
  busy,
  memo,
  onMemo,
  draftCondition,
  onDraftCondition,
  onToggle,
  onSubmit,
}: { machine: ArcadeMachine; cabinet: ArcadeCabinet } & ReportFormProps) {
  const form = { kind: 'condition', machineId: machine.id, cabinetId: cabinet.id } as const;
  const isOpen = sameForm(open, form);

  return (
    <div className={isOpen ? 'cabinet-card is-open' : 'cabinet-card'}>
      <div className="cabinet-head">
        <span className="cabinet-no">{cabinet.cabinetNo}호기</span>
        {/* 등록값과 제보를 종합한 숫자 하나. 등록값도 제보도 없을 때만 비는데,
            그때는 빈칸이 아니라 "모름"이라고 적는다 — 빈칸은 상태가 좋다는
            뜻으로 읽히기 쉽다. */}
        <ConditionBadge summary={cabinet.conditionSummary} />
        {cabinet.conditionSummary === null && (
          <span className="muted small">컨디션 정보 없음</span>
        )}
        <button
          type="button"
          className={isOpen ? 'btn btn-sm btn-on cabinet-btn' : 'btn btn-sm cabinet-btn'}
          onClick={() => onToggle(form)}
        >
          컨디션 제보
        </button>
      </div>

      {isOpen && (
        <div className="report-form">
          <p className="muted small">
            {cabinet.cabinetNo}호기 상태 (5 = 최상)
            {draftCondition !== null && <strong className="picked"> {draftCondition}/5 선택</strong>}
          </p>
          {/* 대기와 달리 누르면 '선택'만 된다. 등록은 아래 버튼으로 —
              그 사이에 메모를 쓸 수 있어야 하기 때문이다. */}
          <div className="preset-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={draftCondition === n ? 'btn btn-sm btn-on' : 'btn btn-sm'}
                disabled={busy}
                aria-pressed={draftCondition === n}
                onClick={() => onDraftCondition(draftCondition === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="한 줄 메모 (선택)"
            value={memo}
            maxLength={200}
            onChange={(e) => onMemo(e.target.value)}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || draftCondition === null}
              onClick={() =>
                onSubmit({
                  machineId: machine.id,
                  kind: 'condition',
                  cabinetId: cabinet.id,
                  condition: draftCondition,
                })
              }
            >
              {cabinet.cabinetNo}호기 컨디션 제보
            </button>
            <span className="muted small">
              {draftCondition === null ? '상태를 먼저 고르세요' : '메모는 선택입니다'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
