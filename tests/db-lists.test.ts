import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `lib/db.ts` 와 `scripts/init-db.mjs` 의 SQL 파일 목록이 같은지 봅니다.
 *
 * 두 곳에 같은 목록이 있는 이유는 init 스크립트가 `.ts` 를 import 할 수 없어서
 * 옮겨 적은 것입니다(그 파일 주석에 적혀 있습니다). 사람이 손으로 맞추는 목록은
 * 반드시 어긋나고, 어긋나면 **조용히** 어긋납니다 — `db:init` 이 만든 DB 에
 * 마이그레이션 몇 개가 빠진 채로 이력만 남아, 그 데이터가 영구히 비어 있게 됩니다.
 * 2026-08-24 에 030~036 이 빠져 실제로 그 상태가 됐습니다.
 *
 * 파일을 문자열로 읽어 비교합니다 — `lib/db.ts` 를 import 하면 `getDb()` 쪽
 * 모듈까지 끌려 들어옵니다.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** `NAME = [ ... ]` 안의 따옴표 문자열을 순서대로 */
function listOf(source: string, name: string): string[] {
  const body = new RegExp(`${name}\\s*=\\s*\\[(.*?)\\]`, 's').exec(source);
  if (!body) throw new Error(`${name} 목록을 찾지 못했습니다`);
  return [...body[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const dbTs = read('lib/db.ts');
const initMjs = read('scripts/init-db.mjs');

/** lib/db.ts 는 스키마 파일을 SQL_GROUPS 안에 나눠 들고 있다 */
function schemaFilesFromGroups(source: string): string[] {
  const groups = /SQL_GROUPS\s*=\s*\[(.*?)\n\] as const/s.exec(source);
  if (!groups) throw new Error('SQL_GROUPS 를 찾지 못했습니다');
  return [...groups[1].matchAll(/files:\s*\[([^\]]+)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((q) => q[1]),
  );
}

describe('lib/db.ts ↔ scripts/init-db.mjs 목록', () => {
  it('마이그레이션 목록이 순서까지 같다', () => {
    expect(listOf(initMjs, 'MIGRATION_FILES')).toEqual(listOf(dbTs, 'MIGRATION_FILES'));
  });

  it('스키마·시드 목록이 순서까지 같다 (적용 순서가 FK 순서다)', () => {
    expect(listOf(initMjs, 'SCHEMA_FILES')).toEqual(schemaFilesFromGroups(dbTs));
  });

  it('뷰 파일이 같다', () => {
    const view = (s: string) => /DERIVED_SQL_FILE\s*=\s*'([^']+)'/.exec(s)?.[1];
    expect(view(initMjs)).toBe(view(dbTs));
  });
});

describe('db/ 폴더와 목록', () => {
  const listed = listOf(dbTs, 'MIGRATION_FILES');
  const onDisk = fs
    .readdirSync(path.join(root, 'db'))
    .filter((f) => f.startsWith('migrate-') && f.endsWith('.sql'))
    .sort();

  it('db/ 의 마이그레이션 파일이 모두 목록에 있다 — 목록에 없으면 영원히 적용되지 않는다', () => {
    expect(onDisk.filter((f) => !listed.includes(f))).toEqual([]);
  });

  it('목록의 모든 항목이 실제 파일이다 — 없으면 서버가 뜨다가 죽는다', () => {
    expect(listed.filter((f) => !onDisk.includes(f))).toEqual([]);
  });

  it('번호가 겹치지 않는다 — 같은 번호가 둘이면 순서를 읽을 수 없다', () => {
    const numbers = listed.map((f) => f.slice('migrate-'.length, 'migrate-'.length + 3));
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});
