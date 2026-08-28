/**
 * Postgres 에러 코드 판별.
 *
 * 값의 유효성을 DB 제약(FK·CHECK)에 맡긴 곳에서는, 위반을 500 이 아니라
 * 뜻이 통하는 4xx 로 바꿔 줘야 합니다. PGlite 도 실제 Postgres 와 같은
 * SQLSTATE 를 돌려주므로 두 드라이버에서 같이 동작합니다.
 */
function codeOf(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null
    ? (err as { code?: string }).code
    : undefined;
}

/** 23503 — 참조하는 행이 없음 (없는 말머리 / 기종 / 플레이어) */
export function isForeignKeyViolation(err: unknown): boolean {
  return codeOf(err) === '23503';
}

/** 23505 — UNIQUE 위반 */
export function isUniqueViolation(err: unknown): boolean {
  return codeOf(err) === '23505';
}
