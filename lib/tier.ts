import { cacheReference } from './cache';
import { listComments } from './comments';
import { getDb } from './db';
import {
  SPECIAL_CODE,
  UNDECIDED_CODE,
  UNIQUE_CODE,
  tierCodeOf,
} from './tier-types';
import type {
  ChartDetail,
  ChartSummary,
  GameMode,
  Player,
  TierBoard,
  TierGame,
  TierGrade,
  TierGroup,
  TierLevelOption,
  TierSettings,
} from './tier-types';

/** 게임을 지정하지 않았을 때의 기본값 (Pump It Up). listGames() 의 첫 항목과 같습니다. */
export const DEFAULT_MACHINE_ID = 1;

// 상태 코드와 특수 패턴 판정 규칙은 lib/tier-types.ts 에 있습니다 —
// 화면(ChartDetailPanel)도 같은 규칙을 써야 하고, 그 파일은 DB 를 물지 않습니다.
export { SPECIAL_CODE, UNDECIDED_CODE, UNIQUE_CODE } from './tier-types';

/** NUMERIC 컬럼은 드라이버에 따라 문자열로 올 수 있어 항상 통과시킨다. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getSettings(machineId = DEFAULT_MACHINE_ID): Promise<TierSettings> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT * FROM tier_settings WHERE machine_id = $1`,
    [machineId],
  );
  if (!rows[0]) throw new Error(`tier_settings 에 machine_id=${machineId} 설정이 없습니다`);
  const r = rows[0];
  return {
    machineId,
    voteMin: num(r.vote_min)!,
    voteMax: num(r.vote_max)!,
    voteStep: num(r.vote_step)!,
    tierStep: num(r.tier_step)!,
    minVotes: num(r.min_votes)!,
    minConvergence: num(r.min_convergence)!,
    specialMin: num(r.special_min)!,
    chartBasis: (r.chart_basis as string | null) ?? null,
    modeIsDifficulty: Boolean(r.mode_is_difficulty),
  };
}

export async function getGrades(machineId = DEFAULT_MACHINE_ID): Promise<TierGrade[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT code, label, anchor, sort_order FROM tier_grades
     WHERE machine_id = $1 ORDER BY sort_order`,
    [machineId],
  );
  return rows.map((r) => ({
    code: r.code as string,
    label: r.label as string,
    anchor: num(r.anchor)!,
    sortOrder: num(r.sort_order)!,
  }));
}

/**
 * 서열표가 있는 게임 목록.
 *
 * "기종 마스터에 있는 모든 게임"이 아니라 tier_settings 가 등록된 게임만입니다.
 * 등급 구간표와 임계값이 없으면 서열표를 계산할 수 없고, 인형뽑기까지 게임
 * 선택기에 올라오면 고를 수 없는 항목이 대부분이 됩니다.
 */
