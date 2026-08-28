import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 제보 보존 규칙을 SQL·코드에서 직접 읽어 확인합니다.
 *
 *   대기(queue)        4시간 뒤 **행 삭제**
 *   컨디션(condition)  1달 창 — 행은 남기고 집계에서만 제외
 *   기종 변동          **영구** — 지우지도 창으로 자르지도 않는다
 *
 * DB 를 띄우지 않고 소스를 읽는 이유: 이 규칙이 깨지는 방식은 "누가 DELETE 절에
 * kind 하나를 더 넣는" 것이라 문장 자체를 봐야 잡힙니다. 값이 맞는지(30일)와
 * **범위가 맞는지**(무엇을 지우는가)는 다른 질문이고, 뒤쪽이 더 위험합니다 —
 * 기종 변동을 시간으로 지우면 "있어요" 근거가 조용히 사라집니다.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const reportsTs = read('lib/reports.ts');
const viewsSql = read('db/views.sql');
const schemaSql = read('db/schema-community.sql');
const migration = read('db/migrate-039-condition-window-30d.sql');

describe('컨디션 제보 — 1달 창', () => {
  it('새 DB 의 기본값이 30일이다', () => {
    const m = /condition_window_days\s+INTEGER\s+NOT NULL\s+DEFAULT\s+(\d+)/.exec(schemaSql);
    expect(m?.[1]).toBe('30');
  });

  it('이미 있는 DB 도 마이그레이션이 30일로 옮긴다', () => {
    expect(migration).toMatch(/SET DEFAULT 30/);
    expect(migration).toMatch(/SET condition_window_days = 30/);
  });

  it('코드 fallback 도 30 이다 — 설정 행이 없을 때 스키마와 달라지면 안 된다', () => {
    expect(reportsTs).toMatch(/conditionWindowDays:\s*num\(r\.condition_window_days\)\s*\?\?\s*30/);
  });

  it('창은 뷰가 설정값으로 적용한다 — 숫자를 뷰에 박아 넣지 않는다', () => {
    expect(viewsSql).toMatch(/make_interval\(days => cfg\.condition_window_days\)/);
    // 30 을 리터럴로 박으면 설정을 바꿔도 집계가 안 따라온다
    expect(viewsSql).not.toMatch(/make_interval\(days => 30\)/);
  });
});

describe('기종 변동 — 영구 보존', () => {
  /** lib/reports.ts 안의 DELETE ... FROM machine_reports 문장들 */
  const deletes = [...reportsTs.matchAll(/DELETE FROM machine_reports[\s\S]*?`/g)].map((m) => m[0]);

  it('제보를 지우는 경로가 둘뿐이다 (수명 만료 · 관리자 삭제)', () => {
    expect(deletes).toHaveLength(2);
  });

  it('수명으로 지우는 것은 대기뿐이다', () => {
    const purge = deletes.find((d) => d.includes('queue_ttl_minutes'));
    expect(purge).toBeDefined();
    expect(purge).toMatch(/r\.kind = 'queue'/);
    // 이 DELETE 가 다른 종류까지 건드리면 영구 기록이 조용히 사라진다
    expect(purge).not.toMatch(/presence|absence|condition/);
  });

  it('machine_reports 를 지우는 문장 어디에도 presence/absence 가 없다', () => {
    // `ON DELETE CASCADE` 같은 무관한 DELETE 를 집지 않도록 대상 테이블까지 짚는다.
    const statements = [reportsTs, viewsSql, schemaSql, migration].flatMap((sql) =>
      [...sql.matchAll(/DELETE\s+FROM\s+machine_reports[\s\S]*?(?:;|`)/g)].map((m) => m[0]),
    );
    expect(statements.length).toBeGreaterThan(0);
    for (const stmt of statements) {
      expect(stmt).not.toMatch(/presence|absence/);
    }
  });

  it('집계도 시간으로 자르지 않는다 — 뒤집는 건 반대 제보다', () => {
    // applyPresence 는 "반대 제보가 마지막으로 들어온 뒤" 로만 구간을 잡는다.
    const applyPresence = /async function applyPresence[\s\S]*?\n}/.exec(reportsTs)?.[0] ?? '';
    expect(applyPresence).toMatch(/MAX\(o\.created_at\)/);
    expect(applyPresence).not.toMatch(/make_interval|now\(\)\s*-/);
  });
});

describe('전국 피드 — 보존 기간과 조회 기간이 어긋나지 않는다', () => {
  const liveFeed = read('components/LiveFeed.tsx');

  it("'전체' 는 기간 조건을 걸지 않는다 (영구 보존 제보를 볼 수 있어야 한다)", () => {
    expect(liveFeed).toMatch(/hours:\s*null,\s*label:\s*'전체'/);
    expect(liveFeed).toMatch(/if \(hours !== null\) params\.set\('sinceHours'/);
  });

  it('90일을 전체라고 부르지 않는다', () => {
    expect(liveFeed).not.toMatch(/24 \* 90/);
  });
});
