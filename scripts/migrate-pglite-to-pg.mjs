/**
 * .pglite → PostgreSQL 데이터 이전 스크립트.
 *
 *   node scripts/migrate-pglite-to-pg.mjs          무엇이 옮겨질지만 보여줍니다 (dry-run)
 *   node scripts/migrate-pglite-to-pg.mjs --yes    실제로 옮깁니다
 *
 * 전제:
 *   1. .env.local 에 DATABASE_URL 이 있어야 합니다 (대상 PostgreSQL)
 *   2. 대상 DB 에 스키마가 이미 있어야 합니다 — 먼저 `npm run db:init` 을 실행하세요
 *   3. dev 서버를 끄고 실행하세요 — PGlite 는 한 프로세스만 열 수 있습니다
 *
 * 하는 일: 대상 DB 의 모든 테이블을 TRUNCATE 한 뒤(시드 포함 전부 삭제),
 * .pglite 의 데이터를 그대로 복사하고 SERIAL 시퀀스를 맞춥니다.
 * .pglite 쪽은 읽기만 하므로 그대로 백업으로 남습니다.
 *
 * FK 순서 문제는 복사 중 session_replication_role=replica 로 FK 트리거를 꺼서
 * 피합니다 (postgres 슈퍼유저 필요). 전체가 한 트랜잭션이라 중간에 실패하면
 * 대상 DB 는 건드리기 전 상태로 돌아갑니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

// .env.local 을 최소한으로 파싱 (scripts/init-db.mjs 와 같은 방식)
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL 이 없습니다. .env.local 에 대상 PostgreSQL 연결 문자열을 넣으세요.');
  process.exit(1);
}

const apply = process.argv.includes('--yes');

const { PGlite } = await import('@electric-sql/pglite');
const { default: pg } = await import('pg');

const source = new PGlite(path.join(root, '.pglite'));
await source.waitReady;

const target = new pg.Client({ connectionString: process.env.DATABASE_URL });
await target.connect();

try {
  // ── 테이블 목록 대조 ─────────────────────────────────────────────
  const listTables = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const srcTables = (await source.query(listTables)).rows.map((r) => r.tablename);
  const tgtTables = new Set((await target.query(listTables)).rows.map((r) => r.tablename));

  const missing = srcTables.filter((t) => !tgtTables.has(t));
  if (missing.length) {
    console.error(`✖ 대상 DB 에 없는 테이블: ${missing.join(', ')}`);
    console.error('  먼저 npm run db:init 으로 대상 DB 에 스키마를 만드세요.');
    process.exit(1);
  }

  // ── 컬럼 메타데이터 (대상 기준) — jsonb/배열은 캐스트가 필요하다 ──
  const { rows: colRows } = await target.query(`
    SELECT table_name, column_name, udt_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const colsOf = new Map(); // table → [{name, udt, isSerial}]
  for (const c of colRows) {
    if (!colsOf.has(c.table_name)) colsOf.set(c.table_name, []);
    colsOf.get(c.table_name).push({
      name: c.column_name,
      udt: c.udt_name,
      isSerial: /^nextval\(/.test(c.column_default ?? ''),
    });
  }

  // udt_name → 파라미터 캐스트. 배열은 "_text" 처럼 오므로 요소형[] 로 되돌린다.
  const castOf = (udt) => (udt.startsWith('_') ? `${udt.slice(1)}[]` : udt);

  // ── 미리 개수를 세어 계획을 보여준다 ────────────────────────────
  const counts = [];
  for (const t of srcTables) {
    const { rows } = await source.query(`SELECT count(*)::int AS n FROM "${t}"`);
    counts.push({ table: t, rows: rows[0].n });
  }
  const width = Math.max(...counts.map((c) => c.table.length));
  console.log(`이전 계획 — .pglite → ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}\n`);
  for (const c of counts) console.log(`  ${c.table.padEnd(width)}  ${String(c.rows).padStart(6)} 행`);
  console.log(`  ${'합계'.padEnd(width)}  ${String(counts.reduce((s, c) => s + c.rows, 0)).padStart(6)} 행`);

  if (!apply) {
    console.log('\n(dry-run — 실제로 옮기려면 --yes 를 붙이세요. 대상 DB 의 기존 행은 전부 지워집니다.)');
    process.exit(0);
  }

  // ── 복사 (한 트랜잭션) ──────────────────────────────────────────
  await target.query('BEGIN');
  await target.query(`SET LOCAL session_replication_role = replica`);
  await target.query(`TRUNCATE ${srcTables.map((t) => `"${t}"`).join(', ')}`);

  for (const t of srcTables) {
    const { rows } = await source.query(`SELECT * FROM "${t}"`);
    if (!rows.length) continue;

    // 소스 행에 실제로 있는 컬럼만 (양쪽 스키마는 같은 SQL 파일에서 나왔으므로 보통 전부)
    const cols = colsOf.get(t).filter((c) => c.name in rows[0]);
    const colList = cols.map((c) => `"${c.name}"`).join(', ');

    // 파라미터 상한(65535)을 피해 행 단위로 배치
    const batchSize = Math.max(1, Math.floor(20000 / cols.length));
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params = [];
      const tuples = batch.map((row) => {
        const ph = cols.map((c) => {
          let v = row[c.name];
          if (v !== null && (c.udt === 'jsonb' || c.udt === 'json')) v = JSON.stringify(v);
          params.push(v);
          return `$${params.length}::${castOf(c.udt)}`;
        });
        return `(${ph.join(', ')})`;
      });
      await target.query(`INSERT INTO "${t}" (${colList}) VALUES ${tuples.join(', ')}`, params);
    }
    console.log(`  ✔ ${t} — ${rows.length} 행`);
  }

  // ── SERIAL 시퀀스 재정렬 ────────────────────────────────────────
  for (const [t, cols] of colsOf) {
    if (!srcTables.includes(t)) continue;
    for (const c of cols.filter((c) => c.isSerial)) {
      await target.query(
        `SELECT setval(
           pg_get_serial_sequence($1, $2),
           GREATEST((SELECT COALESCE(MAX("${c.name}"), 0) FROM "${t}"), 1),
           (SELECT COUNT(*) > 0 FROM "${t}")
         )`,
        [`"${t}"`, c.name],
      );
    }
  }

  await target.query('COMMIT');

  // ── 검증 — 양쪽 행 수 대조 ──────────────────────────────────────
  let mismatch = false;
  for (const c of counts) {
    const { rows } = await target.query(`SELECT count(*)::int AS n FROM "${c.table}"`);
    if (rows[0].n !== c.rows) {
      console.error(`✖ ${c.table}: 소스 ${c.rows} ≠ 대상 ${rows[0].n}`);
      mismatch = true;
    }
  }
  if (mismatch) process.exit(1);
  console.log('\n✔ 이전 완료 — 모든 테이블의 행 수가 일치합니다.');
  console.log('  (.pglite 는 그대로 남아 있습니다. DATABASE_URL 을 지우면 언제든 되돌아갑니다.)');
} finally {
  await target.end().catch(() => {});
  await source.close().catch(() => {});
}
