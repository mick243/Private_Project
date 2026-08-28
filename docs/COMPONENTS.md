# 오락실 파인더 — 컴포넌트 문서

> 작성일: 2026-08-25 · 대상: `components/` 전체 28개 컴포넌트 + `lib/use-*` 클라이언트 훅 7개
> 출처: 코드베이스 전수 조사, [오락실파인더_기획서.html](../../오락실파인더_기획서.html), Notion 개인프로젝트 3~5(지도 최적화 기록)

스택: **Next.js 16 (App Router) · React 19 · TypeScript · Tiptap 3(ProseMirror) · Naver Maps SDK**.
`OAuthButtons`·`RichText`를 제외한 모든 컴포넌트가 `'use client'` 입니다.

## 구성 지도

| 영역 | 컴포넌트 |
|---|---|
| 내비게이션·세션 | TopNav · PlayerPicker · AuthMenu · SidebarHandle |
| 인증·계정 | LoginForm · SignupForm · NicknameForm · AccountForm · OAuthButtons |
| 지도 | MapPane · NaverMap · FallbackMap · LocateButton · MapPerfPanel |
| 파인더(메인) | ArcadeFinder · ArcadeList · ArcadeForm · ArcadeDetailPanel · ArcadeReviews · StarRating · LiveBadge |
| 커뮤니티 | CommunityView · PostList · PostDetailView · PostForm · PostBody · PostMedia · RichText · RichTextEditor |
| 실시간 피드 | LiveFeed |
| 서열표 | TierBoardView · ChartDetailPanel · ChartComments |
| 챗봇 | ChatBot |
| 공용 | Pagination |

---

## 1. 내비게이션 · 세션

### TopNav (~61줄)
전역 상단 내비게이션. 링크 4개(`/` 파인더 · `/live` 실시간 제보 · `/tier` 서열표 · `/community` 커뮤니티)와 우측의 `PlayerPicker` + `AuthMenu`. 모바일에서는 햄버거 드로어로 접히고, `pathname` 변경 시 자동으로 닫힙니다.
- **Props** 없음 / `usePathname`, `useState(open)`
- **접근성**: `<nav>` 시맨틱, 햄버거 버튼에 `aria-label`(메뉴 열기/닫기) + `aria-expanded`. 활성 링크가 CSS 클래스뿐이라 `aria-current="page"` 없음(개선 항목).

### PlayerPicker (~38줄)
"지금 누구로 행동 중인가"를 표시. 인증 도입 전에는 `<select>` 였으나 지금은 세션만 읽으며, 비로그인 시 아예 렌더링하지 않습니다(빈 표시는 선택 가능한 것처럼 보이므로). 관리자 배지가 여기 붙습니다.
- **접근성**: 래퍼 `title`로 잘린 긴 OAuth 닉네임 보완, `<strong>`/`<em>` 시맨틱.

### AuthMenu (~70줄)
로그인/로그아웃 진입점. `next`로 `pathname`만 넘깁니다 — `useSearchParams`를 쓰면 모든 페이지가 정적 생성에서 빠지기 때문.
- **상태**: `useSession`, `busy`. 로그아웃은 `POST /api/auth/logout` → `setSession(null)`.
- **접근성**: 요청 중 `disabled` 처리. 로그아웃 완료를 알리는 라이브 리전 없음.

### SidebarHandle (~50줄)
사이드바↔지도 경계에 고정된 단일 접기/펼치기 핸들. 사이드바 안이 아니라 **경계에** 두어 접힌 상태에서도 컨트롤이 사라지지 않습니다.
- **Props**: `open`, `onToggle`, `controls`(제어 대상 id)
- **접근성**: 모범 사례 — `aria-label` + `aria-expanded` + `aria-controls="arcade-sidebar"` + `title`, 장식 SVG는 `aria-hidden`.

---

## 2. 인증 · 계정

