'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RANK_LABELS,
  isArcadeSearchIntent,
  type ChatMessage,
  type ChatResponse,
  type ChatTurn,
  type SearchOutcome,
} from '@/lib/chat-types';
import type { ChatConstraints } from '@/lib/query-constraints';
import {
  FACTORS,
  describeOrder,
  isCompleteOrder,
  type FactorKey,
  type PartialOrder,
  type PriorityOrder,
} from '@/lib/recommend';

interface Props {
  /**
   * 탐색을 실제로 돌립니다. 순위 계산·지도 표시는 부모가 하고, 여기서는
   * **말로 할 몫**만 돌려받습니다 — 챗봇이 자기 순위를 따로 매기면 지도와
   * 채팅이 서로 다른 1위를 말하게 됩니다.
   */
  onSearch: (order: PriorityOrder, constraints: ChatConstraints | null) => SearchOutcome;
  /**
   * 트리거 문장에서 제약(언급된 오락실·기종)을 뽑습니다. 오락실·기종 목록은
   * 부모가 들고 있으므로 판별도 부모의 것입니다 — 여기서는 결과를 보여 주고
   * 사용자가 끌 수 있게만 합니다.
   */
  extract: (text: string) => ChatConstraints;
  /** 마지막으로 쓴 우선순위 — 드롭다운의 시작값 */
  initialOrder: PartialOrder;
}

/** 서버로 보낼 대화 기록의 최대 길이 (한 번 요청에 실리는 분량) */
const HISTORY_LIMIT = 12;

const GREETING = `무엇을 도와드릴까요?`;

let seq = 0;
const nextId = (): string => `m${++seq}`;

/** 탐색 결과를 사람이 읽을 한 덩어리로 */
function formatOutcome(outcome: SearchOutcome, order: PriorityOrder): string {
  const { total, radiusKm, hasOrigin, top, machineNames } = outcome;

  if (total === 0) {
    // radiusKm 0 = 반경 전체 — "반경을 넓혀라" 는 답이 될 수 없다.
    return hasOrigin && radiusKm > 0
      ? `반경 ${radiusKm}km 안에 조건에 맞는 오락실이 없습니다. 반경을 넓히거나 기종 필터를 풀어 보세요.`
      : '조건에 맞는 오락실이 없습니다. 검색어나 기종 필터를 풀어 보세요.';
  }

  const scope = hasOrigin
    ? radiusKm > 0
      ? `반경 ${radiusKm}km 안 ${total}곳`
      : `기준점에서 가까운 순으로 ${total}곳`
    : `등록된 ${total}곳`;
  const filter = machineNames.length ? ` (${machineNames.join('·')} 보유)` : '';

  const lines = [
    `탐색이 완료되었습니다. ${describeOrder(order)} 기준으로 ${scope}${filter}을 비교해 지도와 목록에 표시했습니다.`,
    // 그곳이 목록에 왜 없는지를 여기서 밝히지 않으면 빠진 것이 버그로 보입니다.
    ...(outcome.excluded
      ? [`${outcome.excluded}을(를) 기준점으로 잡았고, 그곳은 결과에서 뺐습니다.`]
      : []),
    '',
    ...top.map(
      (t, i) =>
        `${i + 1}위 ${t.name} — ${t.score}점${t.distanceLabel ? ` · ${t.distanceLabel}` : ''} (${t.reason})`,
    ),
  ];

  if (!hasOrigin) {
    lines.push('', '기준점이 없어 거리는 빼고 매겼습니다. 왼쪽 "내 위치"를 켜면 다시 매깁니다.');
  }

  if (outcome.stale) {
    // 이 말풍선은 그 순간의 스냅샷이고 목록은 계속 갱신된다. 조회가 아직
    // 끝나지 않았으면 둘의 개수가 곧 어긋나므로 미리 적어 둔다.
    lines.push('', '목록을 아직 불러오는 중이라 결과가 더 늘 수 있습니다.');
  }

  return lines.join('\n');
}

