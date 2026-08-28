/**
 * 챗봇이 쓰는 **앱 안쪽 도구들**.
 *
 * 모델에게 이 앱의 DB 를 통째로 열어 주는 대신, 화면이 이미 쓰고 있는 조회
 * 함수(lib/arcades.ts · lib/reports.ts · lib/board.ts)를 그대로 감싸 세 개만
 * 내줍니다. 같은 함수를 쓰므로 **챗봇이 말하는 값과 화면에 뜨는 값이 어긋날
 * 수 없습니다** — 챗봇 전용 SQL 을 따로 쓰면 집계 규칙이 두 벌이 됩니다.
 *
 * 반환값은 모델이 읽을 요약 JSON 입니다. 전체 레코드를 그대로 실으면 한 번
 * 검색에 수십 KB 가 들어가 대화가 금방 컨텍스트를 넘깁니다.
 *
 * ⚠ 서버 전용입니다 (getDb → fs). 클라이언트에서 import 하지 마세요.
 */

import { listArcades, listMachines } from './arcades';
import { listPosts } from './board';
import { listReports } from './reports';
import type { ReportKind } from './community-types';
import type { Arcade } from './types';

/** 도구 하나가 돌려주는 건수 상한 — 모델이 읽을 분량을 넘기지 않기 위한 것 */
const MAX_ROWS = 8;

/**
 * "펌프" · "Pump It Up" · "PIU" 중 무엇으로 물어도 같은 기종을 찾습니다.
 * 모델이 기종 id 를 알 리 없으므로 이름으로 받고 여기서 옮깁니다.
 */
async function resolveMachineIds(name: string | null | undefined): Promise<number[]> {
  if (!name || !name.trim()) return [];
  const needle = name.trim().toLowerCase();
  const machines = await listMachines();
  const hit = machines.filter(
    (m) =>
      m.name.toLowerCase().includes(needle) ||
      m.shortName.toLowerCase().includes(needle) ||
      needle.includes(m.shortName.toLowerCase()),
  );
  return hit.map((m) => m.id);
}

function hoursOf(a: Arcade): string {
  if (a.is24h) return '24시간';
  if (a.openTime && a.closeTime) return `${a.openTime}~${a.closeTime}`;
  return '미등록';
}

/** 오락실 1건을 모델이 읽을 만큼만 납작하게 */
function summarizeArcade(a: Arcade) {
  return {
    name: a.name,
    address: a.address,
    hours: hoursOf(a),
    rating: a.ratingAvg === null ? null : `${a.ratingAvg.toFixed(1)} (${a.reviewCount}건)`,
    machines: a.machines.map((m) => ({
      name: m.name,
      cabinets: m.cabinetCount,
      // 화면과 같은 값 — 등록값과 제보를 종합해 뷰가 반올림한 정수입니다.
      condition: m.cabinets
        .map((c) => c.conditionSummary?.value ?? null)
        .filter((v): v is number => v !== null),
      // 수명 안의 제보가 없으면 아예 담지 않습니다. 0 으로 채우면
      // "지금 줄 없음" 이라는 없는 정보가 생깁니다.
      waitNow: m.live?.waitCount ?? undefined,
    })),
    note: a.note ?? undefined,
  };
}

export interface ArcadeSearchArgs {
  query?: string | null;
  machine?: string | null;
}

export async function searchArcades(args: ArcadeSearchArgs): Promise<unknown> {
  const machineIds = await resolveMachineIds(args.machine);
  if (args.machine && machineIds.length === 0) {
    return { error: `'${args.machine}' 이라는 기종을 찾지 못했습니다`, arcades: [] };
  }

  const arcades = await listArcades({
    q: args.query ?? null,
    machineIds: machineIds.length ? machineIds : null,
  });

  return {
    total: arcades.length,
    // 좌표 기준 조회가 아니므로 거리는 없습니다 — 순위는 지도 화면이 냅니다.
    arcades: arcades.slice(0, MAX_ROWS).map(summarizeArcade),
    truncated: arcades.length > MAX_ROWS,
  };
}

export interface ReportSearchArgs {
  machine?: string | null;
  kind?: ReportKind | null;
  sinceHours?: number | null;
}

/**
 * 실시간 제보 피드 (/live 와 같은 소스).
 *
 * 대기 제보는 4시간 뒤에 실제로 삭제되므로(lib/reports.ts), 여기서 안 나온다는
 * 것은 "줄이 없다" 가 아니라 "최근 제보가 없다" 입니다. 그 차이를 모델이
 * 헷갈리지 않게 응답에 적어 둡니다.
 */
export async function searchReports(args: ReportSearchArgs): Promise<unknown> {
  const machineIds = await resolveMachineIds(args.machine);
  const reports = await listReports({
    machineId: machineIds[0] ?? null,
    kinds: args.kind ? [args.kind] : null,
    sinceHours: args.sinceHours ?? 24,
    limit: MAX_ROWS,
  });

  return {
    note: '제보가 없다는 것은 "상태가 좋다"가 아니라 "최근 제보가 없다"는 뜻입니다. 대기 제보는 4시간 뒤 삭제됩니다.',
    reports: reports.map((r) => ({
      arcade: r.arcadeName,
      machine: r.machineName,
      cabinet: r.cabinetNo ? `${r.cabinetNo}호기` : undefined,
      kind: r.kind,
      waitCount: r.waitCount ?? undefined,
      condition: r.condition ?? undefined,
      comment: r.comment ?? undefined,
      by: r.nickname ?? '익명',
      at: r.createdAt,
    })),
  };
}

export interface PostSearchArgs {
  query?: string | null;
  machine?: string | null;
}

/** 커뮤니티 게시판 (/community 와 같은 소스) */
export async function searchPosts(args: PostSearchArgs): Promise<unknown> {
  const machineIds = await resolveMachineIds(args.machine);
  const { posts, total } = await listPosts({
    machineId: machineIds[0] ?? null,
    q: args.query ?? null,
    sort: 'recent',
    limit: MAX_ROWS,
  });

  return {
    total,
    posts: posts.map((p) => ({
      title: p.title,
      // 게임 없는 공지는 '공지' 로 — null 을 그대로 주면 답변에 "게임: null" 이 샌다
      game: p.machineShortName ?? '공지',
      category: p.categoryLabel,
      excerpt: p.excerpt,
      by: p.nickname,
      likes: p.likeCount,
      comments: p.commentCount,
      at: p.createdAt,
    })),
  };
}