### LoginForm (~167줄)
`/login` 전체 화면. 아이디/비밀번호·회원가입·OAuth 세 경로가 합류합니다. `?next=`는 `safeNext()`로 정제(오픈 리다이렉트 방어), `?error=`는 OAuth 실패 코드를 한국어 메시지로 변환. 이미 로그인 상태면 리다이렉트하지 않고 "이미 로그인되어 있습니다" + 로그아웃 버튼을 보여줍니다(계정 전환 의도 존중). 성공 시 `router.replace`로 뒤로가기에 폼이 남지 않게 합니다.
- **접근성**: `<label>` 래핑, `autoComplete="username"/"current-password"`, Enter 제출. 오류 문단이 `aria-live` 아님(개선 항목).

### SignupForm (~175줄)
닉네임+비밀번호만 받는 회원가입(이메일 등 본인 인증 수단은 미구현). 서버가 가입과 동시에 세션 쿠키를 발급하므로 재로그인이 없습니다. `localIssue()`가 서버 규칙(`signupInputSchema`)을 미러링해 즉시 피드백.

### NicknameForm (~233줄)
OAuth 최초 로그인 직후 1회 노출되는 표시명 결정 화면(`/welcome`). 소셜 로그인엔 이름을 정하는 단계가 없어 제공자 이름("홍길동2")이 게시글에 그대로 찍히던 문제의 해결책. 건너뛰면 `nickname_pending`이 유지되어 다음 로그인에 다시 묻습니다. 선택적으로 첫 비밀번호도 설정.
- **상태 기계**: `loading → ask → done` 판별 유니온.

### AccountForm (~281줄)
`/account` 프로필 편집. **4단계 상태 기계** `loading → anonymous | gate | edit`. 비밀번호가 있는 계정은 재입력 게이트(`POST /api/account/verify`)를 통과해야 편집 폼이 열리고, 검증된 비밀번호는 컴포넌트 상태로만 들고 있다가 `PUT /api/account`에 다시 실어 보냅니다 — 서버는 "검증됨" 플래그를 보관하지 않습니다(무상태).

### OAuthButtons (~96줄, 서버 안전)
Google·카카오·네이버 버튼 행. 의도적으로 `fetch`가 아닌 `<a href>` — 주소창이 제공자에게 넘어가는 것을 사용자가 봐야 하고, XHR로는 교차 출처 동의 화면을 열 수 없습니다. 키는 서버 전용이라 어떤 제공자가 설정됐는지 클라이언트는 모릅니다(미설정 시 `/login?error=unconfigured`로 복귀).
- **접근성**: 브랜드 SVG `aria-hidden`, 이름은 인접 텍스트("Google 로그인")에서.

---

## 3. 지도

### MapPane (~80줄)
Naver 키가 있으면 `NaverMap`, 없으면 `FallbackMap`을 고르는 스위치(둘 다 `next/dynamic` + `ssr:false`). **지도 계약(`MapPaneProps`)의 정본 문서** 역할: `arcades`/`selectedId`/`onSelect`, 좌표 지정(`picking`/`pickedCoord`/`onPick`), `center`/`radiusKm`/`myLocation`/`followCenter`, 순위 배지 `rankById`, 뷰포트 보고 `onViewportChange`, 그리고 재중심 트리거 3종(`focusNonce`·`centerNonce`·`focusPoint`).

### NaverMap (~756줄) — 성능 엔지니어링의 중심
Naver SDK의 기본 `Marker` 대신 **커스텀 `OverlayView` 서브클래스**를 사용합니다. 기본 마커는 `left/top`으로 위치를 잡아 리플로우를 유발하지만, 이 구현은 `projection.fromCoordToOffset()` + `translate3d`로 팬/줌 시 리플로우가 없습니다. (측정 근거는 [성능·접근성 리포트](PERF-A11Y-REPORT.md) 참조)

