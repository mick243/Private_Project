/**
 * 공공데이터포털 청소년게임제공업(영업중)에서 **오락실만** 골라 arcades 에 넣습니다.
 *
 *   npm run games:localdata                     ① 먼저 이걸로 목록을 받아 둡니다
 *   npm run arcades:localdata                   ② 분류만 (DB·네트워크 안 건드림)
 *   npm run arcades:localdata -- --geocode      ③ 주소 → 좌표 (이어서 하기)
 *   npm run arcades:localdata -- --write        ④ DB 반영
 *   npm run arcades:localdata -- --geocode --write   ③+④ 한 번에
 *   npm run arcades:localdata -- --unify-names  ⑤ 띄어쓰기만 통일 (--write 에 포함)
 *
 * ─────────────────────────────────────────────────────────────────────
 * [왜 좌표를 따로 구하는가 — "이름과 주소만" 인데도]
 *   arcades.lat / lng 는 NOT NULL 입니다. 지도가 이 앱의 본체이므로 좌표 없는
 *   행은 애초에 넣을 수 없습니다. 그리고 응답의 CRD_INFO_X/Y 는 위경도가 아니라
 *   EPSG:5174(보정계수 없는 Bessel 중부원점TM)라 그대로 못 씁니다.
 *   그래서 **주소에서** 좌표를 얻습니다 (lib/naver-geocode.ts). 좌표는 새로
 *   가져온 정보가 아니라 주소를 옮겨 적은 것이라, "이름과 주소만" 을 어기지
 *   않습니다. 영업시간·전화·기종·기기수는 전부 넣지 않습니다.
 *
 * [뽑기방을 어떻게 걸러내는가]
 *   lib/localdata-games.ts 의 classifyByName 입니다. 근거와 실측값은 그 파일
 *   주석에 적어 두었습니다. 요약하면 이름이 유일한 신호이고, 면적·기기수로는
 *   갈라지지 않습니다.
 *   arcade  → 넣습니다
 *   claw    → 넣지 않습니다 (localdata/youth-claw.json 에 남깁니다)
 *   unknown → 넣지 않습니다 (localdata/youth-unknown.json 에 남깁니다)
 *             브랜드 이름만 있어 사람이 봐야 하는 것들입니다. 통째로 넣으면
 *             DB 가 나빠지고, 통째로 버리면 진짜 오락실이 섞여 사라집니다.
 *             그래서 **버리지 않고 파일로 남깁니다.**
 *
 * [같은 오락실을 두 번 넣지 않기]
 *   1. source_ref = 'localdata:youth:{자치단체코드}:{관리번호}' — 재실행 안전
 *   2. 이미 있는 행과 이름이 같고 150m 안이면 건너뜁니다 — 네이버로 넣은 709곳과
 *      겹치는 것들입니다. 덮어쓰지 않는 이유: 그쪽 행에는 사람이 채운 영업시간·
 *      기종이 붙어 있을 수 있습니다.
 * ─────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getDb } from '../lib/db.ts';
import { geocodeAddress, NaverGeocodeError } from '../lib/naver-geocode.ts';
import {
  classifyByName,
  stripCorporateForm,
  unifySpellings,
  type GameProvider,
} from '../lib/localdata-games.ts';
import { normalizeName } from '../lib/naver-local.ts';
import { distanceKm } from '../lib/geo.ts';

// ─── .env.local 최소 파싱 (scripts/import-arcades.ts 와 같은 방식) ────
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
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const doGeocode = has('--geocode');
const doWrite = has('--write');
/** 띄어쓰기가 갈린 이름을 대표 표기로 맞춥니다. --write 에는 항상 포함됩니다 */
const doUnify = has('--unify-names') || has('--write');
const dataDir = valueOf('--dir') ?? path.join(root, 'localdata');
const limitArg = valueOf('--limit');
const limit = limitArg ? Number(limitArg) : Infinity;

const OPEN_FILE = path.join(dataDir, 'youth-open.json');
const ARCADE_FILE = path.join(dataDir, 'youth-arcades.json');
const CLAW_FILE = path.join(dataDir, 'youth-claw.json');
const UNKNOWN_FILE = path.join(dataDir, 'youth-unknown.json');
const GEO_FILE = path.join(dataDir, 'youth-geocoded.json');

const n = (v: number) => v.toLocaleString('ko-KR');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(lines: string[]): never {
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
}

