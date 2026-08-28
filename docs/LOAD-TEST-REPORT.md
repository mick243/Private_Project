# 오락실 파인더 — 부하 · 성능 리포트 (서버)

> 작성일: 2026-08-25 · 도구: k6 · 대상: 조회(read) 엔드포인트
> 출처: `load-test/k6-read.js`(커밋 `fccef1d`), [PERFORMANCE.md](../PERFORMANCE.md)(개선 기록 원문), 기준선 측정 기록(2026-08-24)
> 프런트엔드(지도·렌더) 성능은 [성능·접근성 리포트](PERF-A11Y-REPORT.md) 참조.

## 1. 테스트 설계

**환경**: 프로덕션 빌드(`npm run build && npm run start`) · PostgreSQL 18 · 오락실 942행 · 게시글 30행. `next dev`는 수치를 크게 왜곡하므로 금지.

**시나리오** (`-e SCENARIO=`):

| 시나리오 | 프로필 | 목적 |
|---|---|---|
| `smoke` (기본) | 2 VU · 1분 | 스크립트·서버 정상 확인 |
| `load` | 0→20 VU 1분 · 유지 3분 · 감소 1분 | 실사용에 가까운 본 부하 |
| `stress` | 0→50→100→200 VU · 총 6분 | 한계 탐색 |

**요청 구성**: VU 반복마다 실제 세션을 모사한 6요청 배치 + 1초 think time —
`arcades-search`(?q=게임) · `arcades-radius`(서울시청 5km) · `arcade-detail`(임의 id) · `posts-list` · `tier` · `machines`.
`setup()`이 실제 오락실 id를 확보하고 빈 DB면 명시적으로 실패.

**임계치**: 실패율 < 1% · p95 < 500ms · 반경 검색만 p95 < 800ms(무거운 쿼리로 인정).

## 2. 기준선 (개선 전, 2026-08-24)

| 구간 | 처리량 | p95 | 실패 |
|---|---|---|---|
| 20 VU (load) | 78.74/s | 287.23ms (반경검색 252ms) | 0 |
| 200 VU (stress) | 244.02/s | 1.87s (중앙값 851ms) | 0 |

임계치 통과, 마진 약 1.7배. 한계 처리량 천장 약 244 req/s.

## 3. 병목 진단 — 커넥션 풀 상한

근거는 `pg_stat_activity`: 부하 중 커넥션이 **정확히 상한에 붙어** 있었음(상한 10이면 10개, 50이면 53개) — 상한이 곧 실측치라는 것은 풀이 항상 꽉 차 있다는 뜻. node-postgres 기본값 10에 200 VU × 배치 6 = 최대 1,200 요청이 줄을 섰습니다.

**측정으로 배제한 것들** (재발굴 금지):
- 느린 쿼리 아님 — 워밍업 후 전 엔드포인트 5~25ms
- 반경 검색 아님 — haversine 전체 스캔이지만 13ms로 빠른 축 (PostGIS 이관 불요)
- Node CPU 아님 — 200 VU에서도 코어 1개의 56%
- Postgres 용량 아님 — 커넥션 전부 idle, `max_connections` 100

## 4. 개선 3종 (동작 불변, DB를 덜 치게)

| # | 변경 | 파일 |
|---|---|---|
| 1 | 풀 상한 환경변수화 — 기본 10 → **30** (`PG_POOL_MAX`) | `lib/db.ts` |
| 2 | 참조 데이터 5분 TTL 캐시 — `listMachines` · `listGames` · `listLevels` | `lib/cache.ts`(신규) · `lib/arcades.ts` · `lib/tier.ts` |
| 3 | `listPosts` 쿼리 3개 → 2개 — `COUNT(*) OVER ()` 창 함수로 목록+총계 단일 스캔 | `lib/board.ts` |

### 4.1 `lib/cache.ts` — 핵심 구현

```ts
export function cacheReference<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  name: string,
  ttlMs: number = TTL_MS,          // 기본 5분
): (...args: A) => Promise<R> {
  return (...args: A): Promise<R> => {
    const key = args.length ? `${name}:${JSON.stringify(args)}` : name;

    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as Promise<R>;

    const value = fn(...args);       // ← 값이 아니라 Promise 를 담는다
    store.set(key, { value, expiresAt: Date.now() + ttlMs });

    value.catch(() => {              // 실패는 캐시에 남기지 않는다
      if (store.get(key)?.value === value) store.delete(key);
    });

    return value;
  };
}
```

**결과값이 아니라 진행 중인 Promise를 담는 것이 핵심입니다.** 캐시가 빈 상태에서 요청 100건이 동시에 들어와도 DB로 나가는 쿼리는 하나고 나머지는 같은 약속을 기다립니다. 값만 담으면 그 100건이 각자 쿼리를 날려서, 정작 부하가 몰리는 순간에 캐시가 없는 것과 같아집니다.

