/**
 * 로그인 수단이 하나도 없는 플레이어를 정리합니다.
 *
 *   node scripts/prune-passwordless-players.mjs          무엇이 지워질지만 보여줍니다 (dry-run)
 *   node scripts/prune-passwordless-players.mjs --yes    실제로 지웁니다
 *
 * ─────────────────────────────────────────────────────────────
 * 기준이 "비밀번호가 없다" 가 아니라 **"로그인할 방법이 없다"** 입니다.
 *
 * 소셜 로그인 전용 계정은 가입할 때 password_hash 를 넣지 않습니다
 * (lib/auth.ts — `INSERT INTO players (nickname, nickname_pending)`). 그래서
 * `password_hash IS NULL` 만으로 지우면 **정상적으로 쓰고 있는 소셜 계정이
 * 전부 함께 사라집니다.** 비밀번호가 없는 것은 그 계정의 결함이 아니라
 * 로그인 방식의 차이일 뿐입니다.
 *
 * 그래서 두 조건을 함께 봅니다.
 *   password_hash IS NULL          비밀번호 로그인 불가
 *   AND player_identities 없음      소셜 로그인도 불가
 *
 * 남는 것은 어느 쪽으로도 로그인할 수 없는 행 — 실제로는 db/seed.sql 이
 * 넣어 둔 가상 플레이어(플레이어 선택기용)입니다.
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠ CASCADE 가 큽니다. players 를 참조하는 FK 중 machine_reports 만
 *   ON DELETE SET NULL(제보는 익명으로 남음)이고, 나머지는 전부 CASCADE 입니다:
 *   posts · post_comments · post_likes · post_images · arcade_reviews ·
 *   chart_comments · clear_records · special_marks.
 *   즉 계정을 지우면 그 사람이 쓴 글과 기록이 함께 사라집니다. dry-run 이
 *   테이블별로 몇 행인지 먼저 보여주는 이유입니다.
 *
 * ⚠ 되돌릴 수 없습니다. 실행 전에 덤프를 떠 두세요:
 *     pg_dump -Fc -d arcade_finder -f backup-db/arcade_finder.dump
 *   (backup- 로 시작하는 폴더는 .gitignore 에 있습니다)
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
  console.error('✖ DATABASE_URL 이 없습니다. 이 스크립트는 실제 PostgreSQL 에서만 씁니다.');
  process.exit(1);
}

const apply = process.argv.includes('--yes');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

/** 로그인 수단이 하나도 없는 플레이어 — 이 스크립트의 유일한 기준 */
const TARGET = `
  SELECT p.id
  FROM players p
  WHERE p.password_hash IS NULL
    AND NOT EXISTS (SELECT 1 FROM player_identities i WHERE i.player_id = p.id)`;

/** CASCADE 로 함께 지워지는 테이블 (machine_reports 는 SET NULL 이라 제외) */
const CASCADING = [
  'posts',
  'post_comments',
  'post_likes',
  'post_images',
  'arcade_reviews',
  'chart_comments',
  'clear_records',
  'special_marks',
];

await client.connect();
try {
  const where = process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@');
  console.log(`대상 DB — ${where}\n`);

  const { rows: targets } = await client.query(`
    ${TARGET.replace('SELECT p.id', 'SELECT p.id, p.nickname, p.is_admin')}
    ORDER BY p.id`);

  if (targets.length === 0) {
    console.log('로그인할 수 없는 플레이어가 없습니다. 할 일이 없습니다.');
    process.exit(0);
  }

  console.log(`삭제 대상 ${targets.length}명:`);
  for (const t of targets) {
    console.log(`  ${String(t.id).padStart(4)}  ${t.nickname}${t.is_admin ? '  [관리자]' : ''}`);
  }

  // 관리자가 걸려 있으면 멈춥니다. 비밀번호도 소셜도 없는 관리자는 정상 상태가
  // 아니므로(로그인할 수 없는 관리자), 조용히 지우는 것보다 사람이 봐야 합니다.
  const admins = targets.filter((t) => t.is_admin);
  if (admins.length > 0) {
    console.error(
      `\n✖ 대상에 관리자 계정이 ${admins.length}건 있습니다. ` +
        '로그인 수단 없는 관리자는 정상 상태가 아니니 먼저 확인하세요.',
    );
    process.exit(1);
  }

  console.log('\nCASCADE 로 함께 지워지는 행:');
  let total = 0;
  for (const table of CASCADING) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n,
              (SELECT count(*)::int FROM ${table}) AS all_n
       FROM ${table} WHERE player_id IN (${TARGET})`,
    );
    const { n, all_n: allN } = rows[0];
    total += n;
    if (n > 0) console.log(`  ${table.padEnd(16)} ${String(n).padStart(5)} / ${allN}`);
  }

  const { rows: anon } = await client.query(
    `SELECT count(*)::int AS n FROM machine_reports WHERE player_id IN (${TARGET})`,
  );
  console.log(`\n제보 ${anon[0].n}건은 지워지지 않고 익명(player_id = NULL)이 됩니다.`);
  console.log(`합계 — 플레이어 ${targets.length}명 + 딸린 행 ${total}건\n`);

  if (!apply) {
    console.log('dry-run 입니다. 아무것도 지우지 않았습니다.');
    console.log('실제로 지우려면 덤프를 먼저 뜨고 --yes 를 붙여 다시 실행하세요.');
    process.exit(0);
  }

  // 한 트랜잭션 — 중간에 실패하면 DB 는 건드리기 전 상태로 돌아갑니다.
  await client.query('BEGIN');
  const { rowCount } = await client.query(`DELETE FROM players WHERE id IN (${TARGET})`);
  await client.query('COMMIT');
  console.log(`✔ 플레이어 ${rowCount}명을 삭제했습니다 (딸린 행은 CASCADE 로 함께).`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('✖ 실패 — 아무것도 지워지지 않았습니다.');
  throw err;
} finally {
  await client.end();
}