핵심 메커니즘:
- **뷰포트 컬링** — `CULL_MARGIN 0.2` 패딩된 화면 범위 안의 오락실만 그림. 선택된 오락실은 항상 유지. `bounds_changed`가 아닌 `idle` 이벤트에서 재계산.
- **마커 풀링** — 제거 대신 `hide()` 후 풀(최대 200)에 반납. `setMap(null)`은 1회 1.66ms × 142회 = 236ms 멈춤이 측정되어 배제.
- **2단계 셰이프 디핑** — ① 동일 객체 참조 + z 동일이면 통째로 스킵 ② 아니면 HTML 문자열을 만들어 값 비교. 동기화 64.6ms → 30.8ms, `draw()` 474회 → 7회.
- **z-index 사다리**: 일반 100 · 순위 150 · 선택 200 · 호버 250 · 지정 마커 300 · 내 위치 400.
- **`autoResize()` + 220ms 재중심 + `ResizeObserver`** — Naver는 window 리사이즈만 감지해 사이드바 접힘/디테일 열림 시 핀이 360px 밀리던 문제의 해법.
- `will-change: transform`은 **내 위치 마커에만** — 337개 전부 승격은 오히려 손해로 측정됨.
- **접근성**: 구조적으로 취약 — 마커가 `innerHTML` 주입 `<div>`라 포커스·키보드·접근 가능한 이름이 없음. `ArcadeList`가 지도의 접근 가능한 대체물 역할.

### FallbackMap (~388줄)
키 없이 동작하는 대체 지도 — lat/lng를 컨테이너에 선형 투영. 등록·좌표 지정·선택 흐름이 Naver 키 없이 전부 테스트 가능합니다. 자체 드래그(포인터 캡처), 커서 기준 휠 줌(수동 `{passive:false}` 리스너 — React 합성 `onWheel`은 passive라 `preventDefault` 불가), 동일한 `CULL_MARGIN 0.2` 컬링, fit-to-points.
- **접근성**: NaverMap보다 우수 — 마커가 실제 `<button>`이라 키보드 경로가 동작합니다.

### LocateButton (~62줄)
지도 좌하단 "내 위치" FAB. 3상태: `idle`(회색) / `locating`(점멸) / `tracking`(초록, 누르면 정지 후 마지막 좌표를 기준점으로 동결).
- **접근성**: 상태별 `aria-label` + `aria-pressed={following}` + `title`, SVG `aria-hidden` — 모범 사례.

### MapPerfPanel (~172줄)
`?perf=1`에서만 동적 로드되는 개발용 측정 패널. 실시간 값(마커 수/전체, 지도 DOM 노드, JS 힙 MB, 마지막 동기화 ms + draw 횟수)과, 컬링 ON/OFF로 4초간 지도를 흔든 전후 FPS/블로킹 비교를 보여줍니다.
- **접근성**: `<dl>`/`<table>` 시맨틱 올바름(개발 도구로서 충분).

---

## 4. 파인더 (메인 화면)

### ArcadeFinder (~1,236줄) — 애플리케이션 오케스트레이터
홈 화면 전체를 소유: 3분할 레이아웃(사이드바/지도/디테일), 필터, 목록, 지도, 디테일 패널, 챗봇, GPS 기준점.

