/**
 * 공공데이터포털에서 **영업중인 청소년게임제공업(전체이용가)** 목록을 뽑아냅니다.
 *
 *   npm run games:localdata -- --probe               첫 페이지만 받아 응답 모양·상태값 확인
 *   npm run games:localdata                          전국 → 영업중만 JSON
 *   npm run games:localdata -- --csv                 CSV 도 함께 (엑셀용 BOM 붙음)
 *   npm run games:localdata -- --local-code 3220000  특정 지자체만
 *   npm run games:localdata -- --codes 01,02         휴업까지 포함
 *   npm run games:localdata -- --server-filter       영업상태 필터를 서버에 넘김(호출 절약)
 *   npm run games:localdata -- --max-pages 5         맛보기로 5페이지만
 *
 * 파싱·영업중 판정은 전부 lib/localdata-games.ts 에 있고 tests 가 그것을 검증합니다.
 * 이 파일은 인자·파일 쓰기·화면 출력만 합니다 — 판정 로직을 여기 적으면 테스트가
 * 검증하는 코드와 실제로 도는 코드가 갈라집니다(scripts/import-arcades.ts 와 같은 이유).
 *
 * 키: .env.local 의 DATA_GO_KR_API_KEY (일반 인증키 **Decoding** 값).
 *     발급·주의사항은 .env.example 에 적어 두었습니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  LocaldataError,
  YOUTH_GAME_SERVICE,
  crawlOpenProviders,
  fetchInfoPage,
  readServiceKey,
  tallyBy,
  toGameProvider,
  type GameProvider,
} from '../lib/localdata-games.ts';

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

// ─── 인자 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const probe = has('--probe');
const wantCsv = has('--csv');
const serverFilter = has('--server-filter');
const localCode = valueOf('--local-code');
const outDir = valueOf('--out') ?? path.join(root, 'localdata');
const maxPagesArg = valueOf('--max-pages');
const maxPages = maxPagesArg ? Number(maxPagesArg) : undefined;
const openCodes = new Set(
  (valueOf('--codes') ?? '01')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

// ─── 출력 도우미 ──────────────────────────────────────────────────────
const n = (v: number) => v.toLocaleString('ko-KR');

function writeJson(file: string, list: readonly GameProvider[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  console.log(`→ ${path.relative(root, file)}`);
}

function writeCsv(file: string, list: readonly GameProvider[]): void {
  // 헤더는 GameProvider 의 필드 순서를 그대로 씁니다. 빈 목록이어도 헤더는 나와야
  // "0건" 과 "실패" 를 구분할 수 있습니다.
  const cols = Object.keys(toGameProvider({})) as (keyof GameProvider)[];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(','), ...list.map((p) => cols.map((c) => esc(p[c])).join(','))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Excel 이 UTF-8 로 알아보게 BOM 을 붙입니다.
  fs.writeFileSync(file, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
  console.log(`→ ${path.relative(root, file)}`);
}

// 인자 검사와 키 확인을 함수 안에서 하는 이유: 모듈 최상단에서 process.exit() 을
// 부르면 Node + Windows 에서 libuv assertion 이 찍혀 정작 읽어야 할 안내가 묻힙니다.
// exitCode 를 세우고 조용히 돌아옵니다.
async function main(): Promise<void> {
  if (maxPagesArg && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages 는 1 이상의 정수여야 합니다: ${maxPagesArg}`);
    process.exitCode = 1;
    return;
  }
  if (!openCodes.size) {
    console.error('--codes 가 비었습니다. 예: --codes 01 또는 --codes 01,02');
    process.exitCode = 1;
    return;
  }

  const serviceKey = readServiceKey();
  if (!serviceKey) {
    console.error(
      'DATA_GO_KR_API_KEY 가 없습니다.\n' +
        `  1) https://www.data.go.kr/data/${YOUTH_GAME_SERVICE.publicDataPk}/openapi.do 에서 [활용신청] (자동승인)\n` +
        '  2) 마이페이지 > 오픈API > 인증키의 일반 인증키(Decoding) 복사\n' +
        '  3) .env.local 에  DATA_GO_KR_API_KEY=붙여넣기',
    );
    process.exitCode = 1;
    return;
  }

  const statusCode = serverFilter && openCodes.size === 1 ? [...openCodes][0] : null;
  if (serverFilter && !statusCode) {
    console.log('--server-filter 는 --codes 가 하나일 때만 씁니다. 전부 받아서 거릅니다.');
  }

  console.log(`━━━ ${YOUTH_GAME_SERVICE.label}`);
  console.log(
    `    ${YOUTH_GAME_SERVICE.slug}${localCode ? ` · 자치단체 ${localCode}` : ' · 전국'}`,
  );

  if (probe) {
    const page = await fetchInfoPage({
      serviceKey,
      pageNo: 1,
      localCode,
      statusCode,
    });
    console.log(`\n전체 ${n(page.totalCount)}건 · 첫 페이지 ${page.rows.length}건`);
    console.log('\n첫 행 원본:');
    console.dir(page.rows[0], { depth: null });
    console.log('\n영업상태코드:', tallyBy(page.rows, 'SALS_STTS_CD'));
    console.log('영업상태명:', tallyBy(page.rows, 'SALS_STTS_NM'));
    console.log('상세영업상태명:', tallyBy(page.rows, 'DTL_SALS_STTS_NM'));
    return;
  }

  const result = await crawlOpenProviders({
    serviceKey,
    localCode,
    statusCode,
    openCodes,
    maxPages,
    delayMs: 120,
    onPage: ({ pageNo, lastPage, fetched, totalCount }) => {
      if (pageNo === 1) console.log(`\n전체 ${n(totalCount)}건 · ${n(lastPage)}페이지`);
      if (pageNo % 10 === 0 || pageNo === lastPage) {
        process.stdout.write(`  ${pageNo}/${lastPage} 페이지 · ${n(fetched)}건 받음\r`);
      }
    },
  });
  console.log('');

  // 거르기 **전** 분포를 먼저 찍습니다 — 코드표를 눈으로 확인하는 자리입니다.
  console.log('\n영업상태코드 분포 (필터 전):');
  for (const [code, count] of result.statusTally) {
    const name =
      result.rows.find((r) => String(r.SALS_STTS_CD ?? '').trim() === code)?.SALS_STTS_NM ?? '';
    console.log(`  ${code.padEnd(8)} ${String(name).padEnd(16)} ${n(count)}건`);
  }

  console.log(
    `\n영업중(코드 ${[...openCodes].join(',')}): ${n(result.open.length)}건 / 받은 ${n(result.rows.length)}건`,
  );
  const inHiatus = result.open.filter((p) => p.hiatusFrom && !p.hiatusTo).length;
  if (inHiatus) {
    console.log(
      `  ⚠ 이 중 ${n(inHiatus)}건은 휴업시작일자만 있고 종료일자가 없습니다 (영업상태는 정상).`,
    );
  }
  if (result.duplicates) {
    console.log(`  ⚠ 중복 ${n(result.duplicates)}건 제거 — 받는 중에 원본이 갱신된 것입니다.`);
  }
  if (result.truncated) {
    console.log(
      `  ⚠ --max-pages 로 ${n(result.pagesFetched)}페이지만 받았습니다. 전체가 아닙니다.`,
    );
  }

  const base = path.join(outDir, 'youth-open');
  writeJson(`${base}.json`, result.open);
  if (wantCsv) writeCsv(`${base}.csv`, result.open);

  console.log(
    '\n다음 단계: 좌표(tmX/tmY)는 EPSG:5174 라 지도에 그대로 못 씁니다.\n' +
      '           roadAddr 를 lib/naver-geocode.ts 로 다시 지오코딩하세요.',
  );
}

try {
  await main();
} catch (err) {
  // LocaldataError 는 원인과 해결법이 이미 문장에 다 들어 있어 스택이 보이면 방해됩니다.
  if (err instanceof LocaldataError) {
    console.error(`\n${err.message}`);
    // process.exit() 대신 exitCode — Node + Windows 에서 소켓이 닫히는 중에 강제
    // 종료하면 libuv assertion 이 찍혀 정작 읽어야 할 메시지가 묻힙니다.
    process.exitCode = 1;
  } else {
    throw err;
  }
}
