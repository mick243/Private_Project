import { getDb } from './db';
import type { ArcadeReview } from './community-types';

/**
 * 오락실 리뷰 / 평점.
 *
 * 1인 1리뷰(UNIQUE)로 두고 수정은 UPSERT 로 처리합니다. 여러 건을 허용하면
 * 같은 사람이 평점을 반복해 얹어 평균을 끌어올릴 수 있고, 그걸 막으려면
 * 결국 애플리케이션에서 같은 제약을 다시 구현해야 합니다.
 */

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function toReview(r: Record<string, unknown>): ArcadeReview {
  return {
    id: Number(r.id),
    arcadeId: Number(r.arcade_id),
    playerId: Number(r.player_id),
    nickname: r.nickname as string,
    rating: Number(r.rating),
    body: (r.body as string) ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const REVIEW_SELECT = `
  SELECT r.id, r.arcade_id, r.player_id, r.rating, r.body, r.created_at, r.updated_at,
         p.nickname
  FROM arcade_reviews r
  JOIN players p ON p.id = r.player_id`;

export async function listReviews(arcadeId: number): Promise<ArcadeReview[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `${REVIEW_SELECT} WHERE r.arcade_id = $1 ORDER BY r.created_at DESC`,
    [arcadeId],
  );
  return rows.map(toReview);
}

/** 평점 캐시(arcades.rating_avg / review_count) 갱신. 리뷰가 바뀔 때마다 호출. */
async function recalc(arcadeId: number): Promise<void> {
  const db = await getDb();
  await db.query(`SELECT recalc_arcade_rating($1)`, [arcadeId]);
}

export async function upsertReview(input: {
  arcadeId: number;
  playerId: number;
  rating: number;
  body: string | null;
}): Promise<ArcadeReview> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO arcade_reviews (arcade_id, player_id, rating, body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (arcade_id, player_id)
       DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()
     RETURNING id`,
    [input.arcadeId, input.playerId, input.rating, input.body],
  );
  await recalc(input.arcadeId);

  const { rows: full } = await db.query<Record<string, unknown>>(
    `${REVIEW_SELECT} WHERE r.id = $1`,
    [rows[0].id],
  );
  return toReview(full[0]);
}

export async function deleteReview(arcadeId: number, playerId: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM arcade_reviews WHERE arcade_id = $1 AND player_id = $2 RETURNING id`,
    [arcadeId, playerId],
  );
  await recalc(arcadeId);
  return rows.length > 0;
}
