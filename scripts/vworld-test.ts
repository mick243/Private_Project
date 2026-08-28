/**
 * 브이월드(VWorld) Data API 진단용 — 건물통합정보(LT_C_BUD) GetFeature 를
 * 샘플 좌표 하나로 호출해 원본 응답을 그대로 출력합니다.
 *
 * 문서만으로는 데이터셋 ID·geomFilter 좌표 순서·응답 지오메트리 형식을
 * 100% 확정할 수 없어서, 실제 키가 생기면 이 스크립트로 먼저 확인하고
 * scripts/regeocode-building-center.ts 의 파싱 로직을 맞춥니다.
 *
 *   npm run arcades:vworld-test                         기본 샘플 좌표
 *   npm run arcades:vworld-test -- --lat 37.4803599 --lng 126.9520751
 */
import fs from 'node:fs';
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
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

// 기본값: 짱오락실 서울대입구점 — 이번 대화에서 계속 다룬 좌표
const lat = Number(valueOf('--lat') ?? '37.4803599');
const lng = Number(valueOf('--lng') ?? '126.9520751');
const dataId = valueOf('--data') ?? 'LT_C_BUD';

const key = process.env.VWORLD_API_KEY;
if (!key) {
  console.error(
    '\n✖ VWORLD_API_KEY 가 없습니다 (.env.local 참고 — vworld.kr 에서 인증키 발급 후 넣어주세요)\n',
  );
  process.exit(1);
}

const url = new URL('https://api.vworld.kr/req/data');
url.searchParams.set('service', 'data');
url.searchParams.set('request', 'GetFeature');
url.searchParams.set('data', dataId);
url.searchParams.set('key', key);
url.searchParams.set('domain', 'localhost');
url.searchParams.set('geomFilter', `POINT(${lng} ${lat})`);
url.searchParams.set('geometry', 'true');
url.searchParams.set('format', 'json');
url.searchParams.set('size', '5');

console.log(`요청: ${url.toString().replace(key, '***')}\n`);

const res = await fetch(url);
const text = await res.text();

console.log(`상태: ${res.status} ${res.headers.get('content-type') ?? ''}\n`);

try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text);
}
