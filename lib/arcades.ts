import { cacheReference } from './cache';
import { getDb, type Queryable } from './db';
import type { Arcade, ArcadeInput, ArcadeMachine, Machine } from './types';

/**
 * 오락실 1건 + 보유 기종 목록을 뽑는 공통 SELECT 조각.
 *
 * 두 뷰가 서로 다른 단위로 붙는다:
 *   machine_live       대기   → (오락실, 기종)  줄은 게임 앞에 선다
 *   cabinet_condition  컨디션 → 기체 1대        1호기는 멀쩡한데 2호기만 죽어 있을 수 있다
 *
 * machine_live 는 수명 안의 제보만 담고 LEFT JOIN 이라, 유효한 제보가 없으면
 * live 가 null 로 나가고 UI 는 "지금 대기" 칸을 아예 그리지 않는다. 만료된 값을
 * 0 으로 바꿔 내보내면 "대기 없음" 이라는 없는 정보가 생긴다.
 *
 * cabinet_condition 은 등록값까지 종합한 결과라 기체마다 항상 한 행 있다.
 * 등록값도 제보도 없을 때만 value 가 null 이고, 그때만 "정보 없음" 이다.
 */
const MACHINES_SUBQUERY = `
  COALESCE((
    SELECT json_agg(
             json_build_object(
               'id',           m.id,
               'name',         m.name,
               'shortName',    m.short_name,
               'category',     m.category,
               'cabinetCount', cab.cabinet_count,
               'cabinets',     cab.cabinets,
               'live', CASE WHEN ml.machine_id IS NULL THEN NULL ELSE json_build_object(
                 'waitCount',      ml.wait_count,
                 'waitReports',    COALESCE(ml.wait_reports, 0),
                 'waitReportedAt', ml.wait_reported_at
               ) END
             )
             ORDER BY CASE m.category WHEN 'rhythm' THEN 0 ELSE 1 END, m.sort_order, m.id
           )
    FROM arcade_machines am
    JOIN machines m ON m.id = am.machine_id
    LEFT JOIN machine_live ml
      ON ml.arcade_id = am.arcade_id AND ml.machine_id = am.machine_id
    -- 기체는 기종 안에 중첩된 배열로. 평평하게 내보내고 화면에서 묶으면
    -- 목록·상세·지도가 각자 다르게 묶을 여지가 생긴다.
    CROSS JOIN LATERAL (
      SELECT COUNT(c.id)::int AS cabinet_count,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id',        c.id,
                   'cabinetNo', c.cabinet_no,
                   'condition', c.condition,
                   -- 등록값도 제보도 없으면 value 가 null 이고, 그때는 표시할 게
                   -- 없으므로 객체 자체를 내보내지 않는다.
                   'conditionSummary', CASE WHEN cc.value IS NULL THEN NULL ELSE json_build_object(
                     'value',      cc.value,
                     'reports',    COALESCE(cc.reports, 0),
                     'reportedAt', cc.reported_at
                   ) END
                 )
                 ORDER BY c.cabinet_no
               ),
               '[]'::json
             ) AS cabinets
      FROM arcade_cabinets c
      LEFT JOIN cabinet_condition cc ON cc.cabinet_id = c.id
      WHERE c.arcade_id = am.arcade_id AND c.machine_id = am.machine_id
    ) cab
    WHERE am.arcade_id = b.id
  ), '[]'::json) AS machines`;

interface ArcadeRow {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  open_time: string | null;
  close_time: string | null;
  is_24h: boolean;
  phone: string | null;
  note: string | null;
  distance_km: number | null;
  rating_avg: number | string | null;
  review_count: number;
  machines: ArcadeMachine[] | string;
}

function toArcade(row: ArcadeRow): Arcade {
  const machines =
    typeof row.machines === 'string'
      ? (JSON.parse(row.machines) as ArcadeMachine[])
      : row.machines;

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    openTime: row.open_time,
    closeTime: row.close_time,
    is24h: row.is_24h,
    phone: row.phone,
    note: row.note,
    machines,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    // NUMERIC 은 드라이버에 따라 문자열로 올라온다.
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    reviewCount: Number(row.review_count ?? 0),
  };
}