- **2단 기준점**: `origin = follow && live.coord ? live.coord : fixedCenter`. 별도의 `anchor`는 원점이 **0.3km 이상** 움직였을 때만 전진하고, 페치는 `radius + 0.5km` 마진으로 받아 클라이언트가 다시 자릅니다. 순위/거리는 GPS 틱마다 클라이언트에서 재계산 — 네트워크는 조용합니다.
- **데이터 파이프라인**: `arcades → ranked(rankArcades) → inRadius → inViewport(지도 뷰포트, 검색 중엔 우회) → ordered(정렬→즐겨찾기 우선→선택 우선→30개 컷) → listed(10개/페이지)`. 지도는 `inRadius` 전체를 그림 — 목록과 지도가 갈리는 유일한 지점.
- **검색 의미론**: 검색어가 있으면 전국 검색(반경·뷰포트 컷 해제). `isCityQuery`(…시)면 지점 줌 대신 지역 이동(`/api/places` → `jumpToPlace`).
- **챗봇 브리지**: `runSearch(order, constraints)`가 새 가중치로 `rankArcades`를 동기 재실행(setState 커밋 전이므로), 언급된 오락실을 기준점 피벗+제외 처리, `SearchOutcome`을 말풍선용으로 반환.
- **상태 유지**: 선택 오락실 id + 디테일 열림을 `sessionStorage`(`arcade-finder:selected`)에 저장 — 탭 이동 후 복귀 시 선택값이 유지됩니다. 하이드레이션 불일치를 피하려 마운트 후에 읽습니다.
- **반응형**: `useIsStacked()`(≤860px)에서 목록 행은 지도만 이동(디테일 안 엶), `useIsMapFolded()`(≤1180px)에서 "위치" 버튼이 먼저 사이드바를 접음.
- **메모화 계약**: 파생 목록은 `useMemo`, 콜백 11종은 `useCallback` — `memo(ArcadeList)`/`memo(ArcadeDetailPanel)`가 실효를 갖는 전제 조건.
- **접근성**: 랜드마크 구조 양호(`<aside id="arcade-sidebar">`/`<main>`/`<h1>`). 검색 인풋에 레이블 없음, 기종 필터 칩에 `aria-pressed` 없음, 상태 문구가 라이브 리전 아님(개선 항목).

### ArcadeList (~219줄, `memo`)
사이드바 결과 목록. 행마다 이름·거리·즐겨찾기 별·주소·영업시간·평점·기종 배지·**기체별 컨디션 점**·대기 행·액션 바. 점 1개 = 기체 1대 — 2대 중 1대 고장을 목록 단계에서 보이게 하는 설계.
- **접근성**: 주요 격차 — 행이 `<li onClick>`이라 **마우스 전용**(role/tabIndex/키 핸들러 없음). 즐겨찾기 별은 `aria-pressed` 있음.

### ArcadeForm (~338줄)
관리자 전용 등록/수정 폼. 기체 수는 별도 숫자가 아니라 `cabinets.length` — "3대인데 컨디션은 2개"가 표현 불가능한 구조. 좌표는 지도 클릭 or 수동 입력. `POST/PUT /api/arcades`.
- **접근성**: `<label>` 래핑·`required`·오류 목록 양호. 위도/경도 인풋이 placeholder 의존(개선 항목).

### ArcadeDetailPanel (~550줄, `memo`)
우측 디테일 패널: 헤더 → 기종별 목록 → 없는 기종 제보 → 최근 제보 20건 → 리뷰. **대기는 기종 단위**(줄은 게임 앞에 서므로), **컨디션은 기체 단위**(`CabinetCard`) — `OpenForm` 키에 `cabinetId`가 들어가는 이유. 제보 응답의 갱신된 `arcade`를 `onArcadeChanged`로 부모에 올립니다(임계값 도달 시 보유 기종이 즉시 바뀌므로).
- **접근성**: 대기 `<select>` `aria-label`, 컨디션 1~5 버튼 `aria-pressed` 양호. 메모 인풋 레이블 없음, 제보 결과 문구가 라이브 리전 아님(개선 항목).

### ArcadeReviews (~153줄)
1인 1리뷰 목록+폼. 내 리뷰가 있으면 폼을 프리필해 "수정"으로 전환. 변이 응답이 `reviews`+`arcade`(평점 캐시 변경)를 함께 반환.

### StarRating (~45줄)
이중 모드 별점: `onChange` 없으면 표시(래퍼에 `aria-label="N / 5"`), 있으면 1~5 버튼(각각 `aria-label="N점"`). `radiogroup`은 아님.

