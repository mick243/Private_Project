/**
 * 참조 데이터 캐시.
 *
 * 기종(machines)·수록곡(songs)·채보(charts)는 앱 런타임에서 쓰는 경로가 없습니다.
 * scripts/ 의 적재 도구로만 채우는 사실상의 시드 데이터인데, 조회 라우트가 전부
 * `force-dynamic` 이라 요청마다 DB 를 한 번씩 더 쳤습니다. 부하 시에는 그만큼
 * 커넥션 풀 슬롯을 먹었고, 풀 상한이 병목이던 상황에서는 그게 그대로 지연이 됐습니다.
 *
 * **라우트가 아니라 데이터 계층에 캐시를 두는 이유**: `/api/tier` 는 한 응답 안에
 * 참조 데이터(게임·레벨 목록)와 사용자별 데이터(playerId 가 걸린 서열표·내 기록)를
 * 함께 내보냅니다. 라우트째 캐시하면 먼저 요청한 사람의 기록이 다음 사람에게
 * 그대로 나갑니다. 그래서 캐시는 참조 데이터를 읽는 함수에만 겁니다.
 *
 * **Next 의 `unstable_cache` 를 쓰지 않는 이유**: 그쪽은 요청 컨텍스트에 실린
 * `incrementalCache` 가 있어야 동작해서, Next 밖에서 부르면
 * `Invariant: incrementalCache missing in unstable_cache` 로 던집니다.
 * 라우트 핸들러를 직접 호출하는 테스트와 `scripts/` 의 도구가 전부 그 경로입니다.
 * 서버가 단일 프로세스인 것도 확인했으므로(부하 시 CPU·커넥션 관측) 프로세스 안에
 * 두는 편이 단순하고 어디서나 똑같이 동작합니다.
 *
 * 여러 인스턴스로 늘리면 인스턴스마다 따로 캐시하게 됩니다 — 시드 데이터라
 * 불일치가 문제되진 않지만, 그때는 공유 캐시를 고려하세요.
 */

/** 5분. 적재 스크립트로 데이터를 바꿨다면 최대 이만큼 뒤에 화면에 반영됩니다. */
const TTL_MS = 5 * 60 * 1000;

interface Entry {
  /** 값이 아니라 **약속**을 담습니다 — 아래 스탬피드 방지 참고. */
  value: Promise<unknown>;
  expiresAt: number;
}

// dev 서버 HMR 마다 캐시가 새로 뜨지 않도록 globalThis 에 둡니다 (lib/db.ts 와 같은 이유).
const globalForCache = globalThis as unknown as { __refCache?: Map<string, Entry> };
const store: Map<string, Entry> = (globalForCache.__refCache ??= new Map());

/**
 * 참조 데이터 조회 함수를 TTL 캐시로 감쌉니다. 인자는 캐시 키에 포함됩니다.
 *
 * 결과값이 아니라 진행 중인 Promise 를 담아 두는 것이 핵심입니다. 캐시가 빈 상태에서
 * 요청 100건이 동시에 들어와도 DB 로 나가는 쿼리는 **하나**고 나머지는 같은 약속을
 * 기다립니다. 값만 담으면 그 100건이 전부 각자 쿼리를 날려, 정작 부하가 몰리는
 * 순간에 캐시가 없는 것과 같아집니다.
 *
 * 반환값을 호출한 쪽에서 고쳐 쓰면 다음 사람에게도 그 변경이 보입니다.
 * 지금 대상 셋은 전부 읽기 전용으로만 쓰입니다.
 */
export function cacheReference<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  name: string,
  ttlMs: number = TTL_MS,
): (...args: A) => Promise<R> {
  return (...args: A): Promise<R> => {
    const key = args.length ? `${name}:${JSON.stringify(args)}` : name;

    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as Promise<R>;

    const value = fn(...args);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });

    // 실패를 캐시에 남기면 TTL 동안 같은 오류만 돌려주게 됩니다. 그 사이 다른
    // 호출이 항목을 갈아끼웠을 수도 있으니, 내가 넣은 것일 때만 지웁니다.
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });

    return value;
  };
}

/**
 * 캐시를 비웁니다.
 *
 * 이름을 주면 그 이름으로 만든 항목만 지웁니다 — 인자별로 키가 갈라지므로
 * (`post-count:[1,null,...]`) 접두사로 훑습니다. 이름을 빼면 전부 비웁니다.
 *
 * 글이 하나 늘면 어느 필터 조합의 총계가 달라졌는지 알 수 없으니, 쓰기 쪽에서는
 * 이름 단위로 통째 비우는 편이 맞습니다 (lib/board.ts invalidatePostCounts).
 */
export function clearReferenceCache(name?: string): void {
  if (!name) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key === name || key.startsWith(`${name}:`)) store.delete(key);
  }
}
