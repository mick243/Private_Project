import { getDb } from './db';
import type { ChartComment } from './community-types';

/**
 * 채보 평가.
 *
 * difficulty_votes 와 분리된 이유: 투표는 "얼마나 어렵냐"는 스칼라 하나이고,
 * 평가는 "왜 어렵냐"입니다. 서열표에서 등급만 보고 골랐다가 막히는 건 대개
 * 후자 때문입니다 (틀기 약한 사람에게 틀기 채보, 체력 없는 사람에게 롱런).
 *
 * 투표와 달리 클리어 게이트를 걸지 않습니다 — 못 깬 사람의 "여기서 막힌다" 도
 * 정보이기 때문입니다. 대신 목록에 클리어 여부를 함께 실어 보냅니다.
 */

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function toComment(r: Record<string, unknown>): ChartComment {
  return {
    id: Number(r.id),
    chartId: Number(r.chart_id),
    playerId: Number(r.player_id),
    nickname: r.nickname as string,
    body: r.body as string,
    // TEXT[] 는 드라이버가 배열로 주지만, 방어적으로 한 번 더 확인한다.
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    cleared: Boolean(r.cleared),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

// 투표값(dv.value)은 일부러 select 하지 않는다 — 투표 분포를 익명으로 두기로 한
// 결정이 평가란을 통해 뚫리면 안 된다. 클리어 여부만 내보낸다.
const COMMENT_SELECT = `
  SELECT cc.id, cc.chart_id, cc.player_id, cc.body, cc.tags,
         cc.created_at, cc.updated_at,
         p.nickname,
         (cr.player_id IS NOT NULL) AS cleared
  FROM chart_comments cc
  JOIN players p ON p.id = cc.player_id
  LEFT JOIN clear_records cr
    ON cr.chart_id = cc.chart_id AND cr.player_id = cc.player_id`;

export async function listComments(chartId: number): Promise<ChartComment[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `${COMMENT_SELECT} WHERE cc.chart_id = $1 ORDER BY cc.created_at DESC`,
    [chartId],
  );
  return rows.map(toComment);
}

export async function upsertComment(input: {
  chartId: number;
  playerId: number;
  body: string;
  tags: string[];
}): Promise<ChartComment> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO chart_comments (chart_id, player_id, body, tags)
     VALUES ($1, $2, $3, $4::text[])
     ON CONFLICT (chart_id, player_id)
       DO UPDATE SET body = EXCLUDED.body, tags = EXCLUDED.tags, updated_at = now()
     RETURNING id`,
    [input.chartId, input.playerId, input.body, input.tags],
  );

  const { rows: full } = await db.query<Record<string, unknown>>(
    `${COMMENT_SELECT} WHERE cc.id = $1`,
    [rows[0].id],
  );
  return toComment(full[0]);
}

export async function deleteComment(chartId: number, playerId: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM chart_comments WHERE chart_id = $1 AND player_id = $2 RETURNING id`,
    [chartId, playerId],
  );
  return rows.length > 0;
}
