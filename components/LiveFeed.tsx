'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  REPORT_KIND_LABEL,
  timeAgo,
  waitCountLabel,
  waitLevel,
  type MachineReport,
  type ReportKind,
} from '@/lib/community-types';
import type { Machine } from '@/lib/types';
import { useIsAdmin } from '@/lib/use-session';

/**
 * 전국 실시간 제보 피드 — 커뮤니티의 "지금 저기 어때요?".
 *
 * 오락실을 하나씩 열어 봐야만 정보가 보이면 제보가 쌓이지 않습니다.
 * 남긴 제보가 곧바로 다른 사람 화면에 뜨는 게 보여야 다음 제보가 생깁니다.
 */

const REFRESH_MS = 30_000;

/**
 * 검색어를 서버로 보내기까지 기다리는 시간. 한 글자마다 조회를 내보내면
 * '강남' 을 치는 동안 요청이 두 번 나가고, 늦게 온 첫 글자의 응답이 나중
 * 결과를 덮어쓸 수 있습니다. 오락실 파인더 사이드바 검색과 같은 값입니다.
 */
const SEARCH_DEBOUNCE_MS = 300;

const KIND_FILTERS: { key: string; label: string; kinds: ReportKind[] | null }[] = [
  { key: 'all', label: '전체', kinds: null },
  { key: 'queue', label: '대기', kinds: ['queue'] },
  { key: 'condition', label: '컨디션', kinds: ['condition'] },
  { key: 'roster', label: '기종 변동', kinds: ['presence', 'absence'] },
];

/**
 * 기간 필터. `hours: null` 은 **정말로 전체**입니다 — 기간 조건을 아예 걸지
 * 않습니다 (lib/reports.ts listReports 의 sinceHours 가 null 이면 WHERE 절이
 * 통째로 빠집니다).
 *
 * 예전에는 '전체' 가 90일이었습니다. 기종 변동(있어요/없어졌어요)은 지우지도
 * 창으로 자르지도 않는 영구 기록인데, 그걸 볼 수 있는 가장 넓은 창이 90일이라
 * 그보다 오래된 제보는 **남아 있는데 어디서도 볼 수 없었습니다**. 보존 기간과
 * 조회 기간이 어긋나면 둘 중 하나는 거짓말이 됩니다.
 */
const RANGES: { hours: number | null; label: string }[] = [
  { hours: 3, label: '3시간' },
  { hours: 24, label: '24시간' },
  { hours: 24 * 7, label: '1주일' },
  { hours: 24 * 30, label: '1개월' },
  { hours: null, label: '전체' },
];

/** select 의 value 는 문자열뿐이라 null 을 실어 나를 칸이 없습니다 */
const ALL_TIME = 'all';