async function listGamesUncached(): Promise<TierGame[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT m.id, m.name, m.short_name,
            COALESCE((
              SELECT COUNT(*) FROM charts c
              JOIN songs s ON s.id = c.song_id
              WHERE s.machine_id = m.id
            ), 0)::int AS chart_count,
            COALESCE((
              SELECT json_agg(json_build_object('code', mm.code, 'label', mm.label)
                              ORDER BY mm.sort_order)
              FROM machine_modes mm WHERE mm.machine_id = m.id
            ), '[]'::json) AS modes
     FROM machines m
     JOIN tier_settings ts ON ts.machine_id = m.id
     ORDER BY m.id`,
  );

  return rows.map((r) => ({
    machineId: num(r.id)!,
    name: r.name as string,
    shortName: r.short_name as string,
    chartCount: num(r.chart_count)!,
    modes: (typeof r.modes === 'string' ? JSON.parse(r.modes) : r.modes) as GameMode[],
  }));
}

/**
 * 서열표를 제공하는 게임 목록.
 *
 * 채보 수를 세는 상관 서브쿼리가 둘 붙어 있는데, songs·charts 는 적재 스크립트로만
 * 채우는 참조 데이터라 캐시한다 (근거는 lib/cache.ts).
 * getGame() 도 이 함수를 거치므로 서열표 조회 경로 전체가 함께 덕을 본다.
 */
export const listGames = cacheReference(listGamesUncached, 'tier-games');

async function getGame(machineId: number): Promise<TierGame> {
  const games = await listGames();
  const game = games.find((g) => g.machineId === machineId);
  if (!game) throw new Error(`machine_id=${machineId} 에는 서열표 설정이 없습니다`);
  return game;
}

/**
 * 모드 코드 → 표기. machine_modes 에 없는 코드는 그대로 보여준다.
 * mode 가 null 이면 난이도 미표기라 붙일 표기가 없다 (migrate-047).
 */
function modeLabelOf(game: TierGame, mode: string | null): string | null {
  if (mode === null) return null;
  return game.modes.find((m) => m.code === mode)?.label ?? mode;
}

/** 서열표를 만들 수 있는 (모드, 레벨) 조합 */
async function listLevelsUncached(machineId: number): Promise<TierLevelOption[]> {
  const db = await getDb();

  // 난이도 축인 게임(사볼)은 레벨만으로 보드가 정해지므로 (모드, 레벨) 로 쪼개지 않는다.
  const { modeIsDifficulty } = await getSettings(machineId);
  if (modeIsDifficulty) {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT c.level, COUNT(*)::int AS chart_count
         FROM charts c
         JOIN songs s ON s.id = c.song_id
        WHERE s.machine_id = $1
        GROUP BY c.level
        ORDER BY c.level`,
      [machineId],
    );
    return rows.map((r) => ({
      mode: null,
      level: num(r.level)!,
      chartCount: num(r.chart_count)!,
    }));
  }

  const { rows } = await db.query<Record<string, unknown>>(
    // 알파벳순이면 Double 이 Single 보다 앞에 온다. machine_modes.sort_order 로 고정.
    // 등록되지 않은 모드 코드는 뒤로 밀되 목록에서 빼지는 않는다.
    `SELECT c.mode, c.level, COUNT(*)::int AS chart_count
     FROM charts c
     JOIN songs s ON s.id = c.song_id
     LEFT JOIN machine_modes mm ON mm.machine_id = s.machine_id AND mm.code = c.mode
     WHERE s.machine_id = $1
     GROUP BY c.mode, c.level, mm.sort_order
     ORDER BY mm.sort_order NULLS LAST, c.mode, c.level`,
    [machineId],
  );
  return rows.map((r) => ({
    mode: r.mode as string,
    level: num(r.level)!,
    chartCount: num(r.chart_count)!,
  }));
}

const listLevelsCached = cacheReference(listLevelsUncached, 'tier-levels');

/**
 * 그 게임에서 서열표를 만들 수 있는 (모드, 레벨) 조합.
 *
 * 기본값을 캐시 바깥에서 채워 넘긴다 — Next 는 인자를 그대로 캐시 키에 넣으므로
 * `listLevels()` 와 `listLevels(DEFAULT_MACHINE_ID)` 를 그냥 두면 같은 데이터가
 * 서로 다른 키로 두 벌 쌓인다.
 */
export function listLevels(machineId = DEFAULT_MACHINE_ID): Promise<TierLevelOption[]> {
  return listLevelsCached(machineId);
}

const CHART_SELECT = `
  SELECT c.id, s.title, s.artist, s.machine_id, c.mode, c.level,
         c.vote_count, c.avg_vote, c.convergence, c.tier_code, c.special_count,
         (cr.player_id IS NOT NULL) AS my_clear,
         dv.value AS my_vote,
         (sm.player_id IS NOT NULL) AS my_special
  FROM charts c
  JOIN songs s ON s.id = c.song_id
  LEFT JOIN clear_records    cr ON cr.chart_id = c.id AND cr.player_id = $1::int
  LEFT JOIN difficulty_votes dv ON dv.chart_id = c.id AND dv.player_id = $1::int
  LEFT JOIN special_marks    sm ON sm.chart_id = c.id AND sm.player_id = $1::int`;

function toSummary(r: Record<string, unknown>): ChartSummary {
  return {
    id: num(r.id)!,
    title: r.title as string,
    artist: (r.artist as string) ?? null,
    mode: (r.mode as string) ?? null,
    level: num(r.level)!,
    voteCount: num(r.vote_count)!,
    avgVote: num(r.avg_vote),
    convergence: num(r.convergence),
    tierCode: (r.tier_code as string) ?? null,
    specialCount: num(r.special_count) ?? 0,
    myClear: Boolean(r.my_clear),
    myVote: num(r.my_vote),
    mySpecial: Boolean(r.my_special),
  };
}

