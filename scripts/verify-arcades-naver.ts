/**
 * DB 의 오락실을 네이버 지역 검색으로 확인하고, 없는 곳을 지웁니다.
 *
 *   npm run arcades:verify                    확인만 (DB 안 건드림 · 이어서 하기)
 *   npm run arcades:verify -- --limit 300     호출 상한을 두고 나눠 돌기
 *   npm run arcades:verify -- --report        캐시된 결과만 다시 요약
 *   npm run arcades:verify -- --delete        'absent' 로 판정된 행 삭제
 *
 * ─────────────────────────────────────────────────────────────────────
 * [지우기 전에 알아야 할 것]
 *   "검색해서 안 나오면 삭제" 를 글자 그대로 하면 **실재하는 오락실을 지웁니다.**
 *   지역 검색은 한 질의에 최대 5건이고 start 가 무시되므로, 체인 이름은 원하는
 *   지점이 상한 밖으로 밀려 안 보입니다. 예를 들어 "경기 왕오락실" 은 포천·평택·
 *   광주·고양·용인 5곳만 주고 남양주는 아예 나오지 않습니다.
 *
 *   그래서 판정을 셋으로 나눕니다 (lib/arcade-verify.ts judge):
 *     found        반경 300m 안에 결과가 있거나 이름+시군구가 맞는다 → 유지
 *     absent       가장 좁은 질의가 상한에 걸리지 않았는데도 못 맞췄다 → 삭제 대상
 *     inconclusive 상한에 걸려 더 볼 수 없다 → **지우지 않습니다**
 *
 *   --delete 는 absent 만 지웁니다. 지우기 전에 그 행 전체를 복구용 파일로
 *   남깁니다 (localdata/deleted-by-naver-verify.json).
 *
 * [호출량]
 *   질의는 좁은 것부터 최대 3개, 첫 질의에서 맞으면 거기서 멈춥니다.
 *   1,695곳이면 대략 3,000~4,500회입니다. 지역 검색 무료 한도는 하루 25,000회라
 *   한 번에 끝나지만, 나눠 돌 수 있게 --limit 을 둡니다. 결과는 캐시에 남아
 *   다시 부르지 않습니다.
 * ─────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getDb } from '../lib/db.ts';
import { NaverLocalError, searchLocal, type NaverLocalItem } from '../lib/naver-local.ts';
import {
  buildQueries,
  judge,
  regionOf,
  rescueQueries,
  planAddressMerges,
  type Verdict,
} from '../lib/arcade-verify.ts';
import { splitAtArcadeWord } from '../lib/localdata-games.ts';

// ─── .env.local 최소 파싱 (다른 스크립트와 같은 방식) ─────────────────
const root = process.cwd();
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const valueOf = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const doDelete = has('--delete');
const reportOnly = has('--report');
/** 주소가 같은 행을 네이버 이름으로 합칩니다 */
const doMerge = has('--merge');
const dataDir = valueOf('--dir') ?? path.join(root, 'localdata');
const callBudget = valueOf('--limit') ? Number(valueOf('--limit')) : Infinity;

const CACHE_FILE = path.join(dataDir, 'naver-verify.json');
const DELETED_FILE = path.join(dataDir, 'deleted-by-naver-verify.json');
const MERGED_FILE = path.join(dataDir, 'merged-by-address.json');

const n = (v: number) => v.toLocaleString('ko-KR');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(lines: string[]): never {
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
}