### LiveBadge (~81줄, named export)
- `WaitBadge` — "지금 대기" 알약. 유효 제보가 없으면 `null` 렌더 — 공백은 "정보 없음", "0명"은 "바로 플레이 가능"이라는 전혀 다른 주장이므로. 혼잡도는 **기체당** 환산(`waitLevel(count, cabinets)`).
- `ConditionBadge` — 기체별 컨디션 알약. 집계·반올림은 SQL 뷰 `cabinet_condition`이 하고 여기선 재계산하지 않음.
- **접근성**: 의미가 `title` 툴팁에 실려 있어 터치/스크린리더에 불안정(개선 항목).

---

## 5. 커뮤니티

### CommunityView (~343줄)
커뮤니티 화면 전체: 게임 탭·말머리 칩·인기글 토글·페이지네이션·상세·글쓰기 폼. 특징은 **수제 인앱 히스토리 스택**(`viewsRef` + `idxRef` + `pushState({__idx})` + `popstate` 복원) — 브라우저 뒤로가기가 파인더로 이탈하지 않고 화면 **안에서** 이동하며 탭/말머리/정렬이 유지됩니다. 주석의 경고: 히스토리 엔트리 0을 `replaceState`로 덮지 말 것(Next 라우터 복원 상태라 덮으면 페이지가 리마운트되어 탭이 초기화됨).
- **접근성**: 게임 탭이 `role="tablist"`/`aria-selected` 없이 CSS `is-on`뿐(개선 항목). 인기글 정렬 버튼은 `aria-pressed` 있음.

### PostList (~103줄)
공지(별도 `<ul>` + 구분선) → 일반 글. 공지는 게임 배지를 안 보여줌(모든 탭에 뜨므로 오해 소지). 빈 상태 문구가 `popularOnly`에 따라 다름 — 글이 있는데 임계값만 못 넘겼을 때 "첫 글을 써보세요"는 거짓이므로.
- **접근성**: ArcadeList와 동일한 격차 — 행이 마우스 전용.

### PostDetailView (~278줄)
글 상세 + 댓글 페이지네이션. 조회수는 **첫 열람에만** 증가(`viewedPostId` ref → `?view=1`) — 페이징/추천으로는 안 오름. 추천·댓글·삭제 모두 `commentOffset`을 실어 보내 읽던 댓글 페이지가 유지됩니다. 관리자는 남의 글/댓글 삭제 가능(세션으로 재확인), **수정은 소유자 전용**(삭제는 중재지만 남의 이름으로 글을 고쳐 쓰는 건 아니므로).
- **접근성**: `<article>`/`<header>`/`<h1>`/`<section>` 시맨틱 양호. 추천 버튼 `aria-pressed` 없음.

### PostForm (~231줄)
글 작성/수정. 공지 특수 케이스: 공지 칩은 관리자에게만 노출(실제 게이트는 서버 `notice-guard.ts`), 선택 시 게임 `<select>`를 잠그고 비움(`machineId: null`). `body`(마커 포함 평문)와 `bodyDoc`(리치 JSON)을 함께 유지 — 저장은 doc이 정본, 제출 버튼 활성화는 평문이 결정.
- **접근성**: `htmlFor`/`id` 연결이 코드베이스에서 가장 잘 된 폼.

### PostBody (~69줄) / PostMedia (~86줄)
본문 렌더러. `bodyDoc` 있으면 `RichText`로 위임, 없으면 레거시 평문 경로(`[[image:N]]` 마커 분해, 본문에 없는 첨부는 끝에 덧붙임). 텍스트는 항상 React 텍스트 노드 — HTML 해석 없음.
- `PostImage` — 원본에 치수 정보가 없어 `loading="lazy"` 단독으론 깨짐(크기 없는 img가 2×2로 붕괴해 Chrome 휴리스틱 오작동 — 실측). 로드까지 16/10 비율 플레이스홀더 클래스 유지.
- `PostVideo` — `<video>`엔 lazy 속성이 없어 `IntersectionObserver`(rootMargin 400px)로 근접 시에만 `<video controls preload="metadata">` 장착(메타데이터만도 파일당 수백 KB).
- **접근성**: `alt="첨부 사진"`(일반적이지만 존재), `<video controls>` 네이티브 키보드.

