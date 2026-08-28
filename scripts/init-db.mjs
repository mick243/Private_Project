/**
 * DB 초기화 스크립트 — schema.sql + seed.sql 을 적용합니다.
 *
 *   npm run db:init          기존 테이블을 드롭하고 다시 만듭니다 (파괴적)
 *   npm run db:reset         .pglite 디렉터리까지 통째로 지우고 새로 만듭니다
 *
 * DATABASE_URL 이 있으면 실제 Postgres 에, 없으면 .pglite 에 적용합니다.
 * `--pglite` 를 붙이면 DATABASE_URL 이 있어도 .pglite 에 적용합니다 —
 * 로컬 사본의 스키마를 만들 때 씁니다 (scripts/snapshot-pg-to-pglite.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readSql = (f) => fs.readFileSync(path.join(root, 'db', f), 'utf8');

// .env.local 을 최소한으로 파싱 (dotenv 의존성 없이)
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const reset = process.argv.includes('--reset');

// DATABASE_URL 을 무시하고 로컬 사본(.pglite)에 적용. 환경변수를 비워서 같은 효과를
// 내려고 하면 .env.local 파싱이 다시 채워 넣기 때문에 플래그로 받습니다.
const forcePglite = process.argv.includes('--pglite');

// ⚠ 아래 세 목록은 lib/db.ts 와 같아야 합니다 (이 스크립트는 .ts 를 import 할 수
//   없어서 옮겨 적습니다). lib/db.ts 를 고치면 여기도 고치세요.

// 적용 순서 = lib/db.ts 의 SQL_GROUPS 와 동일.
// tier 는 machines 를, community/board 는 arcades + players/charts 를 참조한다.
const SCHEMA_FILES = [
  'schema.sql',
  'seed.sql',
  'schema-tier.sql',
  'seed-tier.sql',
  'schema-community.sql',
  'seed-community.sql',
  'schema-board.sql',
  'seed-board.sql',
  'schema-board-images.sql',
];

// 이미 적용된 스키마를 고치는 변경 (lib/db.ts MIGRATION_FILES).
// 새로 만든 DB 는 시드에 이미 최종 상태가 있어 아무 일도 하지 않지만, 이력을
// 남겨야 서버가 뜰 때 다시 실행하지 않는다.
const MIGRATION_FILES = [
  'migrate-001-machine-list.sql',
  'migrate-002-cabinets.sql',
  'migrate-003-queue-ttl.sql',
  'migrate-004-admin.sql',
  'migrate-005-piu-songs.sql',
  'migrate-006-piu-pro2-m.sql',
  'migrate-007-piu-artists.sql',
  'migrate-008-oauth-identities.sql',
  'migrate-009-arcade-source.sql',
  'migrate-010-strip-corporate-form.sql',
  'migrate-011-queue-ttl-4h.sql',
  'migrate-012-piu-s1-tier.sql',
  'migrate-013-drop-seed-piu-tiers.sql',
  'migrate-014-tier-scale-rework.sql',
  'migrate-015-notice-category.sql',
  'migrate-016-post-body-doc.sql',
  'migrate-017-arcade-favorites.sql',
  'migrate-018-piu-s2-tier.sql',
  'migrate-019-piu-remix-shortcut-fullsong.sql',
  'migrate-020-restore-saranga-chart.sql',
  'migrate-021-piu-remix-text-list.sql',
  'migrate-022-drop-novasonic-novarash-remix.sql',
  'migrate-023-drop-remix-subset.sql',
  'migrate-024-drop-remix-subset-2.sql',
  'migrate-025-drop-remix-subset-3.sql',
  'migrate-026-oauth-nickname.sql',
  'migrate-027-nickname-ci-unique.sql',
  'migrate-028-piu-s3-tier.sql',
  'migrate-029-fix-s3-final-audition.sql',
  'migrate-030-piu-s4-tier.sql',
  'migrate-031-piu-s5-tier.sql',
  'migrate-032-piu-s6-tier.sql',
  'migrate-033-piu-all-charts.sql',
  'migrate-034-vote-scale-0.1.sql',
  'migrate-035-grade-band-tiebreak.sql',
  'migrate-036-chart-tag-rework.sql',
  'migrate-037-notice-without-game.sql',
  'migrate-038-add-machines.sql',
  'migrate-039-condition-window-30d.sql',
  'migrate-040-chart-special-flag.sql',
  'migrate-041-special-marks-consensus.sql',
  'migrate-042-posts-scale-indexes.sql',
  'migrate-043-sdvx-8-tier.sql',
  'migrate-044-tier-chart-basis.sql',
  'migrate-045-mode-is-difficulty.sql',
  'migrate-046-sdvx-chart-tags.sql',
  'migrate-047-sdvx-17-tier.sql',
  'migrate-048-drop-sdvx-17-off-sheet.sql',
  'migrate-049-verse-iv-a-tier.sql',
];

// 파생 객체(뷰). 테이블이 다 만들어진 뒤 마지막에.
const DERIVED_SQL_FILE = 'views.sql';

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`;

/** exec/query 를 받아 전체 순서를 적용 */
async function applyAll(run) {
  for (const file of SCHEMA_FILES) await run(readSql(file));
  await run(MIGRATIONS_TABLE);
  for (const file of MIGRATION_FILES) {
    await run(readSql(file));
    await run(`INSERT INTO schema_migrations (name) VALUES ('${file}')
               ON CONFLICT (name) DO NOTHING;`);
  }
  await run(readSql(DERIVED_SQL_FILE));
}

if (process.env.DATABASE_URL && !forcePglite) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await applyAll((sql) => client.query(sql));
  await client.end();
  console.log('✔ PostgreSQL 초기화 완료 —', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@'));
} else {
  const dataDir = path.join(root, '.pglite');
  if (reset && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('· .pglite 삭제됨');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dataDir);
  await db.waitReady;
  await applyAll((sql) => db.exec(sql));
  await db.close();
  console.log('✔ PGlite 초기화 완료 — .pglite/');
  if (!process.env.DATABASE_URL) {
    console.log('  (실제 Postgres 를 쓰려면 .env.local 에 DATABASE_URL 을 설정하세요)');
  }
  if (reset) {
    // dev 서버는 PGlite 핸들을 캐시하고 있어 지워진 디렉터리를 계속 붙잡는다.
    console.log('  ⚠ dev 서버가 떠 있다면 재시작하세요 — 이전 DB 핸들을 잡고 있습니다.');
  }
}
