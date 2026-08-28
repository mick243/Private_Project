import { getDb, type Queryable } from './db';
import type { MachineReport, PresenceOutcome, ReportKind } from './community-types';

/**
 * 기종 제보 — "이 게임 있어요" / "없어졌어요" / "지금 대기 N명" / "컨디션".
 *
 * 네 종류를 한 테이블에 담는 이유: 넷 다 (오락실, 기종, 누가, 언제) 가 본체이고
 * 다른 건 페이로드 한 칸뿐입니다. 테이블을 넷으로 쪼개면 "이 오락실 최근 제보"
 * 같은 화면이 4-way UNION 이 됩니다.
 */

export interface ReportSettings {
  queueTtlMinutes: number;
  conditionWindowDays: number;
  presenceThreshold: number;
}

export interface ReportInput {
  arcadeId: number;
  machineId: number;
  /**
   * 컨디션 제보가 가리키는 기체. 컨디션이면 필수이고 나머지 종류는 null 입니다
   * — 대기는 기종 단위이고, 있어요/없어졌어요는 기종 자체에 대한 제보입니다.
   */
  cabinetId: number | null;
  /** null = 익명 제보 */
  playerId: number | null;
  kind: ReportKind;
  waitCount: number | null;
  condition: number | null;
  comment: string | null;
}

export interface CreateReportResult {
  report: MachineReport;
  /** 임계값이 차서 arcade_machines 가 실제로 바뀌었으면 그 방향 */
  outcome: PresenceOutcome;
  /** presence/absence 제보일 때 "몇 명 중 몇 명" — UI 에 진행도를 보여주기 위해 */
  support: { count: number; threshold: number } | null;
}

/** 등록되지 않은 기종에 대기/컨디션 제보가 들어온 경우 */
export class MachineNotAtArcadeError extends Error {
  constructor() {
    super('그 오락실에 등록되지 않은 기종입니다. 먼저 "이 게임 있어요" 로 제보해 주세요.');
  }
}

/**
 * 컨디션 제보가 가리키는 기체가 없는 경우.
 *
 * 화면을 열어 둔 사이에 누가 대수를 줄이면 사라진 호기에 제보가 날아온다.
 * 다른 기체로 옮겨 붙이지 않는다 — 2호기 얘기를 1호기에 적는 셈이 된다.
 */
export class CabinetNotFoundError extends Error {
  constructor() {
    super('그 기체를 찾을 수 없습니다. 목록이 바뀌었을 수 있으니 새로고침 후 다시 시도해 주세요.');
  }
}

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 수명이 지난 대기 제보를 **지운다**.
 *
 * 대기 인원은 되돌아볼 값이 아니라 지나면 그냥 틀린 값이다. 20시간 전 "대기 5명"
 * 은 아무에게도 쓸모가 없는데, 남겨 두면 전국 피드의 '최근 24시간' 을 채워
 * 방금 올라온 제보를 밀어낸다. 컨디션·있어요/없어졌어요는 누적이 근거가 되므로
 * 그대로 둔다 — 지우는 건 queue 뿐이다.
 *
 * 별도 스케줄러가 없으므로 **제보를 쓸 때와 피드를 읽을 때** 함께 돈다. 서버가
 * 놀고 있는 동안에는 남아 있다가 다음 요청에 정리된다. 그 사이에도 화면에는
 * 안 보인다 — machine_live 뷰가 같은 설정값으로 한 번 더 거른다.
 *
 * 기준 시각은 앱이 아니라 DB 의 now() 다. 두 곳에서 시간을 재면 서버 시계가
 * 조금만 어긋나도 뷰에는 보이는데 이미 지워진 행이 생긴다.
 */
export async function purgeExpiredQueueReports(): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM machine_reports r
     USING report_settings cfg
     WHERE cfg.id = 1
       AND r.kind = 'queue'
       AND r.created_at <= now() - make_interval(mins => cfg.queue_ttl_minutes)
     RETURNING r.id`,
  );
  return rows.length;
}

export async function getReportSettings(): Promise<ReportSettings> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT queue_ttl_minutes, condition_window_days, presence_threshold
     FROM report_settings WHERE id = 1`,
  );
  const r = rows[0] ?? {};
  return {
    // fallback 은 schema-community.sql 의 DEFAULT 와 같은 값이어야 합니다.
    queueTtlMinutes: num(r.queue_ttl_minutes) ?? 240,
    conditionWindowDays: num(r.condition_window_days) ?? 30,
    presenceThreshold: num(r.presence_threshold) ?? 2,
  };
}