export interface ListArcadesParams {
  /** 이름/주소 부분 일치 */
  q?: string | null;
  /** 선택한 기종을 "모두" 보유한 오락실만 (AND 조건) */
  machineIds?: number[] | null;
  /** 반경 검색 기준 좌표 */
  lat?: number | null;
  lng?: number | null;
  /** 반경(km). lat/lng 와 함께일 때만 적용 */
  radiusKm?: number | null;
}

/**
 * 검색어를 낱말로 쪼갭니다 — "홍대 짱" 이 "짱오락실 홍대점" 을 찾게 하기 위해.
 *
 * 통짜 부분 일치('%홍대 짱%')는 어순과 붙임새가 정확히 같아야만 걸립니다.
 * 사람은 지점을 "동네 + 이름 아무 조각" 으로 기억하므로, 낱말마다 따로
 * 이름·주소에 걸리면 매치로 봅니다 (SQL 쪽에서 AND 로 묶습니다).
 *
 * 8개 상한: 낱말 하나가 ILIKE 두 번이라, 상한이 없으면 공백 잔뜩인 입력이
 * 스캔 비용을 마음대로 키웁니다.
 */
export function searchTokens(q: string | null | undefined): string[] | null {
  if (!q) return null;
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return tokens.length ? tokens : null;
}

export async function listArcades(params: ListArcadesParams): Promise<Arcade[]> {
  const db = await getDb();
  const { q = null, machineIds = null, lat = null, lng = null, radiusKm = null } = params;

  // 좌표가 오면 haversine 으로 거리(km)를 계산해 함께 반환한다.
  // PostGIS 도입 시 이 CTE 를 ST_Distance / ST_DWithin 으로 교체하면 인덱스를 탄다.
  const sql = `
    WITH base AS (
      SELECT
        a.*,
        CASE WHEN $1::float8 IS NULL OR $2::float8 IS NULL THEN NULL ELSE
          6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians($1::float8)) * cos(radians(a.lat))
                * cos(radians(a.lng) - radians($2::float8))
            + sin(radians($1::float8)) * sin(radians(a.lat))
          )))
        END AS distance_km
      FROM arcades a
      WHERE ($3::text[] IS NULL
             -- 낱말마다 이름 또는 주소에 걸려야 한다 (searchTokens 주석).
             -- "홍대 짱" → 홍대는 주소/지점명에, 짱은 상호에 각각 걸린다.
             OR (SELECT bool_and(a.name ILIKE '%' || t || '%'
                              OR a.address ILIKE '%' || t || '%')
                 FROM unnest($3::text[]) AS t))
        AND ($4::int[] IS NULL OR a.id IN (
              SELECT am.arcade_id
              FROM arcade_machines am
              WHERE am.machine_id = ANY($4::int[])
              GROUP BY am.arcade_id
              HAVING COUNT(DISTINCT am.machine_id) = array_length($4::int[], 1)
            ))
    )
    SELECT b.*, ${MACHINES_SUBQUERY}
    FROM base b
    WHERE $5::float8 IS NULL OR b.distance_km IS NULL OR b.distance_km <= $5::float8
    ORDER BY b.distance_km ASC NULLS LAST, b.name ASC`;

  const { rows } = await db.query<ArcadeRow>(sql, [
    lat,
    lng,
    searchTokens(q),
    machineIds && machineIds.length ? machineIds : null,
    radiusKm,
  ]);

  return rows.map(toArcade);
}

export async function getArcade(id: number): Promise<Arcade | null> {
  const db = await getDb();
  const { rows } = await db.query<ArcadeRow>(
    `SELECT b.*, NULL::float8 AS distance_km, ${MACHINES_SUBQUERY}
     FROM arcades b WHERE b.id = $1`,
    [id],
  );
  return rows[0] ? toArcade(rows[0]) : null;
}

/**
 * 보유 기종·기체를 입력값에 맞춘다 (제보 반영은 이 경로 하나로 통일).
 *
 * 통째로 지우고 다시 넣지 않는 이유: 컨디션 제보가 arcade_cabinets.id 를
 * 가리킨다. DELETE + INSERT 로 새 id 를 받으면 오락실 정보를 한 글자만 고쳐도
 * 그 오락실의 컨디션 제보가 전부 주인을 잃는다. 그래서 남을 것은 남기고
 * (cabinet_no 로 맞춰 UPDATE), 빠진 것만 지운다.
 */