export default function ChatBot({ onSearch, extract, initialOrder }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextId(), role: 'assistant', text: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 말풍선이 붙으면 항상 맨 아래를 보여 준다.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // ── 자유 질문 → 서버 ───────────────────────────────────────
  const ask = useCallback(
    async (history: ChatMessage[]) => {
      const pendingId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: pendingId, role: 'assistant', text: '', pending: true },
      ]);
      setBusy(true);

      // 폼만 있고 내용이 없는 말풍선은 보내지 않는다 — 모델이 읽을 것이 없다.
      const turns: ChatTurn[] = history
        .filter((m) => m.text.trim() !== '' && !m.pending && !m.failed)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, text: m.text }));

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ turns }),
        });
        const data = (await res.json()) as ChatResponse & { error?: string };

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  pending: false,
                  failed: !res.ok,
                  text: res.ok ? data.text : (data.error ?? '답변을 만들지 못했습니다'),
                  sources: data.sources,
                }
              : m,
          ),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? { ...m, pending: false, failed: true, text: '연결에 실패했습니다' }
              : m,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // ── 보내기 ─────────────────────────────────────────────────
  const send = useCallback(() => {
    const text = input.trim();
    if (text === '' || busy) return;
    setInput('');

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };

    // 탐색 요청인지는 **모델이 아니라 여기서** 가른다 (lib/chat-types.ts).
    // 이 갈림길로 다음 화면이 정해지므로 매번 같은 판단이어야 하고, API 키가
    // 없어도 이 경로는 끝까지 굴러가야 한다.
    if (isArcadeSearchIntent(text)) {
      // 문장을 폼으로 갈아타며 버리지 않는다 — 언급된 기종·오락실을 뽑아
      // 탐색에 넘긴다. 오락실 언급은 "지금 있는 곳"으로 보고 기준점+제외에
      // 쓰는데, 오인식일 수 있으므로 폼에 보여 주고 끌 수 있게 한다.
      const constraints = extract(text);
      const hasConstraints = constraints.arcade !== null || constraints.machineIds.length > 0;
      const machineNote = constraints.machineIds.length
        ? `기종은 ${constraints.machineNames.join('·')}(으)로 좁힐게요. `
        : '';
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: nextId(),
          role: 'assistant',
          text: `${machineNote}어떤 순서로 볼까요? 1·2·3순위를 골라 주세요.`,
          form: 'priority',
          constraints: hasConstraints ? constraints : undefined,
        },
      ]);
      return;
    }

    // setMessages 의 updater 안에서 ask() 를 부르면 안 된다 — updater 는 순수해야
    // 하고, StrictMode 는 그걸 확인하려고 두 번 호출한다. 그러면 요청이 두 번
    // 나가고 같은 답이 두 번 붙는다. 다음 목록을 여기서 만들어 넘긴다.
    const next = [...messages, userMsg];
    setMessages(next);
    void ask(next);
  }, [input, busy, ask, messages]);

  // ── 우선순위 제출 → 탐색 ───────────────────────────────────
  const submitPriority = useCallback(
    (formId: string, order: PriorityOrder, constraints: ChatConstraints | null) => {
      const outcome = onSearch(order, constraints);
      setMessages((prev) => [
        ...prev.map((m) => (m.id === formId ? { ...m, formDone: true } : m)),
        { id: nextId(), role: 'assistant', text: formatOutcome(outcome, order) },
      ]);
    },
    [onSearch],
  );

  /** "○○ 기준 · 제외" 를 켜고 끈다 — 추출이 오인식일 때의 탈출구 */
  const toggleConstraint = useCallback((formId: string, off: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === formId ? { ...m, constraintOff: off } : m)),
    );
  }, []);

  return (
    <>
      <button
        type="button"
        className={`chat-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? '도우미 닫기' : '도우미 열기'}
        aria-expanded={open}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <section className="chat-panel" role="dialog" aria-label="오락실 도우미">
          <header className="chat-head">
            <strong>오락실 도우미</strong>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              닫기
            </button>
          </header>

          <div className="chat-body" ref={bodyRef}>
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg chat-${m.role}`}>
                {m.pending ? (
                  <p className="chat-bubble chat-typing">
                    <i />
                    <i />
                    <i />
                  </p>
                ) : (
                  <p className={`chat-bubble ${m.failed ? 'is-failed' : ''}`}>{m.text}</p>
                )}

                {m.sources && m.sources.length > 0 && (
                  // 웹에서 실제로 읽은 문서만 답니다 (본문에서 URL 을 긁지 않습니다).
                  <ul className="chat-sources">
                    {m.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {m.form === 'priority' && (
                  <>
                    {m.constraints?.arcade && (
                      <label className="chat-constraint">
                        <input
                          type="checkbox"
                          checked={m.constraintOff !== true}
                          disabled={m.formDone === true}
                          onChange={(e) => toggleConstraint(m.id, !e.target.checked)}
                        />
                        <span>
                          {m.constraints.arcade.name} 기준 · 결과에서 제외
                        </span>
                      </label>
                    )}
                    <PriorityForm
                      initial={initialOrder}
                      done={m.formDone === true}
                      onSubmit={(order) =>
                        submitPriority(
                          m.id,
                          order,
                          m.constraints
                            ? // 체크를 끄면 오락실 제약만 빠진다 — 기종 제약은
                              // 문장에 적힌 그대로가 맞을 확률이 높다.
                              { ...m.constraints, arcade: m.constraintOff ? null : m.constraints.arcade }
                            : null,
                        )
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="오락실 찾아줘 / 펌프 신곡 뭐 나왔어?"
              maxLength={2000}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !input.trim()}>
              보내기
            </button>
          </form>
        </section>
      )}
    </>
  );
}

/**
 * 1·2·3순위 드롭다운.
 *
 * 같은 항목을 두 칸에 넣을 수 없게 **이미 고른 것은 다른 칸에서 비활성**입니다.
 * 막지 않으면 "1순위 거리, 2순위 거리" 같은 입력을 받아 놓고 나중에 거절해야
 * 하는데, 고르는 중에 막는 쪽이 덜 성가십니다.
 *
 * 순위가 내부적으로 몇 점인지는 여기에 나오지 않습니다 (lib/recommend.ts
 * PRIORITY_POINTS). 사람이 답할 수 있는 건 "뭐가 더 중요한가" 까지입니다.
 */
function PriorityForm({
  initial,
  done,
  onSubmit,
}: {
  initial: PartialOrder;
  done: boolean;
  onSubmit: (order: PriorityOrder) => void;
}) {
  const [order, setOrder] = useState<PartialOrder>(() => [
    initial[0] ?? null,
    initial[1] ?? null,
    initial[2] ?? null,
  ]);

  const set = (rank: number, key: FactorKey | null) =>
    setOrder((prev) => prev.map((v, i) => (i === rank ? key : v)));

  const complete = isCompleteOrder(order);

  return (
    <div className={`chat-form ${done ? 'is-done' : ''}`}>
      {RANK_LABELS.map((label, rank) => (
        <label key={label} className="chat-rank">
          <span>{label}</span>
          <select
            value={order[rank] ?? ''}
            disabled={done}
            onChange={(e) => set(rank, (e.target.value || null) as FactorKey | null)}
          >
            <option value="">선택</option>
            {FACTORS.map((f) => (
              <option
                key={f.key}
                value={f.key}
                // 다른 칸이 이미 쓰고 있는 항목
                disabled={order.some((v, i) => i !== rank && v === f.key)}
              >
                {f.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={done || !complete}
        onClick={() => complete && onSubmit(order)}
      >
        {done ? '탐색 완료' : '이 순서로 탐색'}
      </button>
    </div>
  );
}