const FEED_SELECT = `
  SELECT r.id, r.arcade_id, r.machine_id, r.cabinet_id, r.player_id, r.kind,
         r.wait_count, r.condition, r.comment, r.created_at,
         a.name         AS arcade_name,
         m.name         AS machine_name,
         m.short_name   AS machine_short_name,
         c.cabinet_no   AS cabinet_no,
         p.nickname     AS nickname,
         -- 대기 구간이 기체당 인원으로 정해지므로(lib/community-types.ts
         -- WAIT_LEVELS) 피드도 대수를 알아야 상세와 같은 문구가 나온다.
         (SELECT COUNT(*)::int FROM arcade_cabinets ac
           WHERE ac.arcade_id = r.arcade_id AND ac.machine_id = r.machine_id) AS cabinet_count
  FROM machine_reports r
  JOIN arcades  a ON a.id = r.arcade_id
  JOIN machines m ON m.id = r.machine_id
  -- 컨디션 제보만 기체를 가리킨다. 기체가 지워진 옛 제보도 여기서 null 이 된다.
  LEFT JOIN arcade_cabinets c ON c.id = r.cabinet_id
  LEFT JOIN players p ON p.id = r.player_id`;

function toReport(r: Record<string, unknown>): MachineReport {
  return {
    id: num(r.id)!,
    arcadeId: num(r.arcade_id)!,
    arcadeName: r.arcade_name as string,
    machineId: num(r.machine_id)!,
    machineName: r.machine_name as string,
    machineShortName: r.machine_short_name as string,
    cabinetId: num(r.cabinet_id),
    cabinetNo: num(r.cabinet_no),
    cabinetCount: num(r.cabinet_count) ?? 0,
    playerId: num(r.player_id),
    nickname: (r.nickname as string) ?? null,
    kind: r.kind as ReportKind,
    waitCount: num(r.wait_count),
    condition: num(r.condition),
    comment: (r.comment as string) ?? null,
    createdAt: iso(r.created_at),
  };
}

export interface ListReportsParams {
  arcadeId?: number | null;
  machineId?: number | null;
  kinds?: ReportKind[] | null;
  /** 이 시간 안의 제보만 (전국 피드 기본값용) */
  sinceHours?: number | null;
  /**
   * 오락실 이름 · 기종 이름 · 메모 부분 일치 (피드 검색창).
   *
   * 화면에 보이는 것만 찾습니다 — 피드 한 줄이 곧 (오락실, 기종, 메모) 라서,
   * 눈에 보이는 글자로 찾았는데 안 나오거나 안 보이는 글자로 걸리는 일이 없어야
   * 합니다. 닉네임은 넣지 않았습니다: 검색은 "지금 저기 어때요" 를 찾는 도구이고,
   * 사람 이름으로 제보를 모아 보는 건 다른 기능입니다.
   *
   * 기종은 셀렉트로도 좁힐 수 있지만 여기에도 넣습니다 — 짧은 이름('사볼')과
   * 정식 이름('SOUND VOLTEX') 둘 다 받으므로, 목록에서 고르는 것보다 타이핑이
   * 빠른 사람의 길을 막지 않습니다.
   *
   * ⚠ **인덱스를 타지 않는 조건입니다.** 찾을 글자가 arcades·machines·
   *   machine_reports 세 테이블에 흩어져 OR 로 묶이는데, 여러 테이블에 걸친
   *   OR 은 비트맵으로 합칠 수 없어서 trigram 인덱스를 걸어도 플래너가 쓰지
   *   못합니다 (글 검색이 인덱스를 타는 것은 제목·본문이 같은 테이블에 있기
   *   때문입니다 — db/migrate-042). 그래서 인덱스를 만들지 않았습니다.
   *
   *   실제로는 기간 조건이 먼저 좁혀 줍니다 (machine_reports_feed_idx 의
   *   created_at). 기본값인 최근 24시간이면 훑는 행이 그 창 안으로 제한되고,
   *   기간을 '전체' 로 둔 검색만 전체 스캔입니다. 그게 문제가 될 만큼 제보가
   *   쌓이면 손볼 곳은 인덱스가 아니라 조건의 모양입니다 — 이름을 제보 행에
   *   비정규화해 한 테이블 안에서 찾게 만드는 쪽입니다.
   */
  q?: string | null;
  limit?: number;
}