async function replaceMachines(
  tx: Queryable,
  arcadeId: number,
  machines: ArcadeInput['machines'],
): Promise<void> {
  const machineIds = machines.map((m) => m.machineId);

  // 입력에서 빠진 기종은 제거 — 그 기체들도 FK CASCADE 로 함께 사라진다.
  await tx.query(
    `DELETE FROM arcade_machines
     WHERE arcade_id = $1 AND ($2::int[] IS NULL OR machine_id <> ALL($2::int[]))`,
    [arcadeId, machineIds.length ? machineIds : null],
  );

  for (const m of machines) {
    await tx.query(
      `INSERT INTO arcade_machines (arcade_id, machine_id) VALUES ($1, $2)
       ON CONFLICT (arcade_id, machine_id) DO UPDATE SET updated_at = now()`,
      [arcadeId, m.machineId],
    );

    // 기체가 0대인 기종은 화면에서 통째로 사라지므로 최소 1대는 남긴다.
    const count = Math.max(1, m.cabinets.length);

    // 대수를 줄이면 뒤 번호부터 없어진다 (1호기가 남고 3호기가 빠진다).
    await tx.query(
      `DELETE FROM arcade_cabinets
       WHERE arcade_id = $1 AND machine_id = $2 AND cabinet_no > $3`,
      [arcadeId, m.machineId, count],
    );

    for (let i = 0; i < count; i += 1) {
      await tx.query(
        `INSERT INTO arcade_cabinets (arcade_id, machine_id, cabinet_no, condition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (arcade_id, machine_id, cabinet_no) DO UPDATE
           SET condition  = EXCLUDED.condition,
               updated_at = now()`,
        [arcadeId, m.machineId, i + 1, m.cabinets[i]?.condition ?? null],
      );
    }
  }
}

export async function createArcade(input: ArcadeInput): Promise<Arcade> {
  const db = await getDb();
  const id = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO arcades (name, address, lat, lng, open_time, close_time, is_24h, phone, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.name,
        input.address,
        input.lat,
        input.lng,
        input.openTime,
        input.closeTime,
        input.is24h,
        input.phone,
        input.note,
      ],
    );
    const newId = rows[0].id;
    await replaceMachines(tx, newId, input.machines);
    return newId;
  });

  return (await getArcade(id))!;
}

export async function updateArcade(
  id: number,
  input: ArcadeInput,
): Promise<Arcade | null> {
  const db = await getDb();
  const updated = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `UPDATE arcades SET
         name = $2, address = $3, lat = $4, lng = $5,
         open_time = $6, close_time = $7, is_24h = $8, phone = $9, note = $10,
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.name,
        input.address,
        input.lat,
        input.lng,
        input.openTime,
        input.closeTime,
        input.is24h,
        input.phone,
        input.note,
      ],
    );
    if (!rows[0]) return false;
    await replaceMachines(tx, id, input.machines);
    return true;
  });

  return updated ? await getArcade(id) : null;
}

export async function deleteArcade(id: number): Promise<boolean> {
  const db = await getDb();
  // arcade_machines 는 ON DELETE CASCADE 로 함께 정리된다.
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM arcades WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

async function listMachinesUncached(): Promise<Machine[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: number;
    name: string;
    short_name: string;
    category: 'rhythm' | 'etc';
  }>(
    // 리듬게임 특화 서비스이므로 리듬 기종을 항상 앞에 둔다.
    // 그 안의 순서는 sort_order — id 는 참조 키라서 순서 조정에 쓸 수 없다.
    `SELECT id, name, short_name, category FROM machines
     ORDER BY CASE category WHEN 'rhythm' THEN 0 ELSE 1 END, sort_order, id`,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    category: r.category,
  }));
}

/**
 * 기종 마스터 목록 (필터·등록 폼·챗봇이 공유한다).
 *
 * 앱에서 machines 를 쓰는 경로가 없어 캐시해 둔다 — 자세한 근거는 lib/cache.ts.
 */
export const listMachines = cacheReference(listMachinesUncached, 'machines');
