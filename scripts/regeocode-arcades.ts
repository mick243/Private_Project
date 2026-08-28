/**
 * 저장된 오락실 주소를 네이버 **Geocoding** API로 다시 조회해 좌표를 보정합니다.
 *
 *   npm run arcades:regeocode                       미리보기 (DB 안 건드림)
 *   npm run arcades:regeocode -- --write             실제로 좌표 갱신
 *   npm run arcades:regeocode -- --threshold 0.05    보정 기준 거리(km, 기본 0.03=30m)
 *   npm run arcades:regeocode -- --limit 300         이번 실행 호출 상한
 *
 * [왜 필요한가]
 *   scripts/import-arcades.ts 가 쓰는 지역 검색(업체 검색)의 좌표는 건물/블록
 *   중심에 가까운 대표 포인트라, 실제 출입구와 수십 m 어긋나는 경우가 흔합니다.
 *   이미 저장된 address(도로명 주소 우선)를 Geocoding(주소→좌표) API 로 다시
 *   조회하면 대개 더 정확한 좌표가 나옵니다. 이름이 아니라 **주소**로만 조회하므로
 *   업체명이 지도 DB에 없어도 상관없습니다.
 *
 * [threshold 를 두는 이유]
 *   Geocoding 결과도 완벽하진 않습니다. 이미 거의 맞는 좌표를 매번 소수점 단위로
 *   흔들면 diff 만 늘어나고 실익이 없으므로, 기존 좌표와 threshold(기본 30m)
 *   이상 차이 나는 것만 갱신 대상으로 봅니다.
 *
 * [사람이 옮겨 둔 좌표를 덮어쓰지 않는 이유]
 *   source_ref 로 확인해 사람이 손으로 옮긴 좌표(정확도가 이미 검증됨)까지
 *   자동으로 되돌리면 오히려 퇴보입니다. source='naver' 인 행만 대상으로 합니다.
 *
 * .ts 로 두는 이유는 import-arcades.ts 와 같습니다 — Node 24 가 타입만 지우고
 * 그대로 실행하므로 lib/naver-geocode.ts · lib/db.ts 를 그대로 가져다 씁니다.
 */

import { getDb } from '../lib/db.ts';
import { geocodeAddress, NaverGeocodeError } from '../lib/naver-geocode.ts';
import { distanceKm, formatDistance } from '../lib/geo.ts';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// ─── .env.local 최소 파싱 (scripts/import-arcades.ts 와 같은 방식) ────────
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

// ─── 인자 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const write = has('--write');
const threshold = Number(valueOf('--threshold') ?? '0.03');
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
  address: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  distanceKm: number;
}

/**
 * 번지/도로 번호가 없는, 읍·면·동 단위까지만 있는 주소인가.
 *
 * 이런 주소는 원래 좌표도, 재지오코딩 결과도 둘 다 "그 동네 어딘가"의 추정치일
 * 뿐이라 어느 쪽이 더 정확하다고 볼 근거가 없습니다. 자동으로 덮어쓰면 오히려
 * 엉뚱한 방향으로 튈 수 있어(짱구게임 사례 — 3km 차이) 자동 반영 대상에서
 * 빼고 수동 확인 목록으로 따로 보여줍니다.
 */
function isCoarseAddress(address: string): boolean {
  return /(읍|면|동|리|가)$/.test(address.trim());
}

const changes: Change[] = [];
const coarse: Change[] = [];
const notFound: string[] = [];
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
    result = await geocodeAddress(a.address);
  } catch (e) {
    if (e instanceof NaverGeocodeError && e.status === 0) throw e; // 자격증명 누락 — 계속해봐야 전부 같은 에러
    errored.push({ name: a.name, message: (e as Error).message });
    continue;
  }

  if (!result) {
    notFound.push(`${a.name} (${a.address})`);
    continue;
  }

  const d = distanceKm({ lat: a.lat, lng: a.lng }, { lat: result.lat, lng: result.lng });
  if (d >= threshold) {
    const change: Change = {
      id: a.id,
      name: a.name,
      address: a.address,
      from: { lat: a.lat, lng: a.lng },
      to: { lat: result.lat, lng: result.lng },
      distanceKm: d,
    };
    if (isCoarseAddress(a.address)) coarse.push(change);
    else changes.push(change);
  }

  // 초당 요청 제한 회피 (지역 검색 스크립트와 같은 값)
  await new Promise((r) => setTimeout(r, 120));
}

changes.sort((x, y) => y.distanceKm - x.distanceKm);
coarse.sort((x, y) => y.distanceKm - x.distanceKm);

console.log(
  `\n조회 ${calls}건 · 보정 대상 ${changes.length}건 · 주소 부정확(수동 확인 필요) ${coarse.length}건 ` +
    `· 주소 못 찾음 ${notFound.length}건 · 오류 ${errored.length}건\n`,
);

for (const c of changes) {
  console.log(
    `  ${formatDistance(c.distanceKm).padStart(6)}  ${c.name}` +
      `  (${c.from.lat.toFixed(6)},${c.from.lng.toFixed(6)} → ${c.to.lat.toFixed(6)},${c.to.lng.toFixed(6)})`,
  );
}

if (coarse.length) {
  console.log(`\n번지/도로 번호가 없어 자동 반영에서 제외한 곳 (좌표 그대로 둠 — 직접 확인 필요):`);
  for (const c of coarse) {
    console.log(
      `  ${formatDistance(c.distanceKm).padStart(6)}  ${c.name} — ${c.address}` +
        `  (${c.from.lat.toFixed(6)},${c.from.lng.toFixed(6)} → ${c.to.lat.toFixed(6)},${c.to.lng.toFixed(6)})`,
    );
  }
}

if (notFound.length) {
  console.log(`\n주소를 못 찾은 곳 (좌표 그대로 둠):`);
  for (const n of notFound.slice(0, 20)) console.log(`  - ${n}`);
  if (notFound.length > 20) console.log(`  ... 외 ${notFound.length - 20}건`);
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