export async function listReports(params: ListReportsParams): Promise<MachineReport[]> {
  const db = await getDb();
  const {
    arcadeId = null,
    machineId = null,
    kinds = null,
    sinceHours = null,
    q = null,
    limit = 50,
  } = params;

  // 빈 검색어는 조건을 걸지 않는 것과 같다 — null 로 내려 아래 IS NULL 분기를
  // 타게 한다. `ILIKE '%%'` 로 모든 행을 통과시키면 인덱스만 못 타고 결과는 같다.
  const term = q && q.trim() ? q.trim() : null;

  // 피드를 읽는 김에 수명이 다한 대기 제보를 치운다. 스케줄러가 없으므로
  // "누군가 볼 때 정리한다" 가 이 앱에서 가장 확실한 시점이다.
  await purgeExpiredQueueReports();

  const { rows } = await db.query<Record<string, unknown>>(
    `${FEED_SELECT}
     WHERE ($1::int  IS NULL OR r.arcade_id  = $1::int)
       AND ($2::int  IS NULL OR r.machine_id = $2::int)
       AND ($3::text[] IS NULL OR r.kind = ANY($3::text[]))
       AND ($4::int  IS NULL OR r.created_at > now() - make_interval(hours => $4::int))
       AND ($6::text IS NULL
            OR a.name       ILIKE '%' || $6::text || '%'
            OR m.name       ILIKE '%' || $6::text || '%'
            OR m.short_name ILIKE '%' || $6::text || '%'
            OR r.comment    ILIKE '%' || $6::text || '%')
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $5::int`,
    [arcadeId, machineId, kinds && kinds.length ? kinds : null, sinceHours, limit, term],
  );
  return rows.map(toReport);
}

/**
 * 제보 한 건을 지운다 (관리자 전용 — app/api/reports/[id]/route.ts).
 *
 * append-only 로그에 구멍을 내는 유일한 경로다. 장난 제보나 개인정보가 섞인
 * 메모는 남겨 둘 수 없는데, 제보는 수정할 수단이 없어서 지우는 것 말고는
 * 손댈 방법이 없다.
 *
 * ⚠ 지운다고 arcade_machines 가 되돌아가지는 않는다. 있어요/없어졌어요의 자동
 *   반영은 제보가 들어온 그 순간에 한 번 계산되고 끝나므로(applyPresence),
 *   근거가 된 제보를 나중에 지워도 이미 붙거나 빠진 기종은 그대로다. 잘못
 *   반영된 기종은 오락실 수정(관리자 전용)에서 직접 되돌린다 — 제보 삭제가
 *   조용히 지도를 바꾸는 쪽이 더 위험하다.
 */
