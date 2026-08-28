/**
 * 저장된 오락실 좌표가 속한 건물 폴리곤(브이월드 LT_C_SPBD)을 찾아, 그 중심으로
 * 다시 보정합니다. scripts/regeocode-arcades.ts(주소→좌표)까지 거쳐도 좌표가
 * "건물 출입구/도로변"에 머무는 한계를 넘기 위한 다음 단계입니다 — lib/vworld-building.ts
 * 상단 주석 참고.
 *
 *   npm run arcades:regeocode-building                       미리보기 (DB 안 건드림)
 *   npm run arcades:regeocode-building -- --write             실제로 좌표 갱신
 *   npm run arcades:regeocode-building -- --threshold 0.01    보정 기준 거리(km, 기본 0.005=5m)
 *   npm run arcades:regeocode-building -- --limit 300         이번 실행 호출 상한
 *
 * [threshold 를 낮게 잡은 이유]
 *   scripts/regeocode-arcades.ts 는 도로변 대표점 하나를 다른 도로변 대표점으로
 *   바꾸는 거라 오차가 수십 m 단위였지만, 여기는 이미 그 근처인 좌표를 "같은 건물
 *   폴리곤 안"으로 미세 조정하는 것뿐이라 대부분 10m 이내로 끝납니다. 30m 를 쓰면
 *   거의 다 걸러져 버립니다.
 *
 * [건물을 못 찾는 경우]
 *   그 좌표에 건물 폴리곤이 없으면(공터, 도로 한복판, 지도 오차로 건물 밖으로
 *   벗어난 경우) null 이 오는데, 좌표를 억지로 옮기지 않고 그대로 둡니다 —
 *   엉뚱한 옆 건물로 스냅될 위험이 지오코딩보다 더 크기 때문입니다.
 */

import { getDb } from '../lib/db.ts';
import { getBuildingCentroid, VWorldError } from '../lib/vworld-building.ts';
import { distanceKm, formatDistance } from '../lib/geo.ts';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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

const write = has('--write');
const threshold = Number(valueOf('--threshold') ?? '0.005');
const limit = Number(valueOf('--limit') ?? '2000');

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!Number.isFinite(threshold) || threshold < 0) fail('--threshold 는 0 이상의 숫자(km)여야 합니다');
if (!Number.isFinite(limit) || limit < 0) fail('--limit 은 0 이상의 숫자여야 합니다');

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

if (write && !process.env.DATABASE_URL && (await portInUse(3000))) {
  fail(
    [
      '포트 3000 에 무언가(아마도 next dev) 떠 있습니다. 먼저 멈춰 주세요.',
      '  기본 DB(PGlite)는 한 프로세스만 데이터 디렉터리를 열 수 있어, 켜둔 채로',
      '  쓰면 결과가 화면에 반영되지 않고 데이터가 깨질 수 있습니다.',
    ].join('\n'),
  );
}

const db = await getDb();
const { rows: arcades } = await db.query<{ id: number; name: string; address: string; lat: number; lng: number }>(
  `SELECT id, name, address, lat, lng FROM arcades WHERE source = 'naver' ORDER BY id`,
);

console.log(`대상 ${arcades.length}곳 (source='naver') · threshold ${formatDistance(threshold)} · 호출 상한 ${limit}`);
if (!write) console.log('미리보기입니다 — 반영하려면 --write 를 붙이세요.\n');

interface Change {
  id: number;
  name: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  distanceKm: number;
}

const changes: Change[] = [];
const noBuilding: string[] = [];
const errored: { name: string; message: string }[] = [];

let calls = 0;
for (const a of arcades) {
  if (calls >= limit) {
    console.log(`\n⏸ 호출 상한(${limit})에 도달해 멈췄습니다. 나머지는 다음 실행에서 이어집니다.`);
    break;
  }
  calls += 1;

  let result;
  try {
    result = await getBuildingCentroid({ lat: a.lat, lng: a.lng });
  } catch (e) {
    if (e instanceof VWorldError && e.code === 'NO_KEY') throw e; // 자격증명 누락 — 계속해봐야 전부 같은 에러
    errored.push({ name: a.name, message: (e as Error).message });
    continue;
  }

  if (!result) {
    noBuilding.push(`${a.name} (${a.address})`);
    continue;
  }

  const d = distanceKm({ lat: a.lat, lng: a.lng }, { lat: result.lat, lng: result.lng });
  if (d >= threshold) {
    changes.push({
      id: a.id,
      name: a.name,
      from: { lat: a.lat, lng: a.lng },
      to: { lat: result.lat, lng: result.lng },
      distanceKm: d,
    });
  }

  // 초당 요청 제한 회피 (다른 재보정 스크립트와 같은 값)
  await new Promise((r) => setTimeout(r, 120));
}

changes.sort((x, y) => y.distanceKm - x.distanceKm);

console.log(
  `\n조회 ${calls}건 · 보정 대상 ${changes.length}건 · 건물 못 찾음 ${noBuilding.length}건 · 오류 ${errored.length}건\n`,
);

for (const c of changes) {
  console.log(
    `  ${formatDistance(c.distanceKm).padStart(6)}  ${c.name}` +
      `  (${c.from.lat.toFixed(6)},${c.from.lng.toFixed(6)} → ${c.to.lat.toFixed(6)},${c.to.lng.toFixed(6)})`,
  );
}

if (noBuilding.length) {
  console.log(`\n그 좌표에서 건물 폴리곤을 못 찾은 곳 (좌표 그대로 둠):`);
  for (const n of noBuilding.slice(0, 20)) console.log(`  - ${n}`);
  if (noBuilding.length > 20) console.log(`  ... 외 ${noBuilding.length - 20}건`);
}

if (errored.length) {
  console.log(`\n조회 중 오류가 난 곳 (좌표 그대로 둠):`);
  for (const e of errored.slice(0, 20)) console.log(`  - ${e.name}: ${e.message}`);
  if (errored.length > 20) console.log(`  ... 외 ${errored.length - 20}건`);
}

if (!write) {
  console.log('\n반영하려면 --write 를 붙여 다시 실행하세요.\n');
  process.exit(0);
}

if (!changes.length) {
  console.log('\n반영할 변경이 없습니다.\n');
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const c of changes) {
    await tx.query(`UPDATE arcades SET lat = $2, lng = $3, updated_at = now() WHERE id = $1`, [
      c.id,
      c.to.lat,
      c.to.lng,
    ]);
  }
});

console.log(`\n반영 완료 — ${changes.length}곳 좌표 갱신\n`);
process.exit(0);