### RichText (~191줄, 서버 안전)
저장된 `RichDoc` JSON을 React 요소로 렌더. **`dangerouslySetInnerHTML` 0회** — 텍스트는 텍스트 노드로, 태그는 이 파일에 열거된 것만 생성 가능, 스타일 값은 저장 시점에 닫힌 집합으로 좁혀져(`normalizeDoc`) 출력 단 새니타이저가 필요 없습니다. 첨부는 id를 첨부 목록에서 해석 — 남의 첨부를 끌어오는 것을 차단. 제목이 h1이므로 본문 헤딩은 h2~h4로 렌더(문서 아웃라인 보존).
- **접근성**: 시맨틱 HTML 출력 강점. 표에 `<caption>`/`<thead>` 없음, 새 창 링크 힌트 없음(경미).

### RichTextEditor (~652줄)
Tiptap 편집기. `contenteditable` 수제 구현을 의도적으로 배제(선택 서식·undo·한글 IME 조합이 수제 편집기가 썩는 지점). 위로 내보내는 건 HTML이 아니라 `normalizeDoc(editor.getJSON())` + 평문 투영이고, **서버가 같은 정규화를 다시 돌립니다** — 우회 요청이 스키마 밖 노드를 주입할 수 없음. 업로드는 파일당 `POST /api/uploads`, 노드 타입은 **서버 판정 MIME**으로 결정. 붙여넣기/드롭 가로채기, 링크/유튜브 URL은 인라인 입력 바(`window.prompt`는 일부 브라우저 차단).
- **접근성**: 툴바 `<select>` 4종 `aria-label` 있음. 아이콘 버튼이 `title`만 있고 `aria-label`·`aria-pressed` 없음, `role="toolbar"` 없음(개선 항목). 색 스와치는 개별 `aria-label` 양호.

### Pagination (~89줄)
글 목록·댓글·사이드바가 공유하는 단일 페이징 관용구.
- **접근성**: **코드베이스 최강** — `<nav aria-label="페이지">`, 화살표 버튼 4종 `aria-label`, 경계에서 `disabled`, 현재 페이지 `aria-current="page"`.

---

## 6. 실시간 피드 — LiveFeed (~222줄)
전국 제보 피드. 필터: 종류 세그먼트(전체/대기/컨디션/기종 변동)·기간·기종. 30초 자동 갱신 + "마지막 갱신 N분 전". 기간 '전체'는 **진짜 시간 조건 없음**(`sinceHours` 미전송) — 과거엔 전체=90일이라 영구 보존인 보유/철거 제보가 어디서도 볼 수 없던 버그의 수정. 관리자 삭제는 로컬 제거만(30초 타이머와의 스크롤 점프 회피).
- **접근성**: `<select>` 2종 레이블 없음, 종류 버튼 `aria-pressed` 없음, 30초 교체에 라이브 리전 없음(개선 항목).

## 7. 서열표

### TierBoardView (~222줄)
2열 서열표. `Selection {machineId, mode, level}`은 **요청일 뿐** — 렌더되는 조합은 `board.mode/level`에서 되읽습니다(단일 진실). 게임 전환 시 이전 모드/레벨이 존재하지 않을 수 있어(펌프 S15 → 사볼 S15) 서버가 가장 가까운 유효 조합을 고릅니다.
- **접근성**: 채보 칩은 실제 `<button>`(키보드 OK). 클리어 마크가 빈 `<i title>`(개선 항목), 모드 세그먼트 `aria-pressed` 없음.