export async function getTierBoard(params: {
  machineId?: number;
  /** null = 난이도 축인 게임 → 그 레벨의 모든 난이도를 한 보드에 담는다 */
  mode: string | null;
  level: number;
  playerId: number | null;
}): Promise<TierBoard> {
  const { machineId = DEFAULT_MACHINE_ID, mode, level, playerId } = params;
  const db = await getDb();

  const [settings, grades, game] = await Promise.all([
    getSettings(machineId),
    getGrades(machineId),
    getGame(machineId),
  ]);

  const { rows } = await db.query<Record<string, unknown>>(
    `${CHART_SELECT}
     WHERE s.machine_id = $2 AND ($3::text IS NULL OR c.mode = $3::text) AND c.level = $4
     -- 화면에 보이는 값(소수점 2자리)으로 줄을 세운다. 원본 평균으로 정렬하면
     -- 같은 '0.26' 끼리도 순서가 갈려 이유를 알 수 없는 배열이 된다.
     -- 등급 칸은 이 순서를 그대로 물려받으므로 왼쪽 위가 가장 높고
     -- 오른쪽 아래가 가장 낮다 (.tier-charts 가 flex-wrap 이라 줄바꿈되며 채워진다).
     --
     -- 동점이면 **먼저 배치된 곡이 왼쪽** — charts.id 가 서열표에 들어온 순서다.
     -- (stats_updated_at 은 못 쓴다. 전체 재계산이 모든 채보를 같은 시각으로
     --  덮어써서 "먼저 배치" 를 잃는다.)
     --
     -- 투표가 아예 없는 채보는 '동점' 이 아니라 점수가 없는 것이라 제목순을
     -- 유지한다 — 수백 곡짜리 '미정' 칸에서 곡을 찾으려면 그쪽이 낫다.
     ORDER BY ROUND(c.avg_vote, 2) DESC NULLS LAST,
              CASE WHEN c.avg_vote IS NULL THEN NULL ELSE c.id END ASC NULLS LAST,
              s.title ASC,
              -- 한 레벨에 여러 난이도가 섞이는 게임(사볼)에서 제목까지 같을 때
              -- 순서가 흔들리지 않게 난이도 코드를 마지막 기준으로 둔다.
              -- 미표기(NULL)는 뒤로 — 아는 난이도를 먼저 보여준다.
              c.mode ASC NULLS LAST`,
    [playerId, machineId, mode, level],
  );
  const charts = rows.map(toSummary);

  // 등급별로 묶는다. 빈 등급도 자리를 유지해야 서열 구조가 보인다.
  const byCode = new Map<string, ChartSummary[]>();
  for (const chart of charts) {
    // 특수 패턴이 등급보다 앞선다 — 표시 인원이 임계값을 넘으면 투표와 무관하게 그 칸으로.
    const key = tierCodeOf(chart, settings);
    const bucket = byCode.get(key);
    if (bucket) bucket.push(chart);
    else byCode.set(key, [chart]);
  }

  const groups: TierGroup[] = [
    ...grades.map((g) => ({
      code: g.code,
      label: g.label,
      anchor: g.anchor,
      charts: byCode.get(g.code) ?? [],
    })),
    { code: UNIQUE_CODE, label: '개인차', anchor: null, charts: byCode.get(UNIQUE_CODE) ?? [] },
    {
      code: SPECIAL_CODE,
      label: '특수패턴',
      anchor: null,
      charts: byCode.get(SPECIAL_CODE) ?? [],
    },
    {
      code: UNDECIDED_CODE,
      label: '미정',
      anchor: null,
      charts: byCode.get(UNDECIDED_CODE) ?? [],
    },
  ];

  return {
    settings,
    game,
    mode,
    // 난이도 축인 게임은 보드가 한 난이도의 것이 아니므로 라벨도 없다.
    modeLabel: mode === null ? null : modeLabelOf(game, mode),
    level,
    groups,
    totalCharts: charts.length,
  };
}