export async function deleteReport(id: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM machine_reports WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

/**
 * 있어요/없어졌어요 제보를 세어 임계값을 넘으면 arcade_machines 를 갱신한다.
 *
 * 세는 구간은 "반대 제보가 마지막으로 들어온 뒤" 다. 이걸 안 잡으면 3년 전
 * '있어요' 2건이 오늘의 '없어졌어요' 를 영구히 이기고, 기종이 빠진 오락실을
 * 지도에서 지울 수 없게 된다.
 *
 * 익명 제보(player_id IS NULL)는 세지 않는다 — 한 사람이 새로고침만 해도
 * 임계값을 채울 수 있으면 임계값이 아무 의미가 없다. 제보 자체는 남는다.
 */
async function applyPresence(
  tx: Queryable,
  arcadeId: number,
  machineId: number,
  kind: 'presence' | 'absence',
  threshold: number,
): Promise<{ count: number; outcome: PresenceOutcome }> {
  const opposite = kind === 'presence' ? 'absence' : 'presence';

  const { rows } = await tx.query<{ count: unknown }>(
    `SELECT COUNT(DISTINCT r.player_id)::int AS count
     FROM machine_reports r
     WHERE r.arcade_id = $1 AND r.machine_id = $2 AND r.kind = $3
       AND r.player_id IS NOT NULL
       AND r.created_at > COALESCE((
             SELECT MAX(o.created_at) FROM machine_reports o
             WHERE o.arcade_id = $1 AND o.machine_id = $2 AND o.kind = $4
           ), '-infinity'::timestamptz)`,
    [arcadeId, machineId, kind, opposite],
  );
  const count = num(rows[0]?.count) ?? 0;
  if (count < threshold) return { count, outcome: null };

  if (kind === 'presence') {
    // 이미 등록돼 있으면 아무 일도 일어나지 않는다 (outcome = null).
    const { rows: added } = await tx.query<{ arcade_id: number }>(
      `INSERT INTO arcade_machines (arcade_id, machine_id) VALUES ($1, $2)
       ON CONFLICT (arcade_id, machine_id) DO NOTHING
       RETURNING arcade_id`,
      [arcadeId, machineId],
    );
    if (added.length) {
      // 기체가 0대면 화면에 카드가 하나도 없어 컨디션 제보를 받을 자리가 없다.
      // 몇 대인지는 아무도 제보하지 않았으므로 1대로 시작하고, 나머지는
      // 오락실 수정에서 늘린다.
      await tx.query(
        `INSERT INTO arcade_cabinets (arcade_id, machine_id, cabinet_no) VALUES ($1, $2, 1)
         ON CONFLICT (arcade_id, machine_id, cabinet_no) DO NOTHING`,
        [arcadeId, machineId],
      );
    }
    return { count, outcome: added.length ? 'added' : null };
  }

  const { rows: removed } = await tx.query<{ arcade_id: number }>(
    `DELETE FROM arcade_machines WHERE arcade_id = $1 AND machine_id = $2
     RETURNING arcade_id`,
    [arcadeId, machineId],
  );
  return { count, outcome: removed.length ? 'removed' : null };
}

export async function createReport(input: ReportInput): Promise<CreateReportResult> {
  const db = await getDb();
  const { presenceThreshold } = await getReportSettings();

  // 새 제보가 들어오는 김에 낡은 대기 제보를 치운다 (읽기 경로는 listReports).
  await purgeExpiredQueueReports();

  // 대기/컨디션은 "그 오락실에 그 기종이 있다"는 전제 위에서만 의미가 있다.
  // 없는 기종의 대기 제보를 받아두면 machine_live 에 아무도 볼 수 없는 행이 쌓인다.
  if (input.kind === 'queue' || input.kind === 'condition') {
    const { rows } = await db.query(
      `SELECT 1 FROM arcade_machines WHERE arcade_id = $1 AND machine_id = $2`,
      [input.arcadeId, input.machineId],
    );
    if (rows.length === 0) throw new MachineNotAtArcadeError();
  }

  // 컨디션은 기체 1대에 대한 제보다. id 만 믿지 않고 그 기체가 정말 이 오락실의
  // 이 기종인지 확인한다 — 남의 오락실 기체 id 를 보내면 화면에 뜨지도 않을
  // 제보가 그쪽 집계에 섞인다.
  if (input.kind === 'condition') {
    const { rows } = await db.query(
      `SELECT 1 FROM arcade_cabinets
       WHERE id = $1 AND arcade_id = $2 AND machine_id = $3`,
      [input.cabinetId, input.arcadeId, input.machineId],
    );
    if (rows.length === 0) throw new CabinetNotFoundError();
  }

  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO machine_reports
         (arcade_id, machine_id, cabinet_id, player_id, kind, wait_count, condition, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.arcadeId,
        input.machineId,
        input.cabinetId,
        input.playerId,
        input.kind,
        input.waitCount,
        input.condition,
        input.comment,
      ],
    );
    const id = rows[0].id;

    let outcome: PresenceOutcome = null;
    let support: CreateReportResult['support'] = null;

    if (input.kind === 'presence' || input.kind === 'absence') {
      const applied = await applyPresence(
        tx,
        input.arcadeId,
        input.machineId,
        input.kind,
        presenceThreshold,
      );
      outcome = applied.outcome;
      support = { count: applied.count, threshold: presenceThreshold };
    }

    const { rows: full } = await tx.query<Record<string, unknown>>(
      `${FEED_SELECT} WHERE r.id = $1`,
      [id],
    );
    return { report: toReport(full[0]), outcome, support };
  });
}