/** PGlite 는 한 프로세스만 데이터 디렉터리를 엽니다 (scripts/import-arcades.ts 와 같은 가드) */
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

// ─── ① 분류 ───────────────────────────────────────────────────────────
if (!fs.existsSync(OPEN_FILE)) {
  fail([
    `${path.relative(root, OPEN_FILE)} 가 없습니다.`,
    '  먼저 목록을 받아 주세요:  npm run games:localdata',
  ]);
}

const open: GameProvider[] = JSON.parse(fs.readFileSync(OPEN_FILE, 'utf8'));
const buckets = { arcade: [] as GameProvider[], claw: [] as GameProvider[], unknown: [] as GameProvider[] };
for (const p of open) buckets[classifyByName(p.name)].push(p);

fs.mkdirSync(dataDir, { recursive: true });
const dump = (file: string, list: GameProvider[]) =>
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
dump(ARCADE_FILE, buckets.arcade);
dump(CLAW_FILE, buckets.claw);
dump(UNKNOWN_FILE, buckets.unknown);

console.log(`영업중 ${n(open.length)}곳을 이름으로 분류했습니다:`);
console.log(`  오락실   ${n(buckets.arcade.length).padStart(6)}곳  → DB 에 넣습니다`);
console.log(`  뽑기·가챠 ${n(buckets.claw.length).padStart(5)}곳  → 넣지 않습니다   ${path.relative(root, CLAW_FILE)}`);
console.log(`  판단보류 ${n(buckets.unknown.length).padStart(6)}곳  → 넣지 않습니다   ${path.relative(root, UNKNOWN_FILE)}`);

/** 업소 고유키 — 재실행해도 같은 값이어야 합니다 */
const refOf = (p: GameProvider) => `localdata:youth:${p.localCode ?? '?'}:${p.mngNo ?? p.name}`;

/** 넣을 주소 — 도로명이 있으면 그것, 없으면 지번 */
const addressOf = (p: GameProvider) => p.roadAddr ?? p.lotAddr ?? '';

/**
 * 지오코딩에 넣어 볼 주소 후보들.
 *
 * 인허가 주소에는 "…상리2길 97, 105호" 처럼 호수가 붙습니다. 그대로 물어보면
 * 못 찾는 경우가 있어 쉼표 뒤를 떼어낸 것도 시도합니다. 도로명이 안 되면 지번도
 * 봅니다 — 신설 행정구역(예: 화성시 효행구)은 도로명 쪽이 늦게 반영됩니다.
 */
function addressCandidates(p: GameProvider): string[] {
  const cut = (s: string | null) => (s ? s.split(',')[0].trim() : '');
  const list = [p.roadAddr ?? '', cut(p.roadAddr), p.lotAddr ?? '', cut(p.lotAddr)];
  return [...new Set(list.filter((s) => s.length > 4))];
}

// ─── ② 지오코딩 ───────────────────────────────────────────────────────
interface GeoEntry {
  lat: number | null;
  lng: number | null;
  /** 실제로 좌표를 얻어낸 주소 문자열. null 이면 못 찾은 것 */
  matched: string | null;
}
type GeoCache = Record<string, GeoEntry>;

const geo: GeoCache = fs.existsSync(GEO_FILE)
  ? JSON.parse(fs.readFileSync(GEO_FILE, 'utf8'))
  : {};

const saveGeo = () => fs.writeFileSync(GEO_FILE, `${JSON.stringify(geo, null, 2)}\n`, 'utf8');

const todo = buckets.arcade.filter((p) => !(refOf(p) in geo));
console.log(
  `\n좌표: 완료 ${n(buckets.arcade.length - todo.length)}곳 · 남은 ${n(todo.length)}곳`,
);

