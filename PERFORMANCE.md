# 조회 성능 개선 기록

2026-08-25. k6 부하테스트에서 지목된 병목을 따라 조회 경로를 손봤습니다.
바꾼 것은 넷이고, 전부 **동작은 그대로 두고 DB 를 덜 치게** 만드는 변경입니다.

| # | 무엇 | 파일 |
|---|---|---|
| 1 | 커넥션 풀 상한을 환경변수로 | `lib/db.ts` |
| 2 | 참조 데이터 캐싱 | `lib/cache.ts` (신규) · `lib/arcades.ts` · `lib/tier.ts` |
| 3 | `listPosts` 목록·총계 분리 + 총계 캐시 | `lib/board.ts` · `lib/cache.ts` |
| 4 | 인기글 정렬·검색 인덱스 | `db/migrate-042-posts-scale-indexes.sql` |

---

## 배경 — 왜 이걸 골랐나

부하테스트에서 병목이 **node-postgres 커넥션 풀 상한**으로 확인됐습니다.
근거는 `pg_stat_activity` 였습니다. 부하 중 커넥션이 **정확히 상한에 붙어** 있었고
(10 으로 두면 10개, 50 으로 올리면 53개), 상한이 곧 실측치라는 건 풀이 항상 꽉 차
있다는 뜻입니다.

반대로 병목이 **아닌** 것들도 측정으로 배제했습니다. 다시 파지 마세요.

- **느린 쿼리 아님** — 워밍업 후 전 엔드포인트 5~25ms. `posts` 는 30행짜리 테이블입니다.
- **반경 검색 아님** — haversine 전체 스캔이지만 13ms 로 오히려 빠른 축입니다.
  `lib/arcades.ts` 주석의 PostGIS 이관은 지금 필요 없습니다.
- **Node CPU 아님** — 20 VU 에서 코어 1개의 27%, 200 VU 에서도 56%.
- **Postgres 용량 아님** — 커넥션이 죄다 idle 로 잡혔고 `max_connections` 는 100입니다.

풀에 여유를 주는 길은 둘입니다. **상한을 올리거나(1), 요청당 쓰는 슬롯을 줄이거나(2·3).**
둘 다 했고, 뒤에 글이 5만 건으로 늘었을 때를 대비해 인덱스(4)를 더했습니다.

---

## 1. 커넥션 풀 상한을 환경변수로

`new pg.Pool({ connectionString })` 에 `max` 가 없어 node-postgres 기본값 **10** 으로
돌고 있었습니다. 200 VU × 배치 6 = 최대 1,200 요청이 커넥션 10개를 놓고 줄을 섭니다.

```diff
  async function createPgDb(connectionString: string): Promise<Db> {
    const { default: pg } = await import('pg');
-   const pool = new pg.Pool({ connectionString });
+   const max = Number(process.env.PG_POOL_MAX) || 30;
+   const pool = new pg.Pool({ connectionString, max });
```

**기본값은 30 입니다.** 측정으로 고른 값이고(아래 "풀 상한을 얼마로 할까"), 환경변수로
덮어쓸 수 있습니다.

```bash
PG_POOL_MAX=50 npm run start
```

환경변수 없이 띄운 서버에서 부하 중 커넥션이 33개(상한 30 + 관측용 3)로 잡히는 것을
확인했습니다.

> `max_connections = 100` 이 하드 리밋입니다. 앱 인스턴스가 여럿이면 합산이므로
> 단일 인스턴스는 80~90 이 실질 상한입니다. 코어 수를 한참 넘겨 늘리면 Postgres
> 안에서 컨텍스트 스위칭으로 오히려 느려집니다.

---

## 2. 참조 데이터 캐싱

### 대상

`machines` · `songs` · `charts` 는 **앱 런타임에서 쓰는 경로가 없습니다.**
`scripts/` 의 적재 도구로만 채우는 사실상의 시드 데이터인데, 조회 라우트가 전부
`force-dynamic` 이라 요청마다 DB 를 한 번씩 더 쳤습니다.

세 함수를 캐시했습니다.

| 함수 | 파일 | 쓰는 곳 |
|---|---|---|
| `listMachines()` | `lib/arcades.ts` | `/api/machines`, `/api/chat`, `lib/chat-tools.ts` |
| `listGames()` | `lib/tier.ts` | `/api/tier`, `/api/games`, `getGame()` |
| `listLevels(machineId)` | `lib/tier.ts` | `/api/tier` |

### 왜 라우트가 아니라 데이터 계층인가

