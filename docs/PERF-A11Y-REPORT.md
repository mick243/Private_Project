# 오락실 파인더 — 프런트엔드 성능 · 접근성 리포트

> 작성일: 2026-08-25
> 출처: Notion 「개인 프로젝트 3」(지도 렉 진단), 「개인프로젝트 4」(수정 목록), 「개인 프로젝트 5」(최적화 실측치), `components/NaverMap.tsx`·`components/MapPerfPanel.tsx`·`lib/map-perf.ts` 주석의 측정 기록, 커밋 `0bc2766`(모바일 파인더 동작 개편)
> 서버 측 성능(DB·부하테스트)은 [부하·성능 리포트](LOAD-TEST-REPORT.md)에 분리했습니다.

---

## Part 1. 성능

### 1.1 문제의 발단 (Notion 개인 프로젝트 3)

- 지도를 **축소하면 리소스가 늘어 렉이 심하게 걸림** — 오락실 지점명이 대량 출력되어 리소스 과다로 진단.
- 축소 시 **좌표가 틀어져** 심하면 다른 동까지 넘어가는 현상.
- 커뮤니티·실시간 제보 탭 초기 로딩 2~3초.
- detail-pane이 열려 있을 때, 커뮤니티 글에 영상·이미지가 많을 때의 최적화 이슈(개인프로젝트 4).

### 1.2 1차 개선 — 지점명 렌더 축소 (Notion 개인 프로젝트 3)

지점 이름을 항상 그리지 않고 **호버·클릭 시에만** 표시하도록 변경.

| 지표 | 결과 |
|---|---|
| 레이아웃 호출 시간 | **−14%** |
| 스타일 재계산 시간 | **−20%** |

렉은 사라졌으나 모바일에선 호버가 없어 사용 경험이 다소 불편해짐 → 이후 모바일 동작 개편(커밋 `0bc2766`)으로 보완.
좌표 틀어짐은 **건물 중심 좌표 + anchor 재설정**(각 좌표의 축을 anchor 중심으로 고정)으로 해결.

### 1.3 2차 개선 — 뷰포트 컬링 (Notion 개인 프로젝트 5)

"detail-pane이 열려 있을 때 최적화 이슈 → 오락실 지점을 전부 출력이 아닌 **화면 안에만** 나오게 수정."

**CPU (로드 시)**

| 지표 | 개선 전 | 개선 후 | 증감 |
|---|---|---|---|
| 초기 마커 동기화(단일 블로킹 작업) | 622 ms | **156 ms** | **−75%** |
| `draw()` 호출 | 1,449회 / 68 ms | **337회 / 20 ms** | **−77%** |
| 강제 스타일·레이아웃 | 6,445 ms | **2,397 ms** | **−63%** |

**메모리**

| 지표 | 개선 전 | 개선 후 | 증감 |
|---|---|---|---|
| JS 힙 | 23.68 MB | **14.32 MB** | **−40%** |
| DOM 노드 | 7,462 | **1,902** | **−75%** |

### 1.4 구현 세부 — 무엇이 이 수치를 만들었나 (`NaverMap.tsx` 실측 주석)

| 기법 | 내용 | 측정 근거 |
|---|---|---|
| 커스텀 OverlayView | 기본 Marker의 `left/top` 대신 `translate3d` 포지셔닝 — 팬/줌에 리플로우 없음 | 구조적 개선 |
| 뷰포트 컬링 | `CULL_MARGIN 0.2` 패딩 범위 안만 렌더, 선택 항목은 항상 유지, `idle` 이벤트에서 재계산 | 1.3의 표 전체 |
| 마커 풀링 | `setMap(null)` 대신 `hide()` 후 풀 반납(최대 200) | 제거 1회 1.66 ms × 142회 = **236 ms 멈춤** 회피 |
| 2단계 셰이프 디핑 | ① 객체 참조+z 동일 → 스킵 ② HTML 문자열 값 비교 | 동기화 64.6 → 30.8 ms, `draw()` 474 → **7회** |
| 선택적 레이어 승격 | `will-change: transform`은 내 위치 마커 1개만 | 337개 전부 승격은 **순손실**로 측정 |
| 레이아웃 안정화 | `autoResize()` + 220 ms 이중 재중심 + `ResizeObserver` | 사이드바 접힘 시 핀 **360 px** 밀림 해결 |