if (doGeocode && todo.length) {
  console.log('\n주소 → 좌표 조회 (lib/naver-geocode.ts · 중간에 끊어도 이어서 합니다)');
  let done = 0;
  let found = 0;
  for (const p of todo.slice(0, limit)) {
    let entry: GeoEntry = { lat: null, lng: null, matched: null };
    for (const cand of addressCandidates(p)) {
      try {
        const r = await geocodeAddress(cand);
        if (r) {
          entry = { lat: r.lat, lng: r.lng, matched: cand };
          break;
        }
      } catch (err) {
        if (err instanceof NaverGeocodeError && err.status === 429) {
          // 한도에 닿았으면 여기서 멈춥니다. 지금까지 한 것은 파일에 있습니다.
          saveGeo();
          fail([
            '지오코딩 호출 한도에 걸렸습니다 (429).',
            `  지금까지 ${n(done)}곳 처리했고 파일에 저장했습니다.`,
            '  잠시 후 같은 명령으로 이어서 하세요.',
          ]);
        }
        throw err;
      }
      await sleep(100);
    }
    geo[refOf(p)] = entry;
    done += 1;
    if (entry.matched) found += 1;
    if (done % 25 === 0) {
      saveGeo(); // 중간에 죽어도 다시 부르지 않게 자주 저장합니다
      process.stdout.write(`  ${n(done)}/${n(Math.min(todo.length, limit))}곳 · 찾음 ${n(found)}\r`);
    }
    await sleep(100);
  }
  saveGeo();
  console.log(`\n  완료 ${n(done)}곳 · 좌표 찾음 ${n(found)}곳 · 못 찾음 ${n(done - found)}곳`);
}

// ─── ③ DB 반영 ────────────────────────────────────────────────────────
// todo 는 지오코딩 전에 센 값이라 여기서 다시 셉니다.
const remaining = buckets.arcade.filter((p) => !(refOf(p) in geo));
const ready = buckets.arcade.filter((p) => geo[refOf(p)]?.matched);
const noCoord = buckets.arcade.filter((p) => refOf(p) in geo && !geo[refOf(p)].matched);