**`/api/tier` 를 라우트째 캐시하면 남의 기록이 새어 나갑니다.** 이 응답은 한 몸에
참조 데이터(게임·레벨 목록)와 사용자별 데이터(`playerId` 가 걸린 서열표 · `myVote` ·
`myClear`)를 함께 싣습니다. 먼저 요청한 사람의 투표가 다음 사람에게 그대로 나갑니다.

그래서 캐시는 **참조 데이터를 읽는 함수에만** 겁니다. `getTierBoard()` 는 손대지
않았습니다.

### 왜 Next 의 `unstable_cache` 를 쓰지 않았나

처음엔 `unstable_cache` 로 짰는데 테스트 6건이 깨졌습니다.

```
Invariant: incrementalCache missing in unstable_cache async function listMachinesUncached()
  at cachedCb (next/src/server/web/spec-extension/unstable-cache.ts:113:13)
```

`unstable_cache` 는 **요청 컨텍스트에 실린 `incrementalCache` 가 있어야** 동작합니다.
라우트 핸들러를 직접 호출하는 테스트와 `scripts/` 의 도구는 전부 그 컨텍스트 밖입니다.
서버가 단일 프로세스인 것도 확인했으므로(부하 중 CPU · 커넥션 관측) 프로세스 안에
두는 편이 단순하고 어디서나 똑같이 동작합니다.