### ChartDetailPanel (~301줄)
채보 1개의 우측 패널: 통계 그리드·투표 분포 히스토그램·내 기록(클리어 체크 + 난이도 슬라이더)·특수패턴 마킹·평가. `nearestGradeIndex()`는 SQL `recalc_chart_stats` 규칙의 **의도적 미러 구현** — 앵커 동률이면 0에 가까운 쪽(안쪽 등급)을 택함. 한쪽만 고치면 보드 배치와 슬라이더 레이블이 어긋납니다. 특수패턴이면 `특수패턴 / 중상`처럼 병기(투표 유래 등급은 살아 있으므로).
- **접근성**: 체크박스 레이블 양호. 슬라이더에 `aria-label`/`aria-valuetext` 없음, 히스토그램 막대에 텍스트 대체 없음 — 막대 아래 숫자가 완화(개선 항목).

### ChartComments (~189줄)
채보당 정성 평가("왜 어려운가"). 1인 1건 UPSERT, 태그는 `CHART_TAGS` 화이트리스트 최대 4개. **의도적으로 클리어 게이트 없음** — 어디서 막혔는지도 정보이며, 각 평가에 클리어/미클리어 주석.

## 8. 챗봇 — ChatBot (~398줄)
플로팅 도우미. **의도 분기는 모델이 아니라 클라이언트에서**(`isArcadeSearchIntent`): 검색 의도면 API를 안 치고 1·2·3순위 인라인 폼을 엶 — 이 경로는 `GEMINI_API_KEY` 없이도 동작해야 하고 분기는 결정적이어야 하므로. 그 외는 최근 12턴과 함께 `POST /api/chat`. `PriorityForm`은 이미 고른 요소를 다른 드롭다운에서 `disabled` 처리(잘못된 입력을 나중에 거부하기보다 선택 시점에 차단). 내부 점수(5/3/2)는 절대 노출하지 않음. `ask()`를 `setMessages` 업데이터 안에서 부르지 않음(StrictMode 이중 호출 → 중복 요청).
- **접근성**: FAB `aria-label`+`aria-expanded` 양호. 패널이 `role="dialog"`지만 **모달이 아님** — 포커스 트랩·Escape·`aria-modal`·닫을 때 포커스 복귀 없음. 새 메시지에 `aria-live` 없음 — 채팅 UI로선 중대(개선 항목).

---

## 9. 클라이언트 훅 (`lib/use-*`)

| 훅 | 역할 |
|---|---|
| `use-session` | `useSyncExternalStore` 기반 전역 세션 스토어. 진실은 서버 서명 쿠키뿐 — 변조해도 UI 그림만 바뀌고 API가 재검증. |
| `use-player` | `usePlayerId()`. 과거 localStorage 선택값 → 현재 세션 유도 단일 소스(두 진실은 반드시 갈라지므로). |
| `use-favorites` | 공유 즐겨찾기 스토어 — 목록/디테일/홈이 다른 별 상태를 보일 수 없게. 늦은 응답 가드, 내용 동일 시 버전 범프 생략. |
| `use-live-location` | `watchPosition` 기반(1회 조회는 역에서 멈춘 기준점을 남김). 최소 이동 미만·정확도 미달(실내 Wi-Fi 500m~2km 요동) 판독은 무시. |
| `use-priority` | 1·2·3순위 localStorage 저장(취향은 드물게 바뀜). 폼 시드만 하고 자동 검색은 안 함. 읽을 때 재검증. |
| `use-sidebar` | **항상 접힌 채 시작** — 무필터 첫 화면은 몇 행 안 되어 지도를 좁힐 가치가 없음. 이 규칙과 모순되는 localStorage 복원은 제거됨. |
| `use-stacked` | CSS 미디어쿼리를 정확히 미러링(≤860px stacked, ≤1180px map-folded). `matchMedia` + `useSyncExternalStore`. |