function portInUse(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const done = (v: boolean) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

interface Arcade {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: string | null;
}

interface CacheEntry {
  verdict: Verdict;
  reason: string;
  matchedTitle: string | null;
  /** 실제로 던진 질의들 — 나중에 사람이 같은 검색을 재현할 수 있게 */
  queries: string[];
  /** 구제 질의까지 돌렸는지. 한 번 돌린 것은 다시 부르지 않습니다 */
  rescued?: boolean;
  name: string;
  address: string;
  source: string | null;
}

const db = await getDb();
const { rows: arcades } = await db.query<Arcade>(
  `SELECT id, name, address, lat, lng, source FROM arcades ORDER BY id`,
);
console.log(`DB 오락실 ${n(arcades.length)}곳`);

fs.mkdirSync(dataDir, { recursive: true });
const cache: Record<string, CacheEntry> = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  : {};
const saveCache = () =>
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');

// ─── 확인 ─────────────────────────────────────────────────────────────
if (!reportOnly) {
  const todo = arcades.filter((a) => !(a.id in cache));
  console.log(`확인 완료 ${n(arcades.length - todo.length)}곳 · 남은 ${n(todo.length)}곳`);

  let calls = 0;
  let done = 0;
  for (const a of todo) {
    const region = regionOf(a.address);
    const queries = buildQueries(a.name, region);
    if (!queries.length) {
      // 주소에서 지역을 못 뽑으면 판정하지 않습니다 — 지울 근거가 없습니다.
      cache[a.id] = {
        verdict: 'inconclusive',
        reason: '주소에서 지역을 뽑지 못함',
        matchedTitle: null,
        queries: [],
        name: a.name,
        address: a.address,
        source: a.source,
      };
      continue;
    }

    const results: NaverLocalItem[][] = [];
    const used: string[] = [];
    let verdictSoFar = null as ReturnType<typeof judge> | null;

    for (const q of queries) {
      if (calls >= callBudget) break;
      try {
        results.push(await searchLocal(q, { display: 5 }));
      } catch (err) {
        if (err instanceof NaverLocalError && (err.status === 429 || err.status === 401)) {
          saveCache();
          fail([
            `지역 검색이 막혔습니다 (HTTP ${err.status}): ${err.message}`,
            `  지금까지 ${n(done)}곳 확인했고 캐시에 저장했습니다.`,
            '  같은 명령으로 이어서 하세요.',
          ]);
        }
        throw err;
      }
      calls += 1;
      used.push(q);
      verdictSoFar = judge({ name: a.name, lat: a.lat, lng: a.lng, region, results });
      // 첫 질의에서 맞으면 나머지는 부르지 않습니다 (호출 절약)
      if (verdictSoFar.verdict === 'found') break;
      await sleep(110);
    }

    if (!verdictSoFar) break; // 예산 소진
    cache[a.id] = {
      ...verdictSoFar,
      queries: used,
      name: a.name,
      address: a.address,
      source: a.source,
    };
    done += 1;
    if (done % 25 === 0) {
      saveCache();
      process.stdout.write(`  ${n(done)}/${n(todo.length)}곳 · 호출 ${n(calls)}회\r`);
    }
    await sleep(110);
  }
  saveCache();
  console.log(`\n확인 ${n(done)}곳 · 호출 ${n(calls)}회`);
  if (calls >= callBudget) {
    console.log('  ⏸ --limit 에 걸려 멈췄습니다. 같은 명령으로 이어서 하세요.');
  }
}

// ─── 구제 패스 ────────────────────────────────────────────────────────
/*
 * absent 로 기운 행을 한 번 더 봅니다. 이름으로 찾는 방식은 **인허가 상호와
 * 간판 이름이 다르면 0건**이 되고, 0건은 비교할 좌표조차 주지 않습니다.
 * 실제로 '엔엔대빵오락실'(서초구 방배동)은 네이버에 '대빵오락실 방배점' 으로
 * 있는 실재 업소인데 0건이 나왔습니다. 그대로 지우면 안 됩니다.
 * 규칙과 근거는 lib/arcade-verify.ts rescueQueries 주석에 있습니다.
 */
if (!reportOnly) {
  const needRescue = arcades.filter(
    (a) => cache[a.id]?.verdict === 'absent' && !cache[a.id].rescued,
  );
  if (needRescue.length) {
    console.log(`
구제 질의 — absent ${n(needRescue.length)}곳을 다시 봅니다`);
    let calls = 0;
    let saved = 0;
    let done = 0;
    for (const a of needRescue) {
      const region = regionOf(a.address);
      const base = splitAtArcadeWord(a.name)?.base ?? a.name;
      const extra = rescueQueries(a.name, a.address, region, base);
      if (!extra.length) {
        cache[a.id].rescued = true;
        continue;
      }

      const named: NaverLocalItem[][] = [];
      const free: NaverLocalItem[][] = [];
      const used = [...cache[a.id].queries];
      for (const e of extra) {
        try {
          const items = await searchLocal(e.query, { display: 5 });
          (e.nameFree ? free : named).push(items);
        } catch (err) {
          if (err instanceof NaverLocalError && (err.status === 429 || err.status === 401)) {
            saveCache();
            fail([`지역 검색이 막혔습니다 (HTTP ${err.status}). 이어서 하세요.`]);
          }
          throw err;
        }
        calls += 1;
        used.push(e.query);
        await sleep(110);
      }

      const j = judge({
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        region,
        // [0] 은 원래 가장 좁은 질의 결과여야 하는데 캐시에 없습니다. 상한 판정은
        // 이미 끝났으므로(absent 였다) 빈 배열을 넣어 상한에 걸리지 않게 합니다.
        results: [[], ...named],
        nameFreeResults: free,
      });
      cache[a.id] = { ...cache[a.id], ...j, queries: used, rescued: true };
      if (j.verdict !== 'absent') saved += 1;
      done += 1;
      if (done % 25 === 0) {
        saveCache();
        process.stdout.write(`  ${n(done)}/${n(needRescue.length)}곳 · 호출 ${n(calls)}회 · 구제 ${n(saved)}
`);
      }
    }
    saveCache();
    console.log(`
  구제됨 ${n(saved)}곳 · 호출 ${n(calls)}회`);
  }
}

// ─── 요약 ─────────────────────────────────────────────────────────────
const judged = arcades.filter((a) => a.id in cache);
const bucket = (v: Verdict) => judged.filter((a) => cache[a.id].verdict === v);
const found = bucket('found');
/*
 * 삭제는 **행정안전부 인허가로 넣은 행(localdata)** 만 대상입니다.
 *
 * naver 출처 행을 여기서 지우지 않는 이유: 그 행들은 애초에 네이버 지역 검색으로
 * 만든 것이고 `npm run arcades:import` 가 같은 검색으로 다시 넣습니다. 여기서
 * 지워도 다음 수입에 되살아나므로 지우는 의미가 없고, 사람이 채운 영업시간·기종만
 * 잃습니다. 네이버 쪽에서 사라진 가게라면 그 수입 과정에서 정리되는 게 맞습니다.
 */
const absent = bucket('absent').filter((a) => a.source === 'localdata');
const absentOther = bucket('absent').filter((a) => a.source !== 'localdata');
const unclear = bucket('inconclusive');

console.log(`\n판정 ${n(judged.length)}곳 / 전체 ${n(arcades.length)}곳`);
console.log(`  found        ${n(found.length).padStart(6)}곳  유지`);
console.log(`  absent       ${n(absent.length).padStart(6)}곳  삭제 대상 (localdata 만)`);
if (absentOther.length) {
  console.log(`               ${n(absentOther.length).padStart(6)}곳  absent 이지만 다른 출처라 건드리지 않음`);
}
console.log(`  inconclusive ${n(unclear.length).padStart(6)}곳  5건 상한에 막혀 판단 불가 — 지우지 않습니다`);

// 출처별로 나눠 봅니다. naver 출처가 absent 로 많이 나오면 판정이 너무 엄격한 것입니다
// (그 행들은 애초에 네이버에서 가져온 것이므로 대부분 found 여야 합니다).
console.log('\n출처별:');
for (const src of [...new Set(judged.map((a) => a.source))]) {
  const rows = judged.filter((a) => a.source === src);
  const c = (v: Verdict) => rows.filter((a) => cache[a.id].verdict === v).length;
  console.log(
    `  ${String(src).padEnd(10)} found ${n(c('found')).padStart(5)} · absent ${n(c('absent')).padStart(5)} · 판단불가 ${n(c('inconclusive')).padStart(5)}`,
  );
}

console.log('\nabsent 표본 15곳:');
for (const a of absent.slice(0, 15)) {
  console.log(`  ${a.name}  |  ${a.address}`);
  console.log(`     질의: ${cache[a.id].queries.join(' / ')}  →  ${cache[a.id].reason}`);
}

console.log(`\n전체 판정 내역: ${path.relative(root, CACHE_FILE)}`);

// ─── 병합 ─────────────────────────────────────────────────────────────
/*
 * 같은 오락실이 두 출처로 두 번 들어와 있고 이름만 다릅니다. 층·호와 끝 괄호를
 * 뗀 주소가 같으면 같은 자리로 보고 하나로 합칩니다. 규칙은
 * lib/arcade-verify.ts planAddressMerges 주석에 있습니다.
 */
{
  const plans = planAddressMerges(
    arcades.map((a) => ({
      id: a.id,
      name: a.name,
      address: a.address,
      source: a.source,
      // verdict 가 found 일 때만 씁니다. inconclusive 의 matchedTitle 은
      // '그 자리에 있는 다른 오락실' 이라 이름으로 쓰면 엉뚱해집니다.
      naverTitle: cache[a.id]?.verdict === 'found' ? cache[a.id].matchedTitle : null,
    })),
  );
  const dropCount = plans.reduce((s2, p) => s2 + p.dropIds.length, 0);
  const renameCount = plans.filter((p) => {
    const keep = arcades.find((a) => a.id === p.keepId);
    return keep && keep.name !== p.name;
  }).length;

  console.log(`
주소가 같아 합칠 그룹 ${n(plans.length)}개 — 지울 행 ${n(dropCount)}개 · 이름 바꿀 행 ${n(renameCount)}개`);
  for (const p of plans.slice(0, 12)) {
    const keep = arcades.find((a) => a.id === p.keepId);
    const drops = p.dropIds.map((id) => arcades.find((a) => a.id === id)?.name ?? String(id));
    console.log(`  ${keep?.name} → "${p.name}"  (${p.reason})`);
    console.log(`     흡수: ${drops.join(' / ')}`);
  }
  if (plans.length > 12) console.log(`  … 그 외 ${n(plans.length - 12)}개 그룹`);

  if (doMerge && plans.length) {
    if (!process.env.DATABASE_URL && (await portInUse(3000))) {
      fail(['포트 3000 에 무언가 떠 있습니다. 먼저 멈춰 주세요 (PGlite 는 한 프로세스만 엽니다).']);
    }
    const dropIds = plans.flatMap((p) => p.dropIds);
    const { rows: doomed } = await db.query<Record<string, unknown>>(
      `SELECT * FROM arcades WHERE id = ANY($1::int[]) ORDER BY id`,
      [dropIds],
    );
    fs.writeFileSync(
      MERGED_FILE,
      `${JSON.stringify({ plans, dropped: doomed }, null, 2)}
`,
      'utf8',
    );
    console.log(`
복구용 저장: ${path.relative(root, MERGED_FILE)}`);

    let renamed = 0;
    await db.transaction(async (tx) => {
      for (const p of plans) {
        const { rows } = await tx.query<{ id: number }>(
          `UPDATE arcades SET name = $2, updated_at = now()
            WHERE id = $1 AND name <> $2 RETURNING id`,
          [p.keepId, p.name],
        );
        renamed += rows.length;
      }
      if (dropIds.length) {
        await tx.query(`DELETE FROM arcades WHERE id = ANY($1::int[])`, [dropIds]);
      }
    });
    console.log(`병합 완료 — 이름 변경 ${n(renamed)}행 · 삭제 ${n(dropIds.length)}행`);
  } else if (plans.length) {
    console.log(`
합치려면:  npm run arcades:verify -- --merge`);
  }
}

// ─── 삭제 ─────────────────────────────────────────────────────────────
if (!doDelete) {
  console.log(
    `\nDB 는 건드리지 않았습니다.` +
      `\n지우려면:  npm run arcades:verify -- --delete   (absent ${n(absent.length)}곳)`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL && (await portInUse(3000))) {
  fail([
    '포트 3000 에 무언가(아마도 next dev) 떠 있습니다. 먼저 멈춰 주세요.',
    '  PGlite 는 한 프로세스만 데이터 디렉터리를 열 수 있습니다.',
  ]);
}

if (!absent.length) {
  console.log('\n지울 것이 없습니다.');
  process.exit(0);
}

// 복구용으로 행 전체를 먼저 남깁니다.
const { rows: doomed } = await db.query<Record<string, unknown>>(
  `SELECT * FROM arcades WHERE id = ANY($1::int[]) ORDER BY id`,
  [absent.map((a) => a.id)],
);
fs.writeFileSync(DELETED_FILE, `${JSON.stringify(doomed, null, 2)}\n`, 'utf8');
console.log(`\n복구용 저장: ${path.relative(root, DELETED_FILE)} (${n(doomed.length)}행)`);

const { rows: gone } = await db.query<{ id: number }>(
  `DELETE FROM arcades WHERE id = ANY($1::int[]) RETURNING id`,
  [absent.map((a) => a.id)],
);
console.log(`삭제 ${n(gone.length)}곳`);

const { rows: after } = await db.query<{ source: string | null; n: number }>(
  `SELECT source, COUNT(*)::int AS n FROM arcades GROUP BY source ORDER BY source`,
);
console.log('\n남은 arcades:');
for (const r of after) console.log(`  ${r.source ?? '(출처 미기록)'}: ${n(r.n)}곳`);
console.log(
  `\n판단불가 ${n(unclear.length)}곳은 그대로 뒀습니다 — 5건 상한 때문에 "없다" 고 말할 수 없는 것들입니다.\n`,
);
process.exit(0);