실패한 조회를 캐시에 남기면 TTL 동안 같은 오류만 돌려주므로 `catch`로 지우되, 그 사이 다른 호출이 항목을 갈아끼웠을 수 있어 **내가 넣은 것일 때만** 지웁니다. 캐시 저장소는 `globalThis`에 둡니다 — dev 서버 HMR마다 새로 뜨면 안 되기 때문(`lib/db.ts`와 같은 이유).

### 4.2 적용 패턴 — `lib/arcades.ts` · `lib/tier.ts`

```diff
- export async function listMachines(): Promise<Machine[]> {
+ async function listMachinesUncached(): Promise<Machine[]> {
    ...
  }
+
+ export const listMachines = cacheReference(listMachinesUncached, 'machines');

  // listLevels 만 한 겹 더 — 기본 인자를 캐시 바깥에서 채운다.
  // 인자가 캐시 키에 들어가므로 안쪽에 두면 listLevels() 와 listLevels(1) 이
  // 같은 데이터를 서로 다른 키로 두 벌 쌓는다.
+ const listLevelsCached = cacheReference(listLevelsUncached, 'tier-levels');
+ export function listLevels(machineId = DEFAULT_MACHINE_ID) {
+   return listLevelsCached(machineId);
+ }
```

- **라우트가 아니라 데이터 계층에 캐시** — `/api/tier`는 참조 데이터와 사용자별 데이터(`myVote`·`myClear`)를 한 응답에 싣는다. 라우트째 캐시하면 먼저 요청한 사람의 투표가 다음 사람에게 그대로 나간다. 그래서 참조 데이터를 읽는 함수에만 걸고 `getTierBoard()`는 손대지 않았다.
- **`unstable_cache` 배제** — 요청 컨텍스트의 `incrementalCache`가 있어야 동작하는데, 라우트 핸들러를 직접 호출하는 테스트(6건 깨짐)와 `scripts/`의 도구는 전부 그 컨텍스트 밖.
- **TTL 5분이 실질적인 갱신 수단** — 적재 스크립트는 Next 바깥에서 DB를 직접 고치므로 캐시를 비울 방법이 없다. 즉시 반영이 필요하면 서버 재시작 또는 `clearReferenceCache()`. 앱 안에서 참조 데이터를 고치는 경로가 생기면 그 쓰기 직후에 호출할 것.

### 4.3 `listPosts` 쿼리 3개 → 2개 — `lib/board.ts`

한 요청에 쿼리 셋(목록 · `COUNT(*)` · 공지)을 `Promise.all`로 동시에 날렸습니다 — **요청당 풀 슬롯 3개**. 목록과 COUNT는 WHERE가 완전히 같아서, 원래 주석도 "조건이 하나 늘면 두 곳을 같이 고쳐야 한다"고 경고하고 있었습니다. 창 함수로 합쳤습니다.

```diff
- const [{ rows }, { rows: countRows }, notices] = await Promise.all([
-   db.query(`${POST_SELECT} WHERE ... ORDER BY ${ORDER[sort]} LIMIT $4 OFFSET $5`, ...),
-   db.query(`SELECT COUNT(*)::int AS total FROM posts p WHERE ...`, ...),
-   pinNotices ? listNotices(playerId) : Promise.resolve([]),
- ]);
+ const [{ rows }, notices] = await Promise.all([
+   db.query(
+     `SELECT x.*, (COUNT(*) OVER ())::int AS total_count
+      FROM (
+        ${POST_SELECT}
+         WHERE ...
+      ) x
+      ORDER BY ${ORDER[sort]}
+      LIMIT $4::int OFFSET $5::int`, ...),
+   pinNotices ? listNotices(playerId) : Promise.resolve([]),
+ ]);

  // 정렬이 바깥 SELECT 로 나가서 테이블 별칭을 뺀다.
  const ORDER: Record<PostSort, string> = {
-   recent: 'p.created_at DESC, p.id DESC',
+   recent: 'created_at DESC, id DESC',
  };
```

`COUNT(*) OVER ()`는 **LIMIT이 걸리기 전의** 행 수를 셉니다. 한 번의 스캔으로 목록과 총계가 함께 나오고, 읽는 양도 늘지 않습니다 — 예전 COUNT 쿼리도 어차피 조건에 맞는 행을 전부 읽었습니다. WHERE가 한 곳에만 남아 유지보수 위험도 사라집니다.

- **빈 페이지 함정** — 행이 0이면 총계가 실릴 자리가 없음 → `offset > 0`일 때만 별도 COUNT 폴백(첫 페이지가 비었다면 총계는 진짜 0이라 쿼리 불요).
- **공지 쿼리는 합치지 않음** — 필터를 타지 않는 별도 목록(WHERE·ORDER·LIMIT 전부 다르고 `pinNotices=false`면 아예 안 나감). UNION으로 합치면 "공지가 왜 따로인가"가 SQL에 묻힘. 결과: 3→2개, 공지 없는 경로(챗봇 검색)는 1개.