if (!doWrite && !doUnify) {
  console.log(
    `\n미리보기입니다 — DB 는 건드리지 않았습니다.` +
      `\n  좌표까지 준비된 오락실: ${n(ready.length)}곳` +
      (noCoord.length ? `\n  주소로 좌표를 못 찾은 곳: ${n(noCoord.length)}곳 (넣지 않습니다)` : '') +
      (remaining.length ? `\n  좌표 미조회: ${n(remaining.length)}곳 → --geocode` : '') +
      `\n\n반영하려면:  npm run arcades:localdata -- --write`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL && (await portInUse(3000))) {
  fail([
    '포트 3000 에 무언가(아마도 next dev) 떠 있습니다. 먼저 멈춰 주세요.',
    '  기본 DB(PGlite)는 한 프로세스만 데이터 디렉터리를 열 수 있어, 켜둔 채로',
    '  쓰면 결과가 화면에 반영되지 않고 데이터가 깨질 수 있습니다.',
    '  실제 Postgres(DATABASE_URL)를 쓰면 이 제한이 없습니다.',
  ]);
}

if (!ready.length && doWrite) {
  fail([
    '넣을 것이 없습니다 — 좌표가 준비된 오락실이 0곳입니다.',
    '  먼저:  npm run arcades:localdata -- --geocode',
  ]);
}

const db = await getDb();

let inserted = 0;
let already = 0;
let dupOfExisting = 0;

if (doWrite) await db.transaction(async (tx) => {
  // 겹침 판정에 쓸 기존 행. 709곳 규모라 한 번에 읽어 메모리에서 비교합니다.
  const { rows: existing } = await tx.query<{
    id: number;
    name: string;
    lat: number;
    lng: number;
  }>(`SELECT id, name, lat, lng FROM arcades`);
  const existingIndexed = existing.map((r) => ({ ...r, key: normalizeName(r.name) }));

  for (const p of ready) {
    const ref = refOf(p);
    const { lat, lng } = geo[ref];
    // 인허가 원부는 사업자명을 적으므로 '(주)…' 이 붙어 옵니다. 보여줄 이름에서
    // 빼냅니다 — db/migrate-010 이 기존 행에 대해 같은 일을 합니다.
    const name = stripCorporateForm(p.name ?? '');
    const address = addressOf(p);
    if (!name || !address || lat === null || lng === null) continue;

    const { rows: mine } = await tx.query<{ id: number }>(
      `SELECT id FROM arcades WHERE source_ref = $1 LIMIT 1`,
      [ref],
    );
    if (mine[0]) {
      already += 1;
      continue;
    }

    /*
     * 네이버로 넣은 행과 같은 오락실일 수 있습니다. 이름이 같고 150m 안이면
     * 같은 곳으로 보고 **건너뜁니다** — 덮어쓰지 않는 이유는 그쪽에 사람이
     * 확인해 채운 영업시간·기종이 붙어 있을 수 있기 때문입니다.
     * (150m 는 lib/naver-local.ts 의 dedupePlaces 기본값과 같습니다.)
     */
    const key = normalizeName(name);
    const twin = existingIndexed.find(
      (r) => r.key === key && distanceKm({ lat: r.lat, lng: r.lng }, { lat, lng }) <= 0.15,
    );
    if (twin) {
      dupOfExisting += 1;
      continue;
    }

    // 이름·주소·좌표만. 영업시간·전화·기종은 넣지 않습니다 (정보가 없습니다).
    await tx.query(
      `INSERT INTO arcades
         (name, address, lat, lng, open_time, close_time, is_24h, phone, note,
          source, source_ref)
       VALUES ($1, $2, $3, $4, NULL, NULL, FALSE, NULL, NULL, 'localdata', $5)`,
      [name, address, lat, lng, ref],
    );
    inserted += 1;
    existingIndexed.push({ id: -1, name, lat, lng, key });
  }
});

// ─── ④ 띄어쓰기 통일 ─────────────────────────────────────────────────
/*
 * 인허가 원부의 등록 표기를 그대로 넣으므로 '왕오락실' 과 '왕 오락실' 이 함께
 * 남습니다. 목록에서 같은 이름이 두 표기로 보이는 것을 없앱니다.
 *
 * 넣기 **뒤에** 하는 이유: 새로 들어온 행까지 함께 봐야 대표 표기를 제대로
 * 고를 수 있습니다. 규칙과 근거는 lib/localdata-games.ts 의 pickCanonicalName.
 * 네이버 행은 바뀌지 않습니다 — 그쪽 이름을 고쳐 두면 다음 arcades:import 가
 * source_ref 로 찾아 덮어써서 조용히 되돌립니다.
 */
let renamed = 0;
if (doUnify) {
  const { rows: all } = await db.query<{ id: number; name: string; source: string | null }>(
    `SELECT id, name, source FROM arcades`,
  );
  const changes = unifySpellings(all);

  if (changes.length) {
    // 되돌릴 수 있게 바뀐 내역을 남깁니다 (덮어쓰지 않고 실행마다 새 파일).
    const logFile = path.join(dataDir, 'renamed-spellings.json');
    fs.writeFileSync(logFile, `${JSON.stringify(changes, null, 2)}\n`, 'utf8');

    await db.transaction(async (tx) => {
      for (const c of changes) {
        await tx.query(`UPDATE arcades SET name = $2, updated_at = now() WHERE id = $1`, [
          c.id,
          c.to,
        ]);
      }
    });
    renamed = changes.length;
    console.log(`\n띄어쓰기 통일 — ${n(renamed)}행 이름 변경`);
    const groups = new Map<string, string>();
    for (const c of changes) groups.set(`${c.from} → ${c.to}`, c.to);
    for (const label of [...groups.keys()].slice(0, 12)) console.log(`  ${label}`);
    if (groups.size > 12) console.log(`  … 그 외 ${n(groups.size - 12)}가지`);
    console.log(`  전체 내역: ${path.relative(root, logFile)}`);
  } else {
    console.log('\n띄어쓰기 통일 — 바꿀 것 없음');
  }
}

const { rows: after } = await db.query<{ source: string | null; n: number }>(
  `SELECT source, COUNT(*)::int AS n FROM arcades GROUP BY source ORDER BY source`,
);

if (doWrite) console.log(`\n반영 완료 — 새로 ${n(inserted)}곳`);
if (already) console.log(`  이미 넣어 둔 것 ${n(already)}곳 건너뜀 (재실행)`);
if (dupOfExisting) console.log(`  기존 행과 같은 오락실 ${n(dupOfExisting)}곳 건너뜀`);
if (noCoord.length) console.log(`  주소로 좌표를 못 찾아 넣지 못한 곳 ${n(noCoord.length)}곳`);
console.log('\n현재 arcades 구성:');
for (const r of after) console.log(`  ${r.source ?? '(출처 미기록)'}: ${n(r.n)}곳`);
console.log(
  `\n영업시간·보유 기종은 인허가 데이터에 없어 전부 '정보 없음' 입니다.` +
    `\n판단보류 ${n(buckets.unknown.length)}곳은 ${path.relative(root, UNKNOWN_FILE)} 에 있습니다 — 훑어보고 살릴 것이 있으면 알려주세요.\n`,
);
process.exit(0);
