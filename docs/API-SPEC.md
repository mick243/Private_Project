# 오락실 파인더 — API 명세

> 작성일: 2026-08-25 · 라우트 28개 / 핸들러 40개 (기획서 집계와 일치)
> 출처: `app/api/` 전 라우트 전수 조사, [오락실파인더_기획서.html](../../오락실파인더_기획서.html)

## 0. 공통 규약

- 모든 라우트: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` (예외: `/api/uploads/[id]`는 runtime만, `/api/chat`은 `maxDuration = 120` 추가)
- JSON 본문 파싱 실패 → `400 {error: 'JSON 본문을 파싱할 수 없습니다'}`
- zod 검증 실패 → `400 {error: '입력값이 올바르지 않습니다', details: string[]}` (`/api/account*`는 `{error: details[0]}`)
- 경로 id 불량 → `400 {error: '잘못된 id 입니다'}`
- **관리자 게이트**: `requireAdmin(request)` — 세션 쿠키를 읽고 DB에서 `is_admin`을 **재조회**(권한 회수 즉시 반영). 관리자-또는-소유자 판정은 `isAdminRequest(request)`.
- 인증: 서명된 세션 쿠키 `arcade_session` (scrypt 해시, `sealPayload` 서명 토큰). 알려진 한계 — 게시판 소유자 판정이 아직 클라이언트가 보낸 `playerId`를 신뢰함(기획서 "아직 닫히지 않았습니다" 절, 관리자 경로만 세션 근거).

---

## 1. 오락실 (Arcades)

### `GET /api/arcades`
목록/검색. 인증 불요.

| 쿼리 | 의미 |
|---|---|
| `q` | 이름·주소 검색. 최대 8토큰으로 분해해 각 토큰을 이름·주소에 ILIKE, AND 결합("홍대 짱" → "짱오락실 홍대점" 매칭) |
| `machines=1,3` | 나열된 기종을 **모두** 보유한 곳만 (AND 필터) |
| `lat` `lng` `radius` | 반경(km) 검색 — SQL haversine. 좌표가 있을 때만 radius 적용, 응답에 `distanceKm` 포함 |

응답 `200 {arcades: Arcade[]}`. `LIMIT` 없음(942행 307KB 전체 반환 — 프런트 `fullListRef` 재사용 설계, 부하 리포트 '남은 것' 참조).

### `POST /api/arcades` — 관리자 전용
본문 `arcadeInputSchema`: `{name, address, lat, lng, openTime, closeTime, is24h, phone, note, machines: [{machineId, cabinets: [{condition: 1~5|null}]}]}` — 기체 수 = `cabinets.length`.
`201 {arcade}` · `401/403`(관리자 아님). 크라우드소싱은 제보·리뷰 위에서 돌고 기준 레코드(이름·주소·좌표)는 자유 편집 불가라는 설계.

### `GET /api/arcades/[id]` → `200 {arcade}` | `404`
### `PUT /api/arcades/[id]` — 관리자 전용. POST와 동일 스키마. 보유 기종·기체 재작성 — **자동 반영된 보유 제보를 되돌릴 수 있는 유일한 경로**. `200 {arcade}` | `404`
### `DELETE /api/arcades/[id]` — 관리자 전용. `204` | `404`. 제보·리뷰 CASCADE.

### `GET /api/arcades/[id]/reports`
`?limit`(기본 30, 상한 200). `200 {reports: MachineReport[]}`.

### `POST /api/arcades/[id]/reports`
본문 `reportInputSchema`: `{playerId?, kind: 'presence'|'absence'|'queue'|'condition', machineId, cabinetId?, waitCount?, condition?, comment?}` — 종류별 필수 필드는 스키마+DB CHECK 이중 강제.

| 상태 | 의미 |
|---|---|
| `201 {outcome, support: {count, threshold}, arcade}` | 성공. 갱신된 `arcade` 동봉 — 임계값 도달 시 보유 기종이 그 순간 바뀌므로 |
| `404` | 오락실 없음 |
| `409` | `MachineNotAtArcadeError` / `CabinetNotFoundError` — "입력이 틀렸다"가 아니라 "화면이 낡았다"는 뜻 |

### `GET /api/arcades/[id]/reviews` → `200 {reviews}`
### `POST /api/arcades/[id]/reviews`
`{playerId, rating: 1~5, body?}` — **1인 1리뷰 UPSERT**(평점 물타기 차단). `201 {review, reviews, arcade}`(평점 캐시 변경으로 arcade 동봉) | `404`.
### `DELETE /api/arcades/[id]/reviews?playerId=N` → `200 {reviews, arcade}` | `400`(playerId 없음) | `404`

---

## 2. 제보 (전국)

### `GET /api/reports`
전국 피드. `arcadeId` · `machineId` · `kind=queue,condition`(쉼표 목록) · `sinceHours`(**생략 = 시간 조건 없음**) · `limit`(기본 50, 상한 200).
`200 {reports, settings}` — `settings`는 `report_settings` 행(유효기간·임계값).
부수효과: 조회 시 `purgeExpiredQueueReports()` 실행 — 스케줄러가 없어 읽기/쓰기에서 만료 대기 제보를 **행째 삭제**.

### `DELETE /api/reports/[id]` — 관리자 전용
제보엔 수정 경로가 없어 장난 제보·메모 속 개인정보 제거의 유일한 수단. 작성자에겐 의도적으로 미개방(철거 임계값을 채운 뒤 증거를 지우는 악용 차단). `204` | `404`. 삭제해도 `arcade_machines`는 **되돌리지 않음**.

---

## 3. 인증 (Auth)

### `POST /api/auth/login`
`{nickname, password}`. 순서: 레이트리밋(`429`, 남은 분 포함) → 파싱 → 관리자 비밀번호 미설정 `503` → `ensureAdminAccount()` → `authenticate()`.
실패 → `401 {error: '아이디 또는 비밀번호가 올바르지 않습니다'}` — 닉네임 존재 여부를 탐지할 수 없게 단일 메시지. 성공 → `200 {user}` + 세션 쿠키.

### `POST /api/auth/signup`
`{nickname, password, passwordConfirm}`. 레이트리밋 키를 로그인과 **분리**(`signup:` 접두 — 남의 가입 실패가 기존 사용자를 잠그면 안 됨). 중복 닉네임 → `409`(의도적으로 숨기지 않음 — 숨기면 가입 자체가 불가능). 성공 → `201 {user}` + 세션 쿠키(가입 즉시 로그인).

### `POST /api/auth/logout` → `200 {user: null}` + 쿠키 삭제

### `GET /api/auth/session`
쿠키를 읽고 DB에서 닉네임·`is_admin`을 재조회. `200 {user}` | `{user: null}`. 계정이 사라졌으면 쿠키도 삭제.

### `GET /api/auth/nickname` → `200 {nickname, pending}` | `401`
### `POST /api/auth/nickname`
`{nickname, password?, passwordConfirm?}`. `nickname_pending`인 계정만 통과. `401 gone`(쿠키 삭제) · `409 settled/reserved/중복`. 비밀번호는 닉네임 성공 **후** 설정(409면 아무것도 안 바뀜). 성공 시 세션 쿠키 재서명(토큰에 닉네임이 들어 있으므로) → `200 {user}`.

### `GET /api/auth/oauth/[provider]?next=…` — OAuth 시작
제공자·자격증명 검증 실패 시 `/login?error=unconfigured`로 복귀(제공자 에러 페이지로 안 보냄). `newStateSecrets(pkce)` 생성 후 서명된 state 쿠키(`httpOnly` · `sameSite: lax` — strict는 복귀 내비게이션에서 쿠키 소실 · TTL 600초) 설정, 제공자 인가 URL로 `302`.
- Google·카카오는 **PKCE(S256)**, 셋 다 OAuth 2.0 인가 코드 흐름 — 차이는 주소와 프로필 JSON 모양뿐이라 라우트 한 벌이 처리(기획서).

### `GET /api/auth/oauth/[provider]/callback`
3중 검증: state 쿠키 존재 · `state.n === ?state` · `state.p === provider`(세 번째가 없으면 카카오 시작 흐름을 네이버 콜백으로 밀어 넣을 수 있음). `next`는 **오직 봉인된 쿠키에서만**(콜백 쿼리 불신). `exchangeCode → fetchProfile → linkOAuthAccount`. 첫 로그인이면 `/welcome?next=…`, 아니면 `next`로 리다이렉트 + 세션 쿠키. 모든 실패는 `/login?error=<code>`로 수렴, 상세는 `console.error`에만(공격자에게 진행 단계 비노출).

---

## 4. 계정 (Account)

### `GET /api/account` → `200 {nickname, hasPassword}` | `401`
### `PUT /api/account`
`{currentPassword?, nickname?, newPassword?, newPasswordConfirm?}` (닉네임/새 비밀번호 중 하나 필수).
비밀번호 있는 계정: 계정별 레이트리밋 키(`account:{playerId}`, `429`) → `currentPassword` 필수(`400`) → 검증 실패 `403`. OAuth 전용 계정: 검증 생략하되 첫 비밀번호 설정 필수. 닉네임 먼저, 비밀번호 나중(409면 무변경). 성공 시 쿠키 재서명 → `200 {user}`.

### `POST /api/account/verify`
`/account` 화면 게이트. `{password}` → `200 {ok: true}` | `401`/`403`/`429`. PUT과 **레이트리밋 키 공유**(이 라우트로 잠금 우회 불가). 성공해도 서버에 아무것도 남기지 않는 **무상태** 설계 — PUT이 재검증.

---

## 5. 게시판 (Posts)

### `GET /api/boards` → `200 {boards, categories}` — 글 0개인 게임도 포함(아니면 새 게임이 첫 글을 받을 수 없음)

### `GET /api/posts`
`machineId`(없음 = 전체 탭) · `category` · `sort=recent|popular`(popular = 추천 ≥ 5) · `playerId`(내 추천 여부) · `limit`(기본 20, 상한 100) · `offset`.
`200 {posts, notices, total, hasMore}` — `notices`는 탭·말머리·정렬과 무관하게 고정(최신 5), `posts`와 중복 없고 `total`에 **불포함**.

### `POST /api/posts`
`postInputSchema`: `{machineId|null, category, playerId, title, body?, bodyDoc?}` — `bodyDoc`은 zod가 아닌 `normalizeDoc`이 단독 검증(재귀 화이트리스트 중복 방지). **`noticeGuard`** 통과 필요. `201 {post}` · FK 위반 → `400 {error: '말머리 또는 게임을 다시 확인해 주세요'}`(500 아님).

> **noticeGuard** (`app/api/posts/notice-guard.ts`): 말머리가 `notice`면 세션 쿠키로 관리자 확인(본문 `playerId`는 클라이언트 작성물이므로 불신) + `세션.playerId === 본문.playerId` 요구 → 위반 시 `403 {error: '공지는 관리자 본인 이름으로만 쓸 수 있습니다'}` — 공지의 작성자는 출처 그 자체.

### `GET /api/posts/[id]`
`?playerId` · `?view=1`(조회수 증가 — 첫 열람에만) · `?commentOffset`(서버가 범위로 클램프, 실제 사용값이 `post.commentOffset`으로 회신). `200 {post}` | `404`.

### `PUT /api/posts/[id]`
POST와 동일 스키마 + `noticeGuard` 재실행("일반 글로 쓰고 말머리만 공지로 바꾸기" 경로 차단). 소유자 아님 → `403`. `200 {post}` | `404` | FK `400`.

### `DELETE /api/posts/[id]?playerId=N`
관리자(`isAdminRequest`) → 남의 글 삭제 가능. 일반 사용자 → 본인 글만(`403`). `204` | `404`. **수정은 관리자에게도 미개방** — 삭제는 중재, 남의 이름으로 고쳐 쓰기는 아님.

### `POST /api/posts/[id]/like`
`{playerId, commentOffset?}` — on/off 쌍이 아닌 단일 **토글**(DB 현재 상태가 정본, 두 탭이 어긋날 수 없음). `200 {liked, post}` | `404`.

### `POST /api/posts/[id]/comments`
`{playerId, body}`. 갱신된 글 전체를 **막 쓴 댓글이 보이는 페이지**(`lastCommentOffset`)로 반환. `201 {post}` | `404`.

### `DELETE /api/posts/[id]/comments?commentId=&playerId=&commentOffset=`
관리자는 `playerId` 불요. 결과 null → 관리자 `404`(댓글 없음) vs 일반 `403`(본인 것만). `200 {post}`.

---

## 6. 업로드 (Uploads)

### `POST /api/uploads`
multipart: `file`(레거시 별칭 `image` 허용) + `playerId`.
선언된 `file.size`를 **버퍼링 전에** 검사(500MB 업로드를 메모리에 다 읽고 거부하는 사고 방지) → `413`. 저장은 **매직 바이트 판정**(확장자·Content-Type은 클라이언트 통제물) + 타입별 상한(이미지 5MB · 영상 50MB).
`201 {file, image}` · 미지원 형식 `415` · 초과 `413`. 알려진 부채: 초안 이탈 시 `post_id IS NULL` 고아 행 — 정리 배치 없음(부분 인덱스는 준비됨).

### `GET /api/uploads/[id]`
원본 서빙. 파일은 `public/` 밖 — 향후 비공개 게시판 규칙이 생겨도 자리가 한 곳.
`Cache-Control: public, max-age=31536000, immutable`(파일명이 콘텐츠 해시라 id의 바이트는 불변) · `Accept-Ranges: bytes` · 단일 Range 지원(`206`/`416`) — 멀티 Range는 `<video>`가 안 쓰므로 전체 `200`. `404`.

---

## 7. 서열표 (Tier / Charts)

### `GET /api/tier`
`machineId` · `mode` · `level` · `playerId`. `machineId`는 `listGames()` 검증 후 폴백(서열표 없는 기종 URL이 화면을 비우지 않게). `mode`/`level`은 *희망값* — `정확 일치 ?? 같은 모드 ?? levels[0]` 순으로 서버가 결정. `200 {games, machineId, levels, board}` (`board: null` = 채보 없음).

### `GET /api/charts/[id]?playerId=` → `200 {chart}` | `404`

### `POST /api/charts/[id]/clear`
`{playerId, cleared: boolean}`. 클리어 해제 시 그 채보의 투표가 FK CASCADE로 소멸. `200 {chart}`.

### `POST /api/charts/[id]/vote`
`{playerId, value: number|null}`(null = 철회). 범위는 하드코딩이 아닌 `tier_settings`의 `voteMin/voteMax`로 검증 → `400`. 미클리어 `NotClearedError` → `403` — **DB 복합 FK로도 강제**되는 이중 게이트. `200 {chart}`.

### `POST /api/charts/[id]/special`
`{playerId, special: boolean}` — 특수패턴(개인차 아닌 기믹 채보) 표시. 마이그레이션 041부터 **1인 1표 `special_marks` + `special_min`(기본 3) 합의제**. 클리어 게이트 없음(세는 대상이 사람이므로). `200 {chart}`.

### `GET /api/charts/[id]/comments` → `200 {comments}`
### `POST /api/charts/[id]/comments`
`{playerId, body, tags}` — 태그는 `CHART_TAGS` 화이트리스트 최대 4개, 1인 1건 UPSERT, **클리어 게이트 없음**(어디서 막혔는지도 정보). `201 {chart}` | `404`.
### `DELETE /api/charts/[id]/comments?playerId=N` → `200 {chart}` | `400` | `404`

---

## 8. 즐겨찾기 (Favorites) — 세션 전용

플레이어는 **세션에서만** 결정(본문 `playerId`를 믿는 구식 경로와 달리 — 남의 데이터를 조용히 바꾸는 일이므로).

- `GET /api/favorites` → `200 {arcadeIds}` — 비로그인은 `401`이 아닌 `200 {arcadeIds: []}`(사이드바가 무조건 호출하며, 비로그인은 오류가 아님)
- `POST /api/favorites` `{arcadeId}` → `200 {arcadeIds}` | `401` | `400` | `404`(FK 위반을 존재 검사로 사용 — TOCTOU 없음)
- `DELETE /api/favorites?arcadeId=N` → `200 {arcadeIds}` — 애초에 없던 것을 지워도 `200`(별은 이미 꺼져 있고, 오류는 사용자가 고칠 수 없음)

---

## 9. 참조 목록

- `GET /api/machines` → `200 {machines}` — 서버 5분 TTL 캐시
- `GET /api/games` → `200 {games}` — `tier_settings` 있는 기종만, 캐시
- `GET /api/players` → `200 {players}` — 인증 도입 전 프로토타입 잔재(주석에 명시)

## 10. 지역 검색 (Places)

### `GET /api/places?q=강남역`
`isPlaceQuery`(2~60자) 검증 → `400`. `lib/naver-local.searchLocal` 래핑, `pickPlace`(정상 좌표를 가진 첫 항목)로 `200 {place: Place|null}`.
라우트로 존재하는 이유는 오직 `NAVER_HUB_API_KEY_*`를 서버에 두기 위함. 자격증명 미설정 → `503`, 그 외 실패 → `502`. **버튼/Enter에서만 호출**(일 쿼터를 오락실 임포터와 공유).

## 11. 챗봇 (Chat)

### `POST /api/chat` (`maxDuration = 120`)
`GEMINI_API_KEY` 없음 → `503`(순위 기반 검색은 키 없이도 동작한다는 안내 포함).

**본문** `chatInputSchema`: `{turns: [{role: 'user'|'assistant', text: 1~4000자}]}` 1~24턴, 마지막은 반드시 `user`.

**시스템 프롬프트**는 요청 시점에 현재 리듬 기종 목록(`listMachines()` → rhythm 필터)으로 조립 — 답변 범위가 하드코딩이 아니라 DB를 따라 움직임. 범위 밖 질문 고정 거절문, 인메시지 탈옥 저항, **"최신/현재/신곡" 질문엔 Google 검색 필수**(모델의 "최신 펌프 버전" 기억은 낡았고 틀렸다는 신호가 없으므로) + 답변에 기준 버전 명시.

**도구**: `search_arcades{query?, machine?}` · `search_reports{machine?, kind?, sinceHours?}` · `search_posts{query?, machine?}` (lib/chat-tools 디스패치, 도구별 결과 상한) + 내장 `googleSearch`. 모델 `gemini-3.7-flash`, 최대 8회 왕복(마지막 회는 `functionCallingConfig.mode = NONE`으로 언어 답변 강제), 모델 턴은 **원문 그대로** 되돌려 `thoughtSignature` 보존. 도구 실패는 대화 중단이 아니라 `{error}`로 모델에 회신.

**출처**: `groundingMetadata.groundingChunks[].web`에서만 수집 — 답변 텍스트 정규식 스크래핑 금지(환각 URL 귀속 방지).

| 상태 | 조건 |
|---|---|
| `200 {text, sources?}` | 정상 (안전 차단 시에도 `200 {text: '이 질문에는 답할 수 없습니다.'}`) |
| `429` | Gemini 429 (Notion 개인 프로젝트 3의 무료 플랜 429 이슈 → 이후 재연결·예외처리 강화, 개인프로젝트 4·5) |
| `502` | 키 무효(401/403) 또는 모델 미제공(404) |
| `504` | SDK fetch 오류(TypeError) |
| `500` | 그 외 |