export async function getChartDetail(
  chartId: number,
  playerId: number | null,
): Promise<ChartDetail | null> {
  const db = await getDb();
  // 설정/등급은 게임마다 다르므로 채보에서 machine_id 를 끌어와야 한다.
  // 기본값으로 읽으면 사볼 채보에 펌프의 7단계 등급표가 붙는다.
  const { rows } = await db.query<Record<string, unknown>>(
    `${CHART_SELECT} WHERE c.id = $2`,
    [playerId, chartId],
  );
  if (!rows[0]) return null;
  const machineId = num(rows[0].machine_id)!;

  // 분포는 익명 — 누가 몇 점 줬는지는 내보내지 않는다.
  const { rows: voteRows } = await db.query<{ value: unknown }>(
    `SELECT value FROM difficulty_votes WHERE chart_id = $1 ORDER BY value`,
    [chartId],
  );

  const [settings, grades, game, comments] = await Promise.all([
    getSettings(machineId),
    getGrades(machineId),
    getGame(machineId),
    listComments(chartId),
  ]);

  const summary = toSummary(rows[0]);
  return {
    ...summary,
    votes: voteRows.map((v) => num(v.value)!),
    grades,
    settings,
    machineId,
    machineName: game.name,
    modeLabel: modeLabelOf(game, summary.mode),
    comments,
  };
}

export async function listPlayers(): Promise<Player[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number; nickname: string }>(
    `SELECT id, nickname FROM players ORDER BY id`,
  );
  return rows.map((r) => ({ id: num(r.id)!, nickname: r.nickname }));
}

/** 투표 반영 후 반드시 호출. 캐시 컬럼(avg/convergence/tier_code)을 갱신한다. */
async function recalc(chartId: number): Promise<void> {
  const db = await getDb();
  await db.query(`SELECT recalc_chart_stats($1)`, [chartId]);
}

/** 클리어 기록 등록/해제. 해제하면 그 채보의 투표도 함께 사라진다(FK CASCADE). */
export async function setClear(
  playerId: number,
  chartId: number,
  cleared: boolean,
): Promise<void> {
  const db = await getDb();
  if (cleared) {
    await db.query(
      `INSERT INTO clear_records (player_id, chart_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [playerId, chartId],
    );
  } else {
    await db.query(`DELETE FROM clear_records WHERE player_id = $1 AND chart_id = $2`, [
      playerId,
      chartId,
    ]);
  }
  await recalc(chartId);
}

/**
 * 특수 패턴 표시 켜기/끄기 (사람별).
 *
 * 투표와 달리 값이 없습니다 — "기믹이 있다" 뿐이라 셀 것은 사람 수입니다.
 * 클리어 게이트도 없습니다 (평가란과 같은 이유 — 못 깨도 기믹은 보입니다).
 *
 * 인원 캐시(charts.special_count)를 갱신해야 하므로 recalc 을 부릅니다. 이때
 * tier_code 는 투표대로 다시 계산될 뿐 특수 패턴에 덮이지 않습니다 — 칸을
 * 가르는 것은 읽을 때(tierCodeOf)입니다.
 */
export async function setSpecial(
  playerId: number,
  chartId: number,
  marked: boolean,
): Promise<void> {
  const db = await getDb();
  if (marked) {
    await db.query(
      `INSERT INTO special_marks (player_id, chart_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [playerId, chartId],
    );
  } else {
    await db.query(`DELETE FROM special_marks WHERE player_id = $1 AND chart_id = $2`, [
      playerId,
      chartId,
    ]);
  }
  await recalc(chartId);
}

export class NotClearedError extends Error {
  constructor() {
    super('이 채보를 클리어한 기록이 있어야 투표할 수 있습니다');
  }
}

/** value 가 null 이면 투표 취소 */
export async function setVote(
  playerId: number,
  chartId: number,
  value: number | null,
): Promise<void> {
  const db = await getDb();

  if (value === null) {
    await db.query(`DELETE FROM difficulty_votes WHERE player_id = $1 AND chart_id = $2`, [
      playerId,
      chartId,
    ]);
    await recalc(chartId);
    return;
  }

  // DB 의 복합 FK 가 최종 방어선이지만, 여기서 먼저 막아야 사용자에게
  // 제약 위반 메시지 대신 뜻이 통하는 403 을 돌려줄 수 있다.
  const { rows } = await db.query(
    `SELECT 1 FROM clear_records WHERE player_id = $1 AND chart_id = $2`,
    [playerId, chartId],
  );
  if (rows.length === 0) throw new NotClearedError();

  await db.query(
    `INSERT INTO difficulty_votes (player_id, chart_id, value) VALUES ($1, $2, $3)
     ON CONFLICT (player_id, chart_id)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [playerId, chartId, value],
  );
  await recalc(chartId);
}
