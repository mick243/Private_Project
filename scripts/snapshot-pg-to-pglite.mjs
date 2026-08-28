/**
 * PostgreSQL → .pglite 스냅샷 스크립트. (scripts/migrate-pglite-to-pg.mjs 의 반대 방향)
 *
 *   npm run db:snapshot            무엇이 복사될지만 보여줍니다 (dry-run)
 *   npm run db:snapshot -- --yes   실제로 복사합니다
 *
 * 지금 PostgreSQL 에 들어 있는 내용을 **로컬 사본**(.pglite/)에 그대로 떠 둡니다.
 * PostgreSQL 이 안 떠 있을 때 lib/db.ts 가 이 사본으로 내려가 앱을 그대로 띄웁니다
 * (lib/db.ts createDbWithFallback 주석 참고).
 *
 * 전제:
 *   1. .env.local 에 DATABASE_URL 이 있어야 합니다 (원본 PostgreSQL)
 *   2. PostgreSQL 이 떠 있어야 합니다 — 원본을 읽어야 하니까
 *   3. dev 서버를 끄고 실행하세요 — PGlite 는 한 프로세스만 열 수 있습니다
 *
 * 하는 일:
 *   1. 기존 .pglite 를 backups/ 로 옮겨 둡니다 (--no-backup 으로 생략)
 *   2. `init-db.mjs --pglite --reset` 으로 스키마를 새로 만듭니다
 *      → 사본의 스키마가 db/*.sql 과 정확히 같아집니다. 오래된 사본에 컬럼이
 *        빠져 있어서 복사가 깨지는 일을 없앱니다
 *   3. 시드를 포함한 모든 행을 지우고 PostgreSQL 의 데이터를 복사합니다
 *   4. SERIAL 시퀀스를 맞추고, 양쪽 행 수를 대조합니다
 *
 * PostgreSQL 쪽은 **읽기만** 합니다. FK 순서 문제는 복사 중
 * session_replication_role=replica 로 FK 트리거를 꺼서 피합니다.
 *
 * 업로드된 이미지는 DB 가 아니라 uploads/ 에 있습니다 — 같은 머신에서 도는 동안은
 * 사본으로 내려가도 그대로 보입니다. 따로 복사할 것이 없습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  console.error('✖ DATABASE_URL 이 없습니다 — 뜰 원본이 없습니다.');
  console.error('  .env.local 에 원본 PostgreSQL 연결 문자열을 넣으세요.');
  process.exit(1);
}

const apply = process.argv.includes('--yes');
const skipBackup = process.argv.includes('--no-backup');
const masked = process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@');
const dataDir = path.join(root, '.pglite');

const { default: pg } = await import('pg');

const source = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await source.connect();
  // 시각을 UTC 텍스트로 뽑아 둔다 — 서버 TimeZone 설정에 따라 텍스트가 달라지지 않게.
  // (오프셋이 붙어 나오므로 어느 쪽이든 같은 순간으로 읽히지만, 떠 놓은 사본을
  //  원본과 대조할 때 문자열이 같아야 확인이 쉽다.)
  await source.query(`SET TimeZone = 'UTC'`);
} catch (err) {
  console.error(`✖ PostgreSQL 에 붙지 못했습니다 — ${err.message}`);
  console.error(`  ${masked}`);
  console.error('  서비스를 먼저 띄우세요:  Restart-Service postgresql-x64-18  (관리자 PowerShell)');
  process.exit(1);
}

const listTables = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;

// ── 계획 먼저 보여준다 ────────────────────────────────────────────
const srcTables = (await source.query(listTables)).rows.map((r) => r.tablename);
const counts = [];
for (const t of srcTables) {
  const { rows } = await source.query(`SELECT count(*)::int AS n FROM "${t}"`);
  counts.push({ table: t, rows: rows[0].n });
}
const width = Math.max(...counts.map((c) => c.table.length));
console.log(`스냅샷 계획 — ${masked} → .pglite/\n`);
for (const c of counts) console.log(`  ${c.table.padEnd(width)}  ${String(c.rows).padStart(6)} 행`);
console.log(`  ${'합계'.padEnd(width)}  ${String(counts.reduce((s, c) => s + c.rows, 0)).padStart(6)} 행`);

if (!apply) {
  console.log('\n(dry-run — 실제로 뜨려면 --yes 를 붙이세요. .pglite/ 는 통째로 새로 만들어집니다.)');
  await source.end().catch(() => {});
  process.exit(0);
}

// ── 1. 기존 사본을 옮겨 둔다 ──────────────────────────────────────
if (fs.existsSync(dataDir)) {
  if (skipBackup) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('\n· 기존 .pglite 삭제 (--no-backup)');
  } else {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(/[:]/g, '');
    const dest = path.join(root, 'backups', `pglite-${stamp}`);
    fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
    try {
      fs.renameSync(dataDir, dest);
    } catch (err) {
      console.error(`\n✖ 기존 .pglite 를 옮기지 못했습니다 — ${err.message}`);
      console.error('  다른 프로세스가 열어 두고 있을 수 있습니다 (dev 서버를 끄세요).');
      await source.end().catch(() => {});
      process.exit(1);
    }
    console.log(`\n· 기존 .pglite → ${path.relative(root, dest)}`);
  }
}

// ── 2. 스키마를 새로 만든다 (파일 목록은 init-db.mjs 한 곳에만 둔다) ──
const init = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'init-db.mjs'), '--pglite', '--reset'],
  { cwd: root, stdio: 'inherit' },
);
if (init.status !== 0) {
  console.error('✖ 사본 스키마 생성이 실패했습니다 (init-db.mjs).');
  await source.end().catch(() => {});
  process.exit(1);
}

// ── 3. 데이터 복사 ────────────────────────────────────────────────
const { PGlite } = await import('@electric-sql/pglite');
const target = new PGlite(dataDir);
await target.waitReady;

try {
  const tgtTables = new Set((await target.query(listTables)).rows.map((r) => r.tablename));
  const missing = srcTables.filter((t) => !tgtTables.has(t));
  if (missing.length) {
    // db/*.sql 에 정의가 없는 테이블이 PostgreSQL 에만 있는 경우. 조용히 빼면
    // 사본이 반쪽이 되므로 멈춘다.
    console.error(`✖ 사본에 없는 테이블: ${missing.join(', ')}`);
    console.error('  db/*.sql 에 정의가 없습니다 — 스키마 파일을 먼저 맞추세요.');
    process.exit(1);
  }

  // 컬럼 메타데이터는 **대상 기준** — 캐스트를 대상 타입으로 붙여야 한다
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

  // 원본에 실제로 있는 컬럼 — 양쪽 스키마는 같은 SQL 파일에서 나왔지만 대조는 해 둔다
  const { rows: srcColRows } = await source.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const srcColsOf = new Map();
  for (const c of srcColRows) {
    if (!srcColsOf.has(c.table_name)) srcColsOf.set(c.table_name, new Set());
    srcColsOf.get(c.table_name).add(c.column_name);
  }

  await target.exec('BEGIN');
  await target.exec(`SET LOCAL session_replication_role = replica`);
  // 시드까지 포함해 전부 비운다 — 사본은 PostgreSQL 을 그대로 비춰야 한다
  await target.exec(`TRUNCATE ${srcTables.map((t) => `"${t}"`).join(', ')}`);

  for (const t of srcTables) {
    const cols = colsOf.get(t).filter((c) => srcColsOf.get(t)?.has(c.name));

    const dropped = [...(srcColsOf.get(t) ?? [])].filter(
      (name) => !cols.some((c) => c.name === name),
    );
    if (dropped.length) {
      console.warn(`  ⚠ ${t} — 사본에 없는 컬럼은 빠집니다: ${dropped.join(', ')}`);
    }

    /**
     * **모든 값을 텍스트로 왕복시킵니다.**
     *
     * `SELECT *` 로 받으면 node-postgres 가 값을 JS 로 파싱하는데, 그 과정에서
     * 정보가 깎입니다 — timestamptz 는 JS Date(밀리초)가 되어 마이크로초가
     * 사라지고, 배열·jsonb 는 다시 직렬화해야 합니다. `::text` 로 뽑아
     * `$n::타입` 으로 넣으면 파싱하는 쪽이 양쪽 다 Postgres 엔진이라 원본의
     * 텍스트 표현이 그대로 복원됩니다.
     */
    const selectList = cols.map((c) => `"${c.name}"::text AS "${c.name}"`).join(', ');
    const { rows } = await source.query(`SELECT ${selectList} FROM "${t}"`);
    if (!rows.length) continue;

    const colList = cols.map((c) => `"${c.name}"`).join(', ');

    // 파라미터 상한(65535)을 피해 행 단위로 배치
    const batchSize = Math.max(1, Math.floor(20000 / cols.length));
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params = [];
      const tuples = batch.map((row) => {
        const ph = cols.map((c) => {
          params.push(row[c.name]); // 전부 문자열 아니면 null
          return `$${params.length}::${castOf(c.udt)}`;
        });
        return `(${ph.join(', ')})`;
      });
      await target.query(`INSERT INTO "${t}" (${colList}) VALUES ${tuples.join(', ')}`, params);
    }
    console.log(`  ✔ ${t} — ${rows.length} 행`);
  }

  // ── 4. SERIAL 시퀀스 재정렬 ────────────────────────────────────
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

  await target.exec('COMMIT');

  // ── 검증 — 양쪽 행 수 대조 ────────────────────────────────────
  let mismatch = false;
  for (const c of counts) {
    const { rows } = await target.query(`SELECT count(*)::int AS n FROM "${c.table}"`);
    if (rows[0].n !== c.rows) {
      console.error(`✖ ${c.table}: 원본 ${c.rows} ≠ 사본 ${rows[0].n}`);
      mismatch = true;
    }
  }
  if (mismatch) process.exit(1);

  console.log('\n✔ 스냅샷 완료 — 모든 테이블의 행 수가 일치합니다.');
  console.log('  PostgreSQL 이 안 뜨면 이 사본으로 앱이 돌아갑니다 (lib/db.ts 폴백).');
  console.log('  ⚠ 사본은 뜬 시점에서 멈춥니다. PostgreSQL 이 바뀌면 다시 뜨세요.');
} catch (err) {
  await target.exec('ROLLBACK').catch(() => {});
  throw err;
} finally {
  await source.end().catch(() => {});
  await target.close().catch(() => {});
}