### `lib/cache.ts` — 핵심

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

    const value = fn(...args);                       // ← 값이 아니라 Promise 를 담는다
    store.set(key, { value, expiresAt: Date.now() + ttlMs });

    value.catch(() => {                              // 실패는 캐시에 남기지 않는다
      if (store.get(key)?.value === value) store.delete(key);
    });

    return value;
  };
}
```

**결과값이 아니라 진행 중인 Promise 를 담는 것이 핵심입니다.** 캐시가 빈 상태에서
요청 100건이 동시에 들어와도 DB 로 나가는 쿼리는 하나고 나머지는 같은 약속을
기다립니다. 값만 담으면 그 100건이 전부 각자 쿼리를 날려서, 정작 부하가 몰리는
순간에 캐시가 없는 것과 같아집니다.

실패한 조회를 캐시에 남기면 TTL 동안 같은 오류만 돌려주므로 `catch` 로 지웁니다.
그 사이 다른 호출이 항목을 갈아끼웠을 수 있어 **내가 넣은 것일 때만** 지웁니다.

캐시 저장소는 `lib/db.ts` 와 같은 이유로 `globalThis` 에 둡니다 — dev 서버 HMR 마다
새로 뜨면 안 됩니다.

### 적용

```diff
- export async function listMachines(): Promise<Machine[]> {
+ async function listMachinesUncached(): Promise<Machine[]> {
    ...
  }
+
+ export const listMachines = cacheReference(listMachinesUncached, 'machines');
```

`listLevels` 만 한 겹 더 있습니다. **기본 인자를 캐시 바깥에서 채웁니다.**

```ts
const listLevelsCached = cacheReference(listLevelsUncached, 'tier-levels');

export function listLevels(machineId = DEFAULT_MACHINE_ID) {
  return listLevelsCached(machineId);   // 항상 명시적으로 넘긴다
}
```

인자가 캐시 키에 들어가므로, 기본값을 안쪽에 두면 `listLevels()` 와
`listLevels(1)` 이 **같은 데이터를 서로 다른 키로 두 벌** 쌓습니다.

### TTL 과 갱신

기본 5분입니다. 적재 스크립트는 Next 바깥에서 DB 를 직접 고치므로 캐시를 비울 방법이
없습니다 — **실질적인 갱신 수단은 TTL 뿐입니다.** 스크립트로 기종을 추가했다면 최대
5분 뒤에 화면에 반영됩니다. 즉시 반영이 필요하면 서버를 재시작하거나
`clearReferenceCache()` 를 부르세요.

앱 안에서 참조 데이터를 고치는 경로가 생기면 그때 그 쓰기 직후에
`clearReferenceCache()` 를 걸어야 합니다.

---

## 3. `listPosts` — 목록과 총계를 나누고, 총계는 캐시

### 무엇이 문제였나

한 요청에 쿼리 셋을 `Promise.all` 로 동시에 날렸습니다 — **요청당 풀 슬롯 3개**입니다.

1. 목록 (`POST_SELECT` + WHERE + ORDER + LIMIT/OFFSET)
2. `COUNT(*)` 전체 (같은 WHERE)
3. 공지 목록

1번과 2번은 **WHERE 가 완전히 같습니다.** 원래 주석도 그걸 알고 있었습니다.

> 두 쿼리의 WHERE 는 같은 조건이지만 파라미터 번호가 달라 따로 씁니다.
> 한쪽 문자열을 재활용하려면 번호를 치환해야 하는데, SQL 을 정규식으로 고치는
> 코드는 조건이 하나 늘어나는 순간 조용히 틀립니다.

### 1차 시도 — 창 함수로 합쳤다가 되돌렸습니다

`COUNT(*) OVER ()` 로 목록과 총계를 한 쿼리에 합쳤습니다. **글 30건 기준으로는
문제가 없었고 풀 슬롯도 하나 줄었습니다.** 그런데 임시 테이블에 글 5만 건을 넣고
`EXPLAIN ANALYZE` 로 재 보니 뒤집혔습니다.

| 방식 | 5만 건 | 읽은 행 |
|---|---|---|
| 목록(LIMIT 안쪽) + 별도 COUNT | **5.9ms** | 21 + 41,667 |
| `COUNT(*) OVER ()` 한 쿼리 | **141.4ms** | 41,667 |

**24배 느립니다.** 이유는 둘입니다.

- **창 함수가 LIMIT 을 아래로 못 밀어넣습니다.** 20건만 필요한데도 조건에 맞는 행을
  전부 정렬해야 해서, 목록 쿼리가 Index Scan(21행에서 멈춤)에서 **Seq Scan + 전체 정렬**로
  내려앉습니다.
- **그 전부가 4개 조인을 통과합니다.** `machines`·`board_categories`·`players`·`post_likes`
  를 41,667행이 모두 거칩니다. 조인 없이 `posts` 만 훑던 예전 COUNT 는 Index Only Scan
  이라 훨씬 쌌습니다.

당시 "읽는 양은 늘지 않는다" 고 적었는데 **틀렸습니다.** 읽는 행 수는 같지만
**무엇을 통과해서 읽느냐** 가 다릅니다. 30행에서는 둘 다 순식간이라 이 차이가
보이지 않았습니다.

### 최종 — 나누고, 총계는 캐시

목록은 LIMIT 이 인덱스까지 내려가도록 되돌리고, 총계는 캐시로 받습니다.

```diff
- const [{ rows }, notices] = await Promise.all([
-   db.query(
-     `SELECT x.*, (COUNT(*) OVER ())::int AS total_count
-      FROM ( ${POST_SELECT} WHERE ... ) x
-      ORDER BY ${ORDER[sort]}
-      LIMIT $4::int OFFSET $5::int`, ...),
-   pinNotices ? listNotices(playerId) : Promise.resolve([]),
- ]);
+ const [{ rows }, total, notices] = await Promise.all([
+   db.query(
+     `${POST_SELECT}
+      WHERE ...
+      ORDER BY ${ORDER[sort]}
+      LIMIT $4::int OFFSET $5::int`, ...),
+   countPosts(tab, category, term, minLikes, excluded),
+   pinNotices ? listNotices(playerId) : Promise.resolve([]),
+ ]);
```

정렬 키도 테이블 별칭을 되살렸습니다 — 정렬이 다시 안쪽 쿼리로 들어갔기 때문입니다.

```diff
  const ORDER: Record<PostSort, string> = {
-   recent: 'created_at DESC, id DESC',
+   recent: 'p.created_at DESC, p.id DESC',
-   popular: 'like_count DESC, comment_count DESC, created_at DESC',
+   popular: 'p.like_count DESC, p.comment_count DESC, p.created_at DESC',
  };
```

**총계는 본질적으로 조건에 맞는 행을 전부 봐야 합니다.** 5만 건이면 매번 5.7ms 인데
글 목록은 자주 열리는 화면이라 그대로 쌓입니다. 그래서 캐시합니다 — 인자(필터 조합)가
곧 캐시 키라 탭·말머리·정렬별로 따로 잡힙니다.

```diff
+ const countPosts = cacheReference(countPostsUncached, 'post-count', 30_000);
+
+ function invalidatePostCounts(): void {
+   clearReferenceCache('post-count');
+ }
```

**풀 슬롯을 아끼려던 원래 의도는 캐시가 대신합니다.** 캐시가 맞으면 `countPosts` 는
DB 를 치지 않으므로 요청당 쿼리는 2개(목록 + 공지)로, 창 함수 때와 같습니다.
빗나갈 때만 3개가 됩니다.

### 총계가 낡지 않게

글이 늘거나 줄거나 분류가 바뀌면 총계가 달라지므로, 쓰기 경로 넷에서 캐시를 비웁니다.

```diff
  // createPost / updatePost / deletePost / deletePostAsAdmin
+ invalidatePostCounts();
```

어느 필터 조합이 영향을 받는지 알 수 없어 `post-count` 이름 전체를 비웁니다.
그래서 `clearReferenceCache` 가 이름 단위 삭제를 받도록 넓혔습니다.

TTL 30초가 실제로 쓰이는 건 **추천 수가 바뀌어 '인기글' 기준선을 넘나드는 경우**
정도입니다. 추천/추천취소는 총계 무효화를 걸지 않았습니다 — 자주 일어나는데 페이지
수에 영향은 거의 없어서, 최대 30초 늦게 반영되는 편을 택했습니다.

### 빈 페이지 폴백이 필요 없어졌습니다

창 함수는 행이 하나도 없으면 총계가 실릴 자리가 없어서, 뒤 페이지가 비었을 때만
따로 세는 분기를 뒀었습니다. 이제 총계를 항상 따로 구하므로 그 분기가 사라졌습니다.

### 공지는 왜 안 합쳤나

`UNION ALL` 로 한 쿼리로 만들 수는 있습니다. 안 했습니다.

공지는 **필터를 타지 않는 별도 목록**입니다. WHERE 도 ORDER 도 LIMIT 도 다르고,
`pinNotices` 가 false 면 아예 나가지도 않습니다(챗봇 검색 경로가 그렇습니다).
합치면 원래 코드가 길게 설명해 둔 "공지가 왜 따로여야 하는가" 가 SQL 속에 묻힙니다.

---

## 4. 글이 많아졌을 때를 위한 인덱스

`db/migrate-042-posts-scale-indexes.sql`. 5만 건 기준 실측입니다.

| 대상 | 인덱스 없음 | 인덱스 적용 |
|---|---|---|
| 챗봇 검색 `ILIKE '%말%'` | 416.2ms | **1.5ms** |
| '인기글' 정렬 | 9.0ms | **0.074ms** |

**'인기글' 정렬** — 최신순은 `posts_recent_idx` 가 받아 주는데 인기순은 받아 줄
인덱스가 없어 전부 읽고 정렬한 뒤 20건만 잘라내고 있었습니다. 정렬 키 순서가
`ORDER.popular` 과 같아야 인덱스를 탑니다.

```sql
CREATE INDEX IF NOT EXISTS posts_popular_idx
  ON posts (like_count DESC, comment_count DESC, created_at DESC);
```

**검색** — `ILIKE '%말%'` 는 앞에 와일드카드가 있어 어떤 btree 도 못 탑니다.
trigram GIN 은 글자를 3개씩 쪼개 넣어 두므로 가운데 낀 말도 찾습니다.
**쿼리는 한 글자도 안 고칩니다** — 플래너가 알아서 Bitmap Index Scan 으로 바꿉니다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posts_body_trgm_idx  ON posts USING gin (body  gin_trgm_ops);
```

> 검색은 **HTTP 라우트에 없습니다.** `parsePostQuery` 가 `q` 를 읽지 않고,
> `listPosts({ q })` 를 직접 부르는 챗봇(`lib/chat-tools.ts`)만 이 경로를 씁니다.
> 게시판에 검색창이 생기면 그때 이 인덱스가 화면에서도 값을 합니다.

**PGlite 폴백을 깨지 않게** 확장 생성을 `DO` 블록으로 감쌌습니다. `pg_trgm` 이 없으면
검색 인덱스만 건너뛰고 지금까지처럼 전체 스캔으로 동작합니다 — 없으면 느릴 뿐
틀리지는 않습니다. 확장 실패로 마이그레이션 전체가 죽으면 폴백 DB 가 아예 안 뜹니다.

> ⚠ 운영 DB 가 이미 커진 뒤라면 `CREATE INDEX` 가 쓰기를 막습니다. 그때는 이 파일을
> 돌리지 말고 psql 에서 `CONCURRENTLY` 로 따로 만드세요 (`CONCURRENTLY` 는 트랜잭션
> 안에서 못 돌아 마이그레이션 파일에 넣을 수 없습니다).

### 아직 O(표 크기)로 남아 있는 것

- **깊은 페이지** — `OFFSET 40000` 은 4만 행을 세어 버리고 20건을 줍니다(29.0ms).
  커서 방식이면 0.069ms 지만 **API 가 페이지 번호에서 커서로 바뀌는 변경**이라,
  번호 이동 UI(`components/Pagination.tsx`)를 포기해야 합니다. 보류했습니다.
- **목록이 본문 전문을 실어 옵니다** — `POST_SELECT` 가 `p.body` 와 `p.body_doc`(JSONB)
  까지 가져옵니다. 행 폭이 867바이트인데 발췌만 쓰면 245바이트입니다. 20건이면 큰
  차이가 아니고, `POST_SELECT` 를 `getPost`(전문이 필요함)와 공유하고 있어 나누는
  비용이 더 큽니다. 보류했습니다.

---

## 측정

프로덕션 빌드(`npm run start`), PostgreSQL 18, 오락실 942 · 게시글 30.
개선 전후 모두 **풀 상한 10** 으로, 캐싱과 쿼리 축소만의 효과입니다.

### 요청당 DB 쿼리

직접 셌습니다 (`pg_stat_database.xact_commit` 증가분 / 요청 수).

| 엔드포인트 | 개선 전 | 개선 후 |
|---|---|---|
| `/api/machines` | 1.0 | **0** |
| `/api/tier` | 5.0 | **2.0** |
| `/api/posts` | 3.0 | **2.0** (총계 캐시 적중 시) |
| 부하 시나리오 전체 (요청당) | 약 2.0 | **1.33** |

### 20 VU · 5분 (실사용에 가까운 구간)

| 지표 | 개선 전 | 개선 후 | |
|---|---|---|---|
| 처리량 | 78.74/s | **92.05/s** | +17% |
| 중앙값 | 146.06ms | **22.77ms** | −84% |
| 평균 | 149.97ms | **30.4ms** | −80% |
| p95 | 287.23ms | **77.93ms** | −73% |
| 반경검색 p95 | 252.06ms | **72.26ms** | −71% |
| 실패 | 0 | **0** | |

풀 상한을 30 으로 올리고 3·4 번까지 얹은 **최종 상태**는 아래입니다 (같은 20 VU).

| 지표 | 개선 전 | 최종 | |
|---|---|---|---|
| 처리량 | 78.74/s | **93.14/s** | +18% |
| 중앙값 | 146.06ms | **17.61ms** | −88% |
| 평균 | 149.97ms | **20.22ms** | −87% |
| p95 | 287.23ms | **39.07ms** | −86% |
| 반경검색 p95 | 252.06ms | **36.98ms** | −85% |
| 실패 | 0 | **0** | |

임계치(p95 &lt; 500ms) 대비 마진이 1.7배에서 **12.8배**로 벌어졌습니다.

임계치(p95 < 500ms) 대비 마진이 1.7배에서 **6.4배**로 벌어졌습니다.

### 200 VU (한계 구간) — 여기서는 풀 상한이 관건입니다

| 구성 | 처리량 | 중앙값 | p95 |
|---|---|---|---|
| 원본 (풀 10) | 244.02/s | 851.51ms | 1.87s |
| 캐싱+쿼리축소 · 풀 10 | 263.78/s | 637.06ms | 1.93s |
| 캐싱+쿼리축소 · 풀 30 | **372.14 / 384.40/s** | 308 / 268ms | 900 / 849ms |
| 캐싱+쿼리축소 · 풀 50 | **337.37 / 414.82/s** | 123 / 130ms | 1.58s / 816ms |

**캐싱만으로는 이 구간에서 처리량이 8% 느는 데 그칩니다.** 풀 상한 10 이 여전히
벽이기 때문입니다. 두 개선은 서로 다른 구간을 담당하므로 함께 적용해야 합니다.

### 풀 상한을 얼마로 할까 — 30 을 권합니다

30 과 50 을 두 번씩 쟀습니다 (200 VU).

| 풀 | 1회차 | 2회차 | 평균 | 편차 |
|---|---|---|---|---|
| 30 | 372.14/s | 384.40/s | 378.3/s | **3.2%** |
| 50 | 337.37/s | 414.82/s | 376.1/s | **20.5%** |

**평균 처리량은 사실상 같고(378 대 376), 편차가 다릅니다.** 커넥션을 더 열수록
Postgres 안에서 경합이 늘어 실행마다 결과가 출렁입니다. 같은 성능이라면 흔들리지
않는 쪽이 낫고, `max_connections = 100` 아래 여유도 더 남습니다(인스턴스를 늘릴 여지).

20 VU 구간에서도 30 이 확실히 낫습니다.

| 풀 | 처리량 | 중앙값 | p95 |
|---|---|---|---|
| 10 | 92.05/s | 22.77ms | 77.93ms |
| 30 | 93.24/s | **18.48ms** | **47.21ms** |

처리량이 제자리인 것은 서버 한계가 아니라 시나리오가 매 반복 1초를 쉬기 때문입니다.

> ⚠ **실행 간 변동이 설정 간 차이만큼 큽니다.** 같은 풀 50 설정에서 337/s 와 414/s 가
> 나왔습니다. 200 VU 수치를 한 번만 재고 비교하면 없는 차이를 만들어냅니다 —
> 최소 두 번씩 재세요. 20 VU 구간은 훨씬 안정적입니다.

---

## 검증

`npm test` 490건, `npm run typecheck` 전부 통과. 그 외에 직접 확인한 것들입니다.

**캐시가 실제로 DB 를 안 친다** — `/api/machines` 20회 요청에 앱발 쿼리 0건.
대조군 `/api/arcades` 는 같은 조건에서 20건 그대로.

**사용자 데이터가 섞이지 않는다** — 투표가 갈리는 채보를 골라 플레이어를 번갈아
호출했습니다.

| 요청 | chart 26 | chart 27 |
|---|---|---|
| DB 실제값 (p1) | 0.85 | 0.67 |
| `playerId=1` | 0.85 ✓ | 0.67 ✓ |
| DB 실제값 (p2) | 0.80 | 1.00 |
| `playerId=2` | 0.80 ✓ | 1.00 ✓ |
| 비로그인 | null ✓ | null ✓ |

1 → 2 → 1 → 2 로 번갈아 불러도 매번 자기 값이 나왔습니다.

**총계와 페이지네이션이 그대로다**

| 요청 | posts | total | hasMore |
|---|---|---|---|
| `?limit=5` | 5 | 29 | true |
| `?limit=5&offset=1000` | 0 | **29** | false |
| `?limit=100` | 29 | 29 | false |

빈 페이지에서도 `total` 이 29 로 유지됩니다 — 폴백이 동작한다는 뜻입니다.
(게시글 30건 중 공지 1건을 뺀 29건이 맞습니다.)

### 다시 재려면

```bash
npm run build
npm run start
```

```bash
k6 run -q -e SCENARIO=load "C:\Users\user\Desktop\claude\개인 프로젝트\arcade-finder\load-test\k6-read.js"
```

부하테스트는 **반드시 프로덕션 빌드로** 재세요. `next dev` 는 수치를 크게 왜곡합니다.
스크립트 경로는 저장소 루트 기준 `arcade-finder/load-test/` 라 절대경로가 안전합니다.

> 재기 전에 **3000 포트에 낡은 서버가 남아 있지 않은지 확인하세요.** 실제로 한 번
> 당했습니다 — 2시간 전에 뜬 프로세스가 포트를 물고 있어서 새 서버가 바인딩에
> 실패했고, 개선된 코드가 아니라 옛 빌드를 측정하고 있었습니다.

---

## 남은 것

- **풀 기본값은 30 으로 반영했습니다.** 30 에서도 커넥션은 상한에 붙어 있지만, 50 으로
  올려도 평균 처리량이 늘지 않고 편차만 커졌습니다. **인스턴스를 여러 개 띄우게 되면
  30 × 인스턴스 수가 `max_connections`(100) 를 넘지 않는지 확인하세요** — 4개부터 넘칩니다.
- **`/api/arcades` 에 `LIMIT` 이 없습니다.** 942행 307KB 를 통째로 반환합니다.
  다만 프론트가 `fullListRef` 에 전체 목록을 담아 재사용하는 구조라, 페이지네이션은
  그 설계를 바꾸는 일입니다. 첫 로드 1회뿐이라 우선순위는 낮습니다.
- **기종 데이터가 비어 있습니다.** `arcade_machines` 가 3행이고 942곳 중 940곳이 보유
  기종 0입니다. `MACHINES_SUBQUERY` 가 지금 싼 건 상관 서브쿼리가 942번 돌면서 전부
  빈 결과를 내기 때문입니다. **데이터를 채우면 이 기준선은 무효가 됩니다** — 그때 다시
  재세요.
- **부하 시나리오가 실사용 패턴이 아닙니다.** 한 반복이 6개 엔드포인트를 동시에
  때리는데, 실제 사용자는 한 페이지에 머뭅니다. 페이지별 시나리오로 나누면 더
  현실적인 수치가 나옵니다.
