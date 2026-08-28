import { getDb } from './db';

/**
 * 즐겨찾기 — "내가 담아 둔 오락실".
 *
 * 리뷰·제보와 달리 담을 값이 없습니다(별을 눌렀다는 사실뿐). 그래서 여기서는
 * **id 목록만** 오갑니다 — 화면은 이 집합으로 별을 칠하고, 목록에서 담아 둔 곳을
 * 맨 위로 당깁니다 (lib/recommend.ts favoritesFirst).
 *
 * 목록 순서는 최근에 담은 순입니다. 지금은 화면이 집합으로만 쓰지만, 순서를
 * 정해 두지 않으면 나중에 "최근에 담은 곳" 을 보여 줄 때 근거가 없습니다.
 */

export async function listFavoriteIds(playerId: number): Promise<number[]> {
  const db = await getDb();
  const { rows } = await db.query<{ arcade_id: number }>(
    `SELECT arcade_id FROM arcade_favorites
     WHERE player_id = $1
     ORDER BY created_at DESC, arcade_id DESC`,
    [playerId],
  );
  return rows.map((r) => Number(r.arcade_id));
}

/**
 * 담기. 이미 담아 둔 곳이면 아무 일도 하지 않습니다 — 별을 두 번 눌러
 * 에러를 보게 할 이유가 없습니다.
 *
 * 없는 오락실·없는 플레이어면 FK 위반(23503)이 그대로 올라갑니다.
 * 라우트가 그걸 404 로 바꿉니다 (lib/pg-errors.ts).
 */
export async function addFavorite(playerId: number, arcadeId: number): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO arcade_favorites (player_id, arcade_id) VALUES ($1, $2)
     ON CONFLICT (player_id, arcade_id) DO NOTHING`,
    [playerId, arcadeId],
  );
}

/** 빼기. 담아 두지 않았던 곳이면 false — 라우트는 그래도 성공으로 답합니다 */
export async function removeFavorite(playerId: number, arcadeId: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ arcade_id: number }>(
    `DELETE FROM arcade_favorites
     WHERE player_id = $1 AND arcade_id = $2
     RETURNING arcade_id`,
    [playerId, arcadeId],
  );
  return rows.length > 0;
}