측정 도구는 직접 만들었습니다 — `?perf=1`로 켜지는 `MapPerfPanel` + `lib/map-perf.ts`(마커 수·DOM 노드·JS 힙·동기화 ms·draw 횟수 실시간 표시, 컬링 ON/OFF 4초 셰이크 비교로 FPS·블로킹 ms 산출).

### 1.5 미디어 최적화 (커뮤니티 글 이미지·영상 다량 이슈 → `PostMedia.tsx`)

- **이미지**: 원본에 치수가 없어 `loading="lazy"` 단독으론 실패(크기 없는 `<img>`가 2×2로 붕괴 → Chrome lazy 휴리스틱 오작동, 실측). 로드 완료까지 16/10 비율 플레이스홀더를 유지해 해결. 캐시 히트로 하이드레이션 전에 로드가 끝나는 경우는 마운트 `useEffect`로 수습.
- **영상**: `<video>`엔 lazy 속성이 없어 `IntersectionObserver`(rootMargin 400px)로 뷰포트 근접 시에만 `<video preload="metadata">` 장착 — 메타데이터만도 파일당 수백 KB.
- **유튜브**: `<iframe loading="lazy">`.

### 1.6 리액트 렌더 전략

- `ArcadeList` · `ArcadeDetailPanel`은 `memo` — 부모(`ArcadeFinder`)가 키 입력·GPS 틱마다 리렌더되므로. 전제 조건으로 부모의 콜백 11종을 `useCallback`, 파생 목록을 `useMemo`로 고정.
- 순위·거리 재계산은 클라이언트 전용(`lib/recommend.ts`는 DB·fetch 없는 순수 모듈) — GPS 틱마다 네트워크 왕복 없이 재정렬.
- 재페치는 기준점이 **0.3 km** 이상 이동했을 때만, 반경 +0.5 km 마진으로 받아 클라이언트가 재절단.
- `RichTextEditor` 툴바는 `useEditorState` selector로 선택 상태 조각이 바뀔 때만 리렌더(키 입력마다가 아니라).
- 참조 데이터(`/api/machines` 등)는 서버 5분 TTL 캐시 — [부하·성능 리포트](LOAD-TEST-REPORT.md) 참조.

### 1.7 남은 성능 항목

- 커뮤니티·서열표 탭 초기 로딩(데이터 페치 시간)은 서버 캐싱으로 일부 개선됐으나 화면 단 스켈레톤·프리페치는 미적용.
- `/api/arcades`가 전체 목록(942행, 307KB)을 한 번에 반환 — 프런트가 `fullListRef`로 재사용하는 설계라 첫 로드 1회뿐이지만, 데이터가 늘면 재검토 대상.

---

## Part 2. 접근성

코드베이스 전수 조사(28개 컴포넌트) 기준. 자동화 도구(axe 등) 실행 결과가 아니라 **정적 코드 검토** 결과입니다.

### 2.1 잘 되어 있는 것

| 위치 | 내용 |
|---|---|
| `Pagination` | `<nav aria-label="페이지">`, 화살표 버튼 4종 `aria-label`, 경계 `disabled`, 현재 페이지 `aria-current="page"` — 코드베이스 최고 수준 |
| `SidebarHandle` | `aria-label` + `aria-expanded` + `aria-controls` + `title`, 장식 SVG `aria-hidden` |
| `LocateButton` | 3상태별 `aria-label` + `aria-pressed`, SVG `aria-hidden` |
| `StarRating` | 표시 모드 래퍼 `aria-label`, 입력 모드 버튼별 `aria-label="N점"` |
| 인증 폼 전반 | `<label>` 래핑, `autoComplete` 올바름(username/current-password/new-password), Enter 제출 |
| `PostForm` | `htmlFor`/`id` 연결이 가장 충실한 폼 |
| `RichText` | 시맨틱 HTML 출력(h2~h4로 아웃라인 보존, 실제 ul/ol/table/blockquote), 유튜브 iframe `title` |
| `PostMedia` | `alt` 존재, `<video controls>` 네이티브 키보드 |
| 랜드마크 | `<nav>`/`<aside>`/`<main>`/`<article>`/`<header>` + h1→h2→h3 계층이 화면 전반에서 유지 |
| `FallbackMap` | 마커가 실제 `<button>` — 키보드로 지도 조작 가능 |
| XSS 방어층 | 리치 본문이 JSON 저장 + 닫힌 집합 렌더로 `dangerouslySetInnerHTML` 0회, `safeHref`로 `javascript:` 차단 — 보안이자 보조기술 신뢰성 기반 |