export default function LiveFeed() {
  const isAdmin = useIsAdmin();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [kindKey, setKindKey] = useState('all');
  const [hours, setHours] = useState<number | null>(24);
  const [machineId, setMachineId] = useState<number | ''>('');

  /** 검색창에 지금 적혀 있는 값 / 실제로 조회에 쓰인 값 */
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [reports, setReports] = useState<MachineReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/machines')
      .then((r) => r.json())
      .then((d) => setMachines(d.machines as Machine[]))
      .catch(() => setMachines([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  /**
   * 검색 버튼 · 엔터 — 디바운스를 기다리지 않고 지금 조회한다.
   *
   * 뜨고 있는 타이머는 굳이 끄지 않는다. 300ms 뒤에 같은 값으로 한 번 더
   * setDebouncedQ 가 불리지만, 값이 같으면 React 가 리렌더를 건너뛰므로
   * 조회는 한 번이다.
   */
  const submitSearch = () => setDebouncedQ(q);

  /**
   * 지우기 — 화면의 값과 조회에 쓰인 값을 **함께** 비운다.
   *
   * setQ 만 하면 목록은 300ms 뒤에야 돌아온다. 버튼을 누른 사람에게 그 사이는
   * "안 먹었다" 로 읽히므로, 누르는 즉시 전체 목록으로 돌린다.
   */
  const clearSearch = () => {
    setQ('');
    setDebouncedQ('');
  };

  /**
   * 조회에 실을 검색어. 공백만 적은 것은 검색이 아니다.
   *
   * load 의 의존성으로도 이 값을 쓴다 — debouncedQ 를 그대로 쓰면 뒤에 공백
   * 하나를 붙이는 것만으로 같은 결과를 다시 받아 온다.
   */
  const term = debouncedQ.trim();

  const load = useCallback(async () => {
    const filter = KIND_FILTERS.find((f) => f.key === kindKey);
    // sinceHours 를 **빼면** 기간 조건이 없는 조회입니다 ('전체').
    const params = new URLSearchParams({ limit: '80' });
    if (hours !== null) params.set('sinceHours', String(hours));
    if (filter?.kinds) params.set('kind', filter.kinds.join(','));
    if (machineId !== '') params.set('machineId', String(machineId));
    if (term) params.set('q', term);

    setLoading(true);
    try {
      const data = await fetch(`/api/reports?${params}`).then((r) => r.json());
      setReports((data.reports as MachineReport[]) ?? []);
      setFetchedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [kindKey, hours, machineId, term]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 제보 삭제 — 관리자만. 지운 행을 그 자리에서 빼고 목록을 다시 받지 않는다:
   * 30초 자동 갱신과 겹쳐 스크롤이 튀는 것보다 한 줄이 사라지는 게 낫다.
   */
  const removeReport = async (r: MachineReport) => {
    if (!confirm(`${r.arcadeName} · ${r.machineShortName} 제보를 삭제할까요?`)) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) {
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      return;
    }
    const data = await res.json().catch(() => null);
    alert(data?.error ?? '삭제에 실패했습니다');
  };

  // 대기 인원은 몇 분 만에 뒤집히므로 열어 둔 화면이 조용히 낡지 않게 한다.
  useEffect(() => {
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  /**
   * 목록이 비었을 때의 문구.
   *
   * 검색 중이라면 "해당 조건의 제보가 없습니다" 로는 다음에 뭘 해야 할지 알 수
   * 없습니다. 기본 기간이 **최근 24시간** 이라서, 찾는 말이 맞는데도 기간에
   * 걸려 비는 경우가 검색이 빈 경우의 대부분입니다 — 대기 제보는 4시간이면
   * 지워지고 컨디션·기종 변동은 몇 달 전 것도 남아 있으니까요. 그래서 무엇이
   * 없는지와 어디를 넓히면 되는지를 같이 알립니다.
   *
   * 화면에 적혀 있는 q 가 아니라 실제로 조회에 쓴 term 을 씁니다 — 타이핑 중에
   * 아직 찾아보지도 않은 말로 "없습니다" 라고 하면 거짓말이 됩니다.
   */
  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label ?? null;
  const emptyMessage = !term
    ? '해당 조건의 제보가 없습니다.'
    : hours === null || rangeLabel === null
      ? `'${term}' 검색 결과가 없습니다.`
      : `'${term}' 검색 결과가 최근 ${rangeLabel} 안에는 없습니다. 기간을 넓혀 보세요.`;

  return (
    <div className="feed-page">
      <header className="feed-head">
        <div>
          <h1>실시간 제보</h1>
          <p className="muted small">
            대기 인원 · 기체 컨디션 · 기종 변동. {Math.round(REFRESH_MS / 1000)}초마다 자동
            갱신됩니다
            {fetchedAt !== null && ` · 마지막 갱신 ${timeAgo(new Date(fetchedAt).toISOString())}`}
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void load()}>
          새로고침
        </button>
      </header>

      {/* <form> 인 이유는 엔터다 — 검색 버튼이 옆에 있으면 엔터로도 눌리기를
          기대하게 되고, form 의 기본 동작이 그걸 공짜로 해 준다. onKeyDown 에
          Enter 를 따로 적으면 같은 일을 버튼과 두 곳에서 관리하게 된다. */}
      <form className="list-search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
        <input
          className="search"
          type="search"
          aria-label="제보 검색"
          placeholder="오락실 이름 · 기종 · 메모 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary">
          검색
        </button>
        {/* 값이 없을 때 **감추지 않고 끈다** — 감추면 나타나고 사라질 때마다
            오른쪽의 건수 칸이 밀려서, 글자를 치는 중에 줄이 흔들린다
            (app/globals.css 의 .list-search-count 주석과 같은 이유). */}
        <button type="button" className="btn btn-sm" disabled={q === ''} onClick={clearSearch}>
          지우기
        </button>
      </form>

      <div className="feed-filters">
        <div className="seg">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={f.key === kindKey ? 'is-on' : ''}
              onClick={() => setKindKey(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={hours === null ? ALL_TIME : String(hours)}
          onChange={(e) => setHours(e.target.value === ALL_TIME ? null : Number(e.target.value))}
        >
          {RANGES.map((r) => (
            <option key={r.label} value={r.hours === null ? ALL_TIME : String(r.hours)}>
              {/* '전체' 앞에 '최근' 을 붙이면 "최근 전체" 가 된다 */}
              {r.hours === null ? '전체 기간' : `최근 ${r.label}`}
            </option>
          ))}
        </select>

        <select
          value={machineId}
          onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">모든 기종</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {loading && reports.length === 0 ? (
        <p className="muted pad">불러오는 중…</p>
      ) : reports.length === 0 ? (
        <p className="muted pad">{emptyMessage}</p>
      ) : (
        <ul className="feed">
          {reports.map((r) => (
            <li key={r.id}>
              <span className={`kind kind-${r.kind}`}>{REPORT_KIND_LABEL[r.kind]}</span>

              <span className="feed-body">
                <Link href={`/?arcade=${r.arcadeId}`} className="feed-arcade">
                  {r.arcadeName}
                </Link>
                <strong className="feed-machine">
                  {r.machineShortName}
                  {/* 컨디션은 기체 단위 — 어느 호기 얘기인지 없으면 2대짜리
                      오락실에서는 쓸모가 절반으로 준다. 옛 제보는 기록이 없어 빈칸. */}
                  {r.cabinetNo !== null && <em className="feed-cabinet">{r.cabinetNo}호기</em>}
                </strong>
                {/* 구간은 기체당 인원으로 정해진다 — 대수를 함께 넘겨야 상세
                    화면과 같은 문구가 나온다 (lib/community-types.ts WAIT_LEVELS) */}
                {r.kind === 'queue' && r.waitCount !== null && (
                  <span className={`wait wait-${waitLevel(r.waitCount, r.cabinetCount).tone}`}>
                    <strong>{waitCountLabel(r.waitCount)}</strong>
                    <em>{waitLevel(r.waitCount, r.cabinetCount).label}</em>
                  </span>
                )}
                {r.kind === 'condition' && r.condition !== null && (
                  <span className={`cond-live cond-${r.condition}`}>{r.condition}/5</span>
                )}
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
  );
}