**요청당 DB 쿼리 실측** (`pg_stat_database.xact_commit` 증분):

| 엔드포인트 | 전 | 후 |
|---|---|---|
| `/api/machines` | 1.0 | **0** |
| `/api/tier` | 5.0 | **2.0** |
| `/api/posts` | 3.0 | **2.0** |
| 시나리오 전체 평균 | ~2.0 | **1.33** |

## 5. 개선 후 결과

### 20 VU · 5분 (실사용 구간) — 캐싱+쿼리 축소만의 효과(풀 10 고정 비교)

| 지표 | 전 | 후 | 증감 |
|---|---|---|---|
| 처리량 | 78.74/s | **92.05/s** | +17% |
| 중앙값 | 146.06ms | **22.77ms** | −84% |
| 평균 | 149.97ms | **30.4ms** | −80% |
| p95 | 287.23ms | **77.93ms** | −73% |
| 반경검색 p95 | 252.06ms | **72.26ms** | −71% |
| 실패 | 0 | **0** | |

임계치(p95 < 500ms) 마진 1.7배 → **6.4배**.

### 200 VU (한계 구간) — 여기선 풀 상한이 관건

| 구성 | 처리량 | 중앙값 | p95 |
|---|---|---|---|
| 원본 (풀 10) | 244.02/s | 851.51ms | 1.87s |
| 캐싱+쿼리축소 · 풀 10 | 263.78/s | 637.06ms | 1.93s |
| 캐싱+쿼리축소 · 풀 30 | **372.14 / 384.40/s** | 308 / 268ms | 900 / 849ms |
| 캐싱+쿼리축소 · 풀 50 | 337.37 / 414.82/s | 123 / 130ms | 1.58s / 816ms |

캐싱만으로는 이 구간에서 +8%에 그침 — 풀 10이 여전히 벽. **두 개선은 서로 다른 구간을 담당하므로 함께 적용**해야 합니다. 최종 천장: 약 244 → **약 380 req/s (+55%)**.

### 풀 상한 결정 — 30 (2회씩 측정)

| 풀 | 평균 처리량 | 실행 간 편차 |
|---|---|---|
| 30 | 378.3/s | **3.2%** |
| 50 | 376.1/s | **20.5%** |

평균은 사실상 같고 편차가 다름 — 커넥션을 더 열수록 Postgres 내부 경합으로 실행마다 출렁임. 같은 성능이면 흔들리지 않는 쪽 + `max_connections`(100) 아래 여유(인스턴스 증설 여지). 20 VU 구간에서도 30이 우세(p95 77.93 → 47.21ms).

> ⚠ 실행 간 변동이 설정 간 차이만큼 큽니다(같은 풀 50에서 337/s와 414/s). 200 VU 수치는 **최소 2회씩** 재세요.

## 6. 회귀 검증

`npm test` 490건 · `npm run typecheck` 전부 통과. 추가 직접 확인:
- 캐시가 실제로 DB를 안 침 — `/api/machines` 20회 요청에 앱발 쿼리 0건 (대조군 `/api/arcades`는 20건 그대로)
- **사용자 데이터 미혼입** — 투표가 갈리는 채보에서 playerId 1→2→1→2 교차 호출, 매번 자기 값(비로그인은 null)
- 총계·페이지네이션 보존 — 빈 뒤 페이지(`offset=1000`)에서도 `total` 29 유지(폴백 동작 확인)

## 7. 재측정 절차

```bash
npm run build
npm run start
```

```bash
k6 run -q -e SCENARIO=load "C:\Users\user\Desktop\claude\개인 프로젝트\arcade-finder\load-test\k6-read.js"
```

- 반드시 프로덕션 빌드로.
- **3000 포트에 낡은 서버가 없는지 먼저 확인** — 실제로 2시간 전 프로세스가 포트를 물고 있어 옛 빌드를 측정한 사고가 있었음.

## 8. 남은 것

- 풀 기본값 30 반영 완료. 인스턴스를 여럿 띄우면 30 × 인스턴스 수가 `max_connections`(100)를 넘는지 확인 — 4개부터 초과.
- `/api/arcades`에 LIMIT 없음(942행 307KB) — 프런트 `fullListRef` 설계상 첫 로드 1회뿐이라 우선순위 낮음.
- **기종 데이터가 채워지면 이 기준선은 무효** — `arcade_machines`가 3행뿐이라 `MACHINES_SUBQUERY`가 지금 싼 것. 데이터 적재 후 재측정 필요.
- 쓰기(변이) 부하 시나리오 부재 — 제보·리뷰·투표·글쓰기·업로드·인증은 미측정. `/api/chat`(maxDuration 120, 외부 API 비용)도 별도 설계 필요.
- 시나리오가 실사용 패턴이 아님 — 한 반복이 6개 엔드포인트를 동시에 때리지만 실제 사용자는 한 페이지에 머묾. 페이지별 시나리오 분리 시 더 현실적.