### 2.2 격차 — 우선순위순

**P1. 클릭 가능한 행이 마우스 전용** — `ArcadeList`·`PostList`의 행이 `<li onClick>`으로만 동작(role/tabIndex/키 핸들러 없음). 목록은 앱의 핵심 탐색 수단이고, 특히 `ArcadeList`는 접근 불가능한 지도의 대체물이므로 영향이 가장 큼.
→ 행 내부에 `<button>` 또는 `<a>`를 두고 행 전체를 레이블로 확장하는 패턴 권장.

**P2. 동적 피드백에 라이브 리전 부재** — 제보 결과(`ArcadeDetailPanel`의 notice/error), 챗봇 새 메시지(`.chat-body`), LiveFeed 30초 자동 교체, 폼 오류 문단 전반이 `aria-live` 없이 갱신됨. 시각 외 사용자는 상태 변화를 알 수 없음.
→ 오류/완료 문구에 `role="status"`(정중) 또는 `role="alert"`(오류), 챗봇 메시지 영역에 `aria-live="polite"`.

**P3. 챗봇 dialog가 모달 계약 미이행** — `role="dialog"`인데 포커스 트랩·Escape 닫기·`aria-modal`·닫을 때 FAB로 포커스 복귀가 없음.

**P4. 토글 상태의 프로그래밍적 표현 누락** — 기종 필터 칩(ArcadeFinder), 종류 세그먼트(LiveFeed), 모드 세그먼트(TierBoardView), 태그 칩(ChartComments), 에디터 서식 버튼(RichTextEditor), 추천 버튼(PostDetailView)이 CSS `is-on`만으로 상태 표시. 같은 코드베이스의 `aria-pressed` 선례(즐겨찾기 별, 인기글 정렬, 컨디션 버튼)를 확장하면 됨.

**P5. 레이블 없는 컨트롤** — 파인더 검색 인풋, LiveFeed `<select>` 2종, 리뷰/댓글/평가 `<textarea>`, 제보 메모 인풋, 위도/경도 인풋이 placeholder 의존. `aria-label` 부여로 해결 가능.

**P6. 의미가 title 툴팁에만 실림** — `LiveBadge`의 집계 설명, TierBoardView 클리어 마크(빈 `<i title>`), 에디터 아이콘 버튼. 터치·스크린리더에 전달되지 않음.

**P7. 기타** — 내비 활성 링크 `aria-current` 없음, 게임 탭 `tablist` 시맨틱 없음, ChartDetailPanel 슬라이더 `aria-valuetext` 없음(현재값·등급명이 인접 마크업에만), 히스토그램 텍스트 대체 없음(막대 아래 숫자가 완화), `window.confirm/alert` 다용(네이티브라 접근은 되지만 맥락 유실).

**구조적 한계** — `NaverMap` 마커는 `innerHTML` 주입 `<div>`라 보조기술로 접근 불가. 현실적 대응은 지도의 정보를 목록이 100% 대체하도록 유지하는 것(현재 설계 방향과 일치)이며, 따라서 P1(목록 키보드화)이 지도 접근성의 실질 해법.

### 2.3 요약

시맨틱 구조·폼 레이블링·페이지네이션 등 **뼈대는 평균 이상**이고, XSS 방어를 겸하는 렌더 파이프라인 덕에 출력 신뢰성이 높습니다. 격차는 대부분 **상호작용 계층**(키보드 경로, 상태 알림, 토글 상태 노출)에 몰려 있고, 코드베이스 안에 이미 올바른 선례가 있어 패턴 복제로 해결 가능한 수준입니다. 우선순위는 P1(목록 키보드화) → P2(라이브 리전) 순을 권합니다.
