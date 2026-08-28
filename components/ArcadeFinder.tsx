'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchOutcome } from '@/lib/chat-types';
import { distanceKm, formatDistance, inBox, type LatLngBox } from '@/lib/geo';
import {
  DEFAULT_WEIGHTS,
  SIDEBAR_MAX_ITEMS,
  SIDEBAR_PAGE_SIZE,
  favoritesFirst,
  isCompleteOrder,
  pageOfArcade,
  pageSlice,
  rankArcades,
  rankReason,
  selectedFirst,
  sortForList,
  weightsFromOrder,
  type ListSort,
  type PriorityOrder,
  type ScoredArcade,
} from '@/lib/recommend';
import { extractConstraints, type ChatConstraints } from '@/lib/query-constraints';
import { isCityQuery, isPlaceQuery, type Place } from '@/lib/place-search';
import type { Arcade, Machine } from '@/lib/types';
import { useFavorites } from '@/lib/use-favorites';
import { useIsAdmin } from '@/lib/use-session';
import { useLiveLocation } from '@/lib/use-live-location';
import { usePriorityOrder } from '@/lib/use-priority';
import { useSidebarOpen } from '@/lib/use-sidebar';
import MapPane, { type Coord } from './MapPane';
import ArcadeList from './ArcadeList';
import Pagination from './Pagination';
import ArcadeForm from './ArcadeForm';
import ArcadeDetailPanel from './ArcadeDetailPanel';
import ChatBot from './ChatBot';
import LocateButton from './LocateButton';
import SidebarHandle from './SidebarHandle';
import { useIsMapFolded, useIsStacked } from '@/lib/use-stacked';

// 계측 패널은 `/?perf=1` 에서만 쓰는 개발용이라 주 번들에서 떼어 둔다.
const MapPerfPanel = dynamic(() => import('./MapPerfPanel'), { ssr: false });

const RADIUS_OPTIONS = [1, 3, 5, 10, 30];

/**
 * "반경 전체" — 기준점은 있지만 반경으로 자르지 않는 상태.
 *
 * 지역 검색으로 이동한 직후의 기본값입니다. 이동하자마자 5km 로 잘라 버리면
 * "그 동네에 뭐가 있나" 를 보러 온 사람이 원 밖을 볼 수 없습니다 — 목록은
 * 어차피 지도 화면으로 좁혀지므로(inViewport) 반경 없이도 주변만 보입니다.
 * 좁히고 싶을 때만 위의 옵션에서 고릅니다.
 */
const RADIUS_NONE = 0;

/** 반경 전체일 때 추천 점수의 거리 눈금(km). 반경이 없다고 거리 감각까지
 *  버릴 수는 없어서, 예전 기본값(5km)을 눈금으로만 남깁니다. */
const SCORE_RADIUS_FALLBACK_KM = 5;

/**
 * 지점명 검색으로 이동할 때의 줌 — 건물 하나가 또렷한 수준 (네이버 줌
 * 슬라이더의 '부동산' 부근). 지역 이동(줌 14, 역 주변 몇 블록)과 다르게
 * 두는 이유: 지점 하나를 찾아온 사람에게 필요한 건 그 건물이고, 동네를
 * 훑으러 온 사람에게 필요한 건 동네 전체다.
 */
const SPOT_ZOOM = 18;

/**
 * 기준점이 이만큼 움직였을 때만 목록을 다시 받아옵니다 (km).
 *
 * GPS 는 걸어가는 동안 몇 초에 한 번씩 좌표를 줍니다. 그때마다 조회하면
 * 1분에 수십 번 요청이 나가는데, 정작 15m 옆으로 옮겨서 새로 들어올 오락실은
 * 거의 없습니다. 순위·거리는 좌표가 올 때마다 클라이언트에서 다시 계산하므로
 * (lib/recommend.ts) 화면은 조회 없이도 매번 최신입니다.
 */
const REFETCH_MOVE_KM = 0.3;

/**
 * 조회 반경에 더해 두는 여유(km). REFETCH_MOVE_KM 보다 커야 합니다.
 *
 * 조회는 마지막 기준점(anchor) 기준인데 내 위치는 그 뒤로 최대
 * REFETCH_MOVE_KM 만큼 더 움직여 있을 수 있습니다. 여유 없이 딱 맞춰
 * 조회하면 내 쪽으로 걸어가는 동안 반경 안에 들어온 오락실이 다음 조회
 * 전까지 목록에 안 뜹니다. 넓게 받아 두고 화면에서 실제 거리로 자릅니다.
 */
const FETCH_MARGIN_KM = 0.5;

/** 지도 마커에 순위 뱃지를 다는 상위 N — 그 아래는 뱃지가 서로 구분이 안 됩니다 */
const MAP_RANK_TOP = 3;

/**
 * 마지막으로 선택한 오락실을 탭 이동 사이에 남겨 두는 자리.
 *
 * 상단 탭(커뮤니티·서열표…)은 페이지 이동이라 이 컴포넌트가 통째로 내려갑니다.
 * state 만으로는 돌아왔을 때 선택이 사라지므로 sessionStorage 에 적어 둡니다 —
 * localStorage 가 아닌 이유: 선택은 "지금 보던 것" 이지 설정이 아니라서,
 * 내일 다시 켰을 때까지 따라오면 오히려 이상합니다.
 */
const SELECTED_STORE_KEY = 'arcade-finder:selected';

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; arcade: Arcade };

/**
 * 조회는 여유를 더해 넓게 받아 오므로 화면에서 실제 반경으로 자릅니다.
 * 목록과 탐색 요약이 같은 함수를 써야 "12곳 찾았다" 와 목록 개수가 맞습니다.
 */
function withinRadius(
  scored: ScoredArcade[],
  origin: Coord | null,
  radiusKm: number,
): ScoredArcade[] {
  // RADIUS_NONE(0) 은 "기준점은 있지만 자르지는 않는다" 다.
  if (!origin || radiusKm <= 0) return scored;
  return scored.filter((s) => s.distanceKm === null || s.distanceKm <= radiusKm);
}

export default function ArcadeFinder() {
  const searchParams = useSearchParams();
  // 실시간 피드에서 /?arcade=3 으로 넘어오면 그 오락실을 열어 둔 채로 시작한다.
  const initialArcadeId = Number(searchParams.get('arcade')) || null;
  /** `/?perf=1` — 지도 성능 계측 패널. 개발용이라 주소로만 켜진다 */
  const showPerf = searchParams.get('perf') === '1';

  /**
   * 오락실 레코드(이름·주소·좌표·보유 기종)를 고치는 건 관리자만이다.
   * 여기서 감추는 건 어디까지나 화면이고, 진짜 차단은 API 쪽이다
   * (app/api/arcades/… requireAdmin). 로그인 없이 fetch 를 직접 쏘면 401 이다.
   */
  const isAdmin = useIsAdmin();

  /**
   * 즐겨찾기. 로그인해야 담을 수 있고(canFavorite), 담긴 목록이 바뀌면
   * version 이 올라간다 — 첫 화면 목록을 다시 받아야 하는 신호다.
   */
  const favorites = useFavorites();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [arcades, setArcades] = useState<Arcade[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * 지도가 **지금 그리고 있는** 범위 (화면 + 마커 여백). 사이드바 목록이 이걸로
   * 좁혀진다 — 목록과 지도가 같은 집합이어야 "여기 근처" 라는 말이 성립한다.
   * null 이면 아직 지도가 준비되지 않은 상태다.
   */
  const [mapViewport, setMapViewport] = useState<LatLngBox | null>(null);

  // 필터
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [radiusKm, setRadiusKm] = useState<number>(5);

  // ── 기준점 ────────────────────────────────────────────────
  // 두 갈래다. GPS 추적 중이면 실시간 좌표가, 아니면 마지막으로 붙잡아 둔
  // 좌표가 기준점이다. 추적을 끄면 그 자리에 그대로 서 있는 셈이 된다.
  const live = useLiveLocation();
  const [follow, setFollow] = useState(false);
  const [fixedCenter, setFixedCenter] = useState<Coord | null>(null);
  const origin: Coord | null = follow && live.coord ? live.coord : fixedCenter;

  /**
   * 서버에 보낸 기준점. origin 이 REFETCH_MOVE_KM 이상 움직였을 때만 갱신되고,
   * 그 갱신이 목록 재조회를 부른다. origin 을 그대로 쓰면 GPS 가 올 때마다
   * 조회가 나간다.
   */
  const [anchor, setAnchor] = useState<Coord | null>(null);
  useEffect(() => {
    if (!origin) {
      setAnchor(null);
      return;
    }
    setAnchor((prev) =>
      prev && distanceKm(prev, origin) < REFETCH_MOVE_KM ? prev : origin,
    );
  }, [origin]);

  // ── 우선순위 ───────────────────────────────────────────────
  // 1·2·3순위는 챗봇에서 고른다. 여기서는 마지막 선택을 들고 있다가 점수로
  // 옮길 뿐이고, 그 점수(5·3·2)는 화면 어디에도 나가지 않는다.
  const { order, setOrder } = usePriorityOrder();
  const weights = useMemo(
    () => (isCompleteOrder(order) ? weightsFromOrder(order) : DEFAULT_WEIGHTS),
    [order],
  );

  // 추천순은 챗봇이 탐색을 마쳤을 때 켜진다. 처음부터 켜 두면 아무도 순서를
  // 정하지 않았는데 "1위" 라고 주장하는 화면이 된다.
  const [sort, setSort] = useState<ListSort>('distance');

  /** 사이드바 목록의 현재 페이지 (1-based) */
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<number | null>(initialArcadeId);
  /** 세로 스택(모바일) 레이아웃인지 — 목록·지도·상세가 위아래로 쌓인 상태 */
  const stacked = useIsStacked();
  /** 상세를 열면 지도가 접히는 폭인지 (≤1180px — 3열이 들어가지 않는다) */
  const mapFolded = useIsMapFolded();
  /**
   * '위치' 버튼을 누른 횟수. 지도에 내려보내 "선택한 곳으로 다시 옮겨라" 를
   * 말한다 (MapPane 의 focusNonce 주석 참고).
   */
  const [focusNonce, setFocusNonce] = useState(0);
  /**
   * 상세 패널이 **열려 있는지**. 선택(selectedId)과 별개다 — 상세를 닫아도
   * 목록의 하이라이트와 지도 핀 선택은 남는다. "닫기" 는 패널을 치우는 것이지
   * 방금 보던 곳을 잊는 것이 아니다.
   */
  const [detailOpen, setDetailOpen] = useState(initialArcadeId !== null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  // 다른 탭에 다녀와도 선택이 남는다. URL 딥링크(?arcade=3)가 있으면 그쪽이 우선.
  // sessionStorage 는 서버에 없으므로 첫 렌더가 아니라 마운트 후에 읽는다
  // (초기값으로 읽으면 SSR 결과와 어긋나 hydration 이 깨진다).
  useEffect(() => {
    if (initialArcadeId !== null) return;
    try {
      const raw = sessionStorage.getItem(SELECTED_STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { id?: unknown; open?: unknown };
      if (typeof saved.id === 'number' && Number.isInteger(saved.id)) {
        setSelectedId(saved.id);
        setDetailOpen(saved.open === true);
      }
    } catch {
      // 저장값이 깨져 있으면 없는 셈 친다
    }
    // 마운트 시 1회 — initialArcadeId 는 이 페이지 수명 동안 바뀌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (selectedId === null) sessionStorage.removeItem(SELECTED_STORE_KEY);
      else
        sessionStorage.setItem(
          SELECTED_STORE_KEY,
          JSON.stringify({ id: selectedId, open: detailOpen }),
        );
    } catch {
      // 시크릿 모드 등에서 저장이 막혀도 화면 동작에는 지장이 없다
    }
  }, [selectedId, detailOpen]);

  // 목록을 접었는지. 접으면 지도가 화면을 다 쓴다 (CSS: .layout.sidebar-off)
  const { open: sidebarOpen, toggle: toggleSidebar, setOpen: setSidebarOpen } = useSidebarOpen();
  const [picking, setPicking] = useState(false);
  const [pickedCoord, setPickedCoord] = useState<Coord | null>(null);

  // ── 기종 마스터 (1회) ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/machines')
      .then((r) => r.json())
      .then((d) => setMachines(d.machines as Machine[]))
      .catch(() => setMachines([]));
  }, []);

  // ── 검색어 디바운스 ────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /**
   * 필터 없이 받아 온 전체 목록 — **챗봇 문장의 오락실 언급을 알아볼 사전**.
   *
   * arcades state 는 기준점·기종으로 좁혀진 부분 목록이라, 반경 밖의 오락실을
   * 문장에 적으면 못 알아봅니다. 첫 화면 조회(필터 없음)가 전체를 주므로 그때
   * 붙잡아 둡니다. 화면 목록이 아니라 이름 대조에만 쓰므로 갱신도 필요 없습니다.
   */
  const fullListRef = useRef<Arcade[] | null>(null);

  // ── 목록 조회 ──────────────────────────────────────────────
  const reqSeq = useRef(0);
  const fetchArcades = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);

    const params = new URLSearchParams();
    const searching = debouncedQ.trim() !== '';
    if (searching) params.set('q', debouncedQ.trim());
    if (machineIds.length) params.set('machines', machineIds.join(','));
    // 검색어가 있으면 반경을 보내지 않는다 — 이름·주소 검색은 **전국**이다.
    // 반경으로 자르면 "화면 밖에 있는 그 오락실" 을 찾으려는 검색이 항상
    // 빈손이 된다. 지역을 좁히고 싶으면 검색어를 지우면 반경이 돌아온다.
    if (anchor && !searching) {
      params.set('lat', String(anchor.lat));
      params.set('lng', String(anchor.lng));
      // 반경 전체(RADIUS_NONE)면 좌표만 보낸다 — 서버는 거리만 계산해 가까운
      // 순으로 주고, 자르지 않는다. 첫 화면(필터 없음)과 같은 크기의 응답이다.
      if (radiusKm > 0) params.set('radius', String(radiusKm + FETCH_MARGIN_KM));
    }

    try {
      const res = await fetch(`/api/arcades?${params}`);
      const data = await res.json();
      // 늦게 도착한 이전 요청이 최신 결과를 덮어쓰지 않도록.
      if (seq === reqSeq.current) {
        setArcades(data.arcades as Arcade[]);
        if (!debouncedQ.trim() && !machineIds.length && !anchor) {
          fullListRef.current = data.arcades as Arcade[];
        }
      }
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [debouncedQ, machineIds, anchor, radiusKm]);

  useEffect(() => {
    void fetchArcades();
  }, [fetchArcades]);

  /**
   * 챗봇 탐색에서 뺀 오락실 ("짱오락실에 대기가 많은데…" 의 그곳).
   *
   * 순위만이 아니라 지도·목록에서도 뺀다 — 지도와 목록은 같은 집합이어야
   * 하고, "제외했다" 고 말해 놓고 핀은 그대로면 말과 화면이 어긋난다.
   * 사용자가 검색창에 직접 입력하면 푼다: 그 오락실을 이름으로 찾는 순간
   * "안 보이는 이유" 가 함정이 된다.
   */
  const [excludedId, setExcludedId] = useState<number | null>(null);
  useEffect(() => {
    if (debouncedQ.trim()) setExcludedId(null);
  }, [debouncedQ]);

  // ── 순위 ───────────────────────────────────────────────────
  // 조회 결과가 아니라 **지금 좌표** 기준으로 매긴다. 걸어가는 동안 조회는
  // 띄엄띄엄이지만 순위와 거리는 좌표가 올 때마다 다시 선다.
  // 반경 전체(0)일 때도 추천 점수는 거리 눈금이 필요하다 (scoreDistance 의
  // 정규화 기준) — 자르는 값과 눈금을 분리해 눈금만 남긴다.
  const scoreRadiusKm = radiusKm > 0 ? radiusKm : SCORE_RADIUS_FALLBACK_KM;

  const ranked = useMemo(
    () =>
      rankArcades({
        arcades: excludedId === null ? arcades : arcades.filter((a) => a.id !== excludedId),
        origin,
        machineIds,
        weights,
        radiusKm: scoreRadiusKm,
      }),
    [arcades, excludedId, origin, machineIds, weights, scoreRadiusKm],
  );

  /** 이름·주소 검색 중인지 — 켜져 있는 동안 반경·화면 컷을 둘 다 우회한다 */
  const searching = debouncedQ.trim() !== '';

  /**
   * 반경 안에 있는 전부. 지도가 그리는 대상이고, 개수 표시의 분모다.
   * (조회는 여유를 더해 넓게 받아 오므로 여기서 실제 반경으로 자른다)
   *
   * 검색 중에는 자르지 않는다 — 조회 자체가 전국으로 나갔는데(fetchArcades)
   * 여기서 반경으로 자르면 서버가 준 결과를 화면이 도로 버리는 셈이다.
   */
  const inRadius = useMemo(
    () => (searching ? ranked : withinRadius(ranked, origin, radiusKm)),
    [ranked, origin, radiusKm, searching],
  );

  /**
   * 지도에 지금 그려져 있는 것들 — 사이드바 목록의 재료.
   *
   * 지도가 알려 준 범위(화면 + 마커 여백)로 좁힌다. 지도와 **같은 판정**을
   * 써야(MapPane onViewportChange) "지도에는 있는데 목록에는 없는" 줄이 안 생긴다.
   *
   * 아직 범위를 못 받았으면 **걸러내지 않는다**. 빈 목록으로 두면, 지도 SDK 가
   * 못 뜨는 경우(키가 틀렸거나 네트워크가 막힌 경우 — NaverMap 의 에러 화면)
   * 사이드바가 영영 비어 있고 그 이유가 어디에도 없다. 목록은 어차피 30곳으로
   * 잘리므로, 지도가 범위를 알려 주는 순간 제자리를 찾는다.
   */
  const inViewport = useMemo(
    () =>
      mapViewport && !searching
        ? // 선택한 곳은 화면 밖이어도 남긴다 — 지도도 그 핀만은 늘 그린다
          // (NaverMap 의 inView). 목록에서 사라지면 지금 열어 둔 상세가 어느
          // 줄인지 짚을 수 없다.
          //
          // 검색 중에는 아예 거르지 않는다 — 검색의 요점이 "화면 밖이라도
          // 찾는다" 인데 화면으로 거르면 요점이 사라진다. 줄을 누르면 지도가
          // 그리로 간다 (handleListSelect → 센터링).
          inRadius.filter((s) => s.arcade.id === selectedId || inBox(mapViewport, s.arcade))
        : inRadius,
    [inRadius, mapViewport, selectedId, searching],
  );

  /**
   * 무슨 순서로 늘어놓을지.
   *
   * 챗봇이 1·2·3순위로 탐색을 마쳤으면 그 순서가 우선이다 — 사용자가 방금 고른
   * 순서를 다른 기준으로 덮으면 그 결과가 화면에서 사라진다. 기준점이 있으면
   * 가까운 순. 둘 다 아니면 평점 높은 순이다 (거리를 모르는데 '가까운 순' 은
   * 성립하지 않고, 이름순은 첫 글자가 순위인 척하는 목록이 된다).
   */
  const listSort: ListSort = sort === 'score' ? 'score' : origin ? 'distance' : 'rating';

  /**
   * 사이드바 목록 — 화면 안 → 정렬 → 즐겨찾기 → **선택한 곳** → 앞의 30곳까지.
   *
   * 맨 위 두 자리를 정렬보다 앞세우는 이유: 목록이 화면 안으로 좁혀지고 페이지로
   * 잘리므로, 담아 둔 곳이나 방금 누른 곳이 3페이지에 있으면 사실상 없는 것과
   * 같다. 그중에서도 **선택한 곳이 즐겨찾기보다 위**다 — 지금 상세에 열려 있는
   * 그 한 곳이라 목록에서 바로 짚여야 한다.
   *
   * ⚠ 모바일(세로 스택)에서는 선택한 곳을 끌어올리지 **않는다**. 폰에서 선택은
   * 목록 줄을 손가락으로 누른 것인데, 누른 줄이 그 순간 1번으로 튀면 방금
   * 보던 자리가 사라져 훑어보던 흐름이 끊긴다 (데스크톱은 선택이 지도 핀에서도
   * 오므로 목록에서 짚어 주는 값이 있다).
   *
   * 30곳으로 자르는 건 뒤쪽 페이지를 아무도 넘겨 보지 않기 때문이다. 잘랐다는
   * 사실은 머리글의 분모와 목록 끝의 안내가 말한다.
   */
  const ordered = useMemo(() => {
    const base = favoritesFirst(sortForList(inViewport, listSort), favorites.ids);
    return (stacked ? base : selectedFirst(base, selectedId)).slice(0, SIDEBAR_MAX_ITEMS);
  }, [inViewport, listSort, favorites.ids, selectedId, stacked]);

  /**
   * 사이드바에 실제로 그리는 줄들.
   *
   * useMemo 인 이유: 이 배열이 렌더마다 새 참조면 memo(ArcadeList) 가 무력해진다.
   * 검색어 타이핑·상세 패널 갱신처럼 목록과 무관한 렌더에서 8줄(뱃지·별점 포함)을
   * 통째로 다시 그리는 것이 사이드바 렉의 큰 몫이었다.
   */
  const listed = useMemo(() => pageSlice(ordered, page, SIDEBAR_PAGE_SIZE), [ordered, page]);

  // 조건이 바뀌면 1페이지로. 검색어를 고쳐 놓고 3페이지에 남아 있으면 결과가
  // 없는 것처럼 보인다. (지도를 옮기는 것은 여기 넣지 않는다 — 조금 끌 때마다
  //  1페이지로 튀면 목록을 훑을 수 없다. 넘친 페이지는 아래에서 당겨 준다)
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, machineIds, radiusKm, anchor, sort]);

  // 결과가 줄어 페이지 수가 지금 페이지보다 적어지면 마지막 페이지로 당긴다.
  // (반경 안 목록은 GPS 가 움직이는 동안에도 줄어든다 — 페이지네이션이 사라진
  //  채로 page 가 3에 남아 있으면, 다시 늘어나는 순간 3페이지로 뛴다)
  useEffect(() => {
    const last = Math.max(1, Math.ceil(ordered.length / SIDEBAR_PAGE_SIZE));
    if (page > last) setPage(last);
  }, [ordered.length, page]);

  /**
   * 선택한 줄이 있는 페이지로 넘어간다.
   *
   * 선택한 곳은 목록 맨 위(1페이지)로 올라오지만(위 ordered), 3페이지를 보던
   * 중에 지도 핀을 누르면 그 줄은 1페이지에 있고 화면은 3페이지에 남는다.
   * 그러면 방금 누른 곳이 목록에서 사라진 것처럼 보인다.
   *
   * 한 선택에 한 번만 넘긴다 — ordered 는 GPS 좌표가 올 때마다 새 배열이라,
   * 그때마다 넘기면 상세를 열어 둔 채로는 페이지를 넘길 수 없다.
   */
  const jumpedFor = useRef<number | null>(null);

  /** 목록이 시작되는 지점. 페이지를 넘길 때 사이드바를 여기로 올린다 */
  const listTopRef = useRef<HTMLDivElement>(null);

  /**
   * 페이지 버튼으로 이동 — 목록 첫 줄이 사이드바 맨 위로 오게 스크롤합니다
   * (CommunityView 의 changePage 와 같은 이유 — 버튼이 목록 아래에 있어서
   * 그냥 두면 다음 페이지도 바닥부터 보입니다).
   *
   * 다른 setPage 경로에는 걸지 않습니다: 필터 변경·페이지 수 줄어듦은 사용자가
   * 목록 위쪽을 보고 있고, 지도 핀 선택(jumpedFor)은 선택한 줄이 보여야지
   * 목록 맨 위가 보여야 하는 게 아닙니다.
   */
  const changePage = (next: number) => {
    setPage(next);
    listTopRef.current?.scrollIntoView({ block: 'start' });
  };
  useEffect(() => {
    if (selectedId === null) {
      jumpedFor.current = null;
      return;
    }
    if (jumpedFor.current === selectedId) return;
    const at = pageOfArcade(ordered, selectedId, SIDEBAR_PAGE_SIZE);
    if (at !== null) {
      jumpedFor.current = selectedId;
      setPage(at);
    }
  }, [selectedId, ordered]);

  /**
   * 지도는 반경 안의 **전부**를 그린다.
   *
   * 목록과 다른 집합을 쓰는 유일한 지점이다. 목록이 8곳으로 잘리는 건 "이만큼만
   * 보여 주겠다" 는 화면 사정이고, 반경 밖으로 나간 곳을 걸러내는 것과는 다른
   * 이야기다. 지도까지 8개로 줄이면 주변을 훑는 기능이 사라진다.
   */
  const visibleArcades = useMemo(() => inRadius.map((s) => s.arcade), [inRadius]);

  /**
   * 지도 마커에 붙일 순위. 추천순일 때만, 상위 몇 곳만.
   * 지도가 그리는 집합(inRadius)에서 뽑는다 — 목록의 8곳에서 뽑으면 지도에
   * 보이는 더 높은 순위의 핀에 뱃지가 없는 상태가 된다.
   */
  const rankById = useMemo(() => {
    if (sort !== 'score') return null;
    const map = new Map<number, number>();
    for (const s of inRadius) {
      if (s.rank <= MAP_RANK_TOP) map.set(s.arcade.id, s.rank);
    }
    return map;
  }, [inRadius, sort]);

  // ── 챗봇이 부르는 탐색 ─────────────────────────────────────
  /**
   * 1·2·3순위를 받아 그 자리에서 순위를 매기고, 지도·목록을 그 결과로 바꾼
   * 뒤 **말로 할 요약**을 돌려준다.
   *
   * 여기서 rankArcades 를 다시 부르는 이유: setOrder 는 다음 렌더에서야
   * 반영되므로, 위의 `ranked` 는 아직 옛 가중치로 만든 값이다. 챗봇이 방금
   * 고른 순서로 답하려면 지금 계산한 값이어야 한다.
   */
  const runSearch = useCallback(
    (next: PriorityOrder, constraints: ChatConstraints | null): SearchOutcome => {
      setOrder(next);
      setSort('score');

      // 문장에 언급된 오락실 = 사용자가 지금 있는 곳. 기준점으로 삼고
      // 결과에서는 뺀다 — "여기 대기가 많은데 가까운 데" 의 답에 여기가
      // 나오면(거리 0으로 1위가 된다) 질문을 안 읽은 답이 된다.
      const pivot = constraints?.arcade ?? null;
      const searchOrigin: Coord | null = pivot ? { lat: pivot.lat, lng: pivot.lng } : origin;
      if (pivot) {
        // 기존 기준점 기계를 그대로 탄다 — GPS 추적을 끄고 그 좌표에 서
        // 있는 셈으로 만들면, 재조회·거리 계산·지도 이동이 전부 따라온다.
        setFollow(false);
        setFixedCenter({ lat: pivot.lat, lng: pivot.lng });
        // 이전 검색어는 이전 장소의 것이다. 남겨 두면 새 기준점 주변을
        // 옛 검색어로 거른 목록이 된다.
        setQ('');
      }
      setExcludedId(pivot ? pivot.id : null);

      // 문장에 기종이 있으면 그쪽이 이번 탐색의 필터다. 사이드바 칩도 맞춰
      // 바꾼다 — 목록·지도가 곧 그 필터로 다시 조회되므로 화면과 말이 같아진다.
      const searchMachineIds = constraints?.machineIds.length
        ? constraints.machineIds
        : machineIds;
      if (constraints?.machineIds.length) setMachineIds(constraints.machineIds);

      // 재조회는 다음 렌더에나 나가므로 이 스냅샷은 손에 있는 목록으로 만든다.
      // 기종 필터는 여기서 직접 건다 — arcades 는 아직 옛 필터의 결과다.
      const pool = arcades.filter(
        (a) =>
          (pivot === null || a.id !== pivot.id) &&
          (searchMachineIds.length === 0 ||
            a.machines.some((m) => searchMachineIds.includes(m.id))),
      );

      const scored = withinRadius(
        rankArcades({
          arcades: pool,
          origin: searchOrigin,
          machineIds: searchMachineIds,
          weights: weightsFromOrder(next),
          radiusKm: scoreRadiusKm,
        }),
        searchOrigin,
        radiusKm,
      );

      // 1위를 선택만 한다 — 지도는 그 자리로 움직이고 목록에도 표시되지만,
      // 상세 패널은 띄우지 않는다. 챗봇 답변과 상세가 겹치면 채팅을 가리고,
      // 순위는 이미 말풍선에 적혀 있다. 보던 상세가 있었어도 새 1위의 상세로
      // 바꿔치기하지 않도록 닫는다.
      setSelectedId(scored[0]?.arcade.id ?? null);
      setDetailOpen(false);

      return {
        total: scored.length,
        radiusKm,
        hasOrigin: searchOrigin !== null,
        top: scored.slice(0, 3).map((s) => ({
          name: s.arcade.name,
          score: s.score,
          distanceLabel: s.distanceKm === null ? null : formatDistance(s.distanceKm),
          reason: rankReason(s),
        })),
        machineNames: constraints?.machineIds.length
          ? constraints.machineNames
          : machines.filter((m) => machineIds.includes(m.id)).map((m) => m.shortName),
        excluded: pivot?.name ?? null,
        // 기준점이 뛰면(다른 동네의 오락실을 언급) 손에 든 목록은 옛 기준점
        // 주변뿐이다 — 재조회가 돌아오면 결과가 늘 수 있다고 미리 말한다.
        stale:
          loading ||
          (pivot !== null &&
            (debouncedQ.trim() !== '' ||
              (anchor !== null &&
                distanceKm(anchor, { lat: pivot.lat, lng: pivot.lng }) > REFETCH_MOVE_KM))),
      };
    },
    [arcades, origin, machineIds, radiusKm, scoreRadiusKm, machines, setOrder, loading, anchor, debouncedQ],
  );

  /**
   * 챗봇 트리거 문장에서 제약 추출. 전체 목록(fullListRef)으로 대조한다 —
   * arcades 는 반경으로 좁혀진 부분 목록이라 반경 밖 오락실 언급을 놓친다.
   * 첫 조회가 아직이면 손에 있는 것으로라도 대조한다 (못 찾으면 제약 없는
   * 탐색이 될 뿐, 틀린 탐색이 되지는 않는다).
   */
  const extract = useCallback(
    (text: string) => extractConstraints(text, fullListRef.current ?? arcades, machines),
    [arcades, machines],
  );

  // ── 위치 ───────────────────────────────────────────────────
  const startFollow = () => {
    setFollow(true);
    live.start();
  };

  /** 추적만 끄고 마지막 좌표는 기준점으로 남긴다 */
  const stopFollow = () => {
    setFixedCenter(live.coord ?? fixedCenter);
    setFollow(false);
    live.stop();
  };

  const clearCenter = () => {
    setFollow(false);
    live.stop();
    setFixedCenter(null);
    setPlaceNotice(null);
  };

  // ── 지역 검색으로 지도 이동 ────────────────────────────────
  /** 지역 이동을 지도에 알리는 신호 (MapPane centerNonce 주석) */
  const [centerNonce, setCenterNonce] = useState(0);
  const [placeBusy, setPlaceBusy] = useState(false);
  /** "○○ 주변으로 이동했습니다" 한 줄. 기준점을 해제하면 같이 사라진다 */
  const [placeNotice, setPlaceNotice] = useState<string | null>(null);

  /**
   * 검색어를 지역 이름으로 보고 그 좌표로 기준점을 옮긴다.
   *
   * 버튼(과 Enter)으로만 부른다 — 타이핑마다 부르면 부분 입력("강남ㅇ")으로
   * 지도가 튀고, 지역 검색 API 의 일일 한도도 갉아먹는다 (app/api/places 주석).
   *
   * 성공하면 검색어를 지운다: 지역 이름은 오락실 이름·주소 필터로는 대개
   * 0곳이라, 남겨 두면 방금 이동한 동네가 빈 목록으로 보인다.
   */
  /** 지도 이동 신호 — 지점명 검색(줌 포함)과 '내 위치로 이동'(줌 유지)이 쓴다 */
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    nonce: number;
  } | null>(null);

  /**
   * 검색이 찾아낸 **우리 오락실**로 이동 — 건물이 보이는 수준(SPOT_ZOOM)까지 당긴다.
   *
   * 지역 이동(jumpToPlace)과 같은 기계를 탄다: 기준점을 그 지점으로 옮기고
   * 검색어를 지운다. 검색어를 남겨 두면 목록이 그 한 곳으로 걸러진 채라
   * **주변 오락실이 안 나온다** — 지점을 찾아간 사람이 다음으로 보는 건
   * "여기 말고 근처엔 뭐가 있나" 다. 반경 전체 + 화면(뷰포트) 필터가
   * 거리 줌에서 그 골목 주변 목록을 만들고, 거리순 정렬의 기준도 그 지점이 된다.
   *
   * 지역 이동과 다른 점은 둘: 그 지점을 선택해 두고(핀·목록 하이라이트),
   * 줌을 거리 수준까지 당긴다.
   */
  const jumpToArcade = (arcade: Arcade) => {
    setSelectedId(arcade.id);
    // 좁은 폭에서 상세가 지도를 밀어내면(≤1180px display:none) 이동이 안 보인다.
    setDetailOpen(false);
    setFollow(false);
    live.stop();
    setFixedCenter({ lat: arcade.lat, lng: arcade.lng });
    setRadiusKm(RADIUS_NONE);
    setQ('');
    setPlaceNotice(`'${arcade.name}' 주변을 보는 중 — 필요하면 위에서 반경을 걸 수 있습니다.`);
    setFocusPoint((prev) => ({
      lat: arcade.lat,
      lng: arcade.lng,
      zoom: SPOT_ZOOM,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  /**
   * 상태줄의 '내 위치로 이동' — 추적 중인 좌표로 지도만 되돌린다.
   *
   * 추적 중에는 지도가 좌표를 따라가지만(followCenter), 주변을 보러 지도를
   * 끌고 나가면 다음 좌표가 올 때까지 돌아오지 않는다 — 걸음을 멈추고 서
   * 있으면 영영 안 돌아온다. 그 "지금 당장" 을 말하는 버튼이다.
   * zoom 을 넣지 않는 것이 요점: 보던 축척은 사용자의 것이다.
   */
  const goToMyLocation = () => {
    if (!live.coord) return;
    const { lat, lng } = live.coord;
    setFocusPoint((prev) => ({ lat, lng, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const jumpToPlace = async () => {
    const query = q.trim();
    if (!isPlaceQuery(query) || placeBusy) return;
    setPlaceBusy(true);
    try {
      const res = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { place?: Place | null; error?: string };
      if (!res.ok) {
        setPlaceNotice(data.error ?? '지역 검색에 실패했습니다');
        return;
      }
      if (!data.place) {
        setPlaceNotice(`'${query}' 를 찾지 못했습니다. 지역·역 이름으로 다시 써 보세요.`);
        return;
      }
      // 기존 기준점 기계를 그대로 탄다 (runSearch 의 pivot 과 같은 방식) —
      // 재조회·거리 계산·반경 원이 전부 따라온다.
      setFollow(false);
      live.stop();
      setFixedCenter({ lat: data.place.lat, lng: data.place.lng });
      // 이동 직후는 **반경 전체**가 기본이다 — 그 동네를 보러 왔는데 원으로
      // 잘라 놓으면 지도를 조금만 끌어도 목록이 빈다. 좁히는 건 사용자 몫.
      setRadiusKm(RADIUS_NONE);
      setQ('');
      // 이전에 보던 오락실 선택은 이전 동네의 맥락이다. 남겨 두면 선택 고정
      // 규칙(selectedFirst) 때문에 "가까운 순" 1번에 11km 밖 지점이 앉는다.
      setSelectedId(null);
      setDetailOpen(false);
      setCenterNonce((n) => n + 1);
      setPlaceNotice(`'${data.place.name}' 주변을 보는 중 — 필요하면 위에서 반경을 걸 수 있습니다.`);
    } catch {
      setPlaceNotice('네트워크 오류로 지역을 찾지 못했습니다');
    } finally {
      setPlaceBusy(false);
    }
  };

  const toggleMachineFilter = (id: number) =>
    setMachineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // ── 액션 ───────────────────────────────────────────────────
  // 등록·수정 폼은 사이드바 안에 뜬다. 접어 둔 채로 열면 아무 일도 일어나지
  // 않은 것처럼 보이므로(폼이 접힌 칸 안에 있다) 폼을 열 때는 같이 펼친다.
  const startCreate = () => {
    setMode({ kind: 'create' });
    setPickedCoord(origin ?? null);
    setPicking(true);
    setSidebarOpen(true);
  };

  // useCallback: memo(ArcadeList) 에 그대로 내려가는 참조다.
  const startEdit = useCallback(
    (arcade: Arcade) => {
      setMode({ kind: 'edit', arcade });
      setPickedCoord({ lat: arcade.lat, lng: arcade.lng });
      setPicking(false);
      setSidebarOpen(true);
    },
    [setSidebarOpen],
  );

  const closeForm = useCallback(() => {
    setMode({ kind: 'list' });
    setPicking(false);
    setPickedCoord(null);
  }, []);

  const handleSaved = (arcade: Arcade) => {
    closeForm();
    setSelectedId(arcade.id);
    setDetailOpen(true);
    void fetchArcades();
  };

  // useCallback: memo(ArcadeList) 에 그대로 내려가는 참조다.
  const handleDelete = useCallback(
    async (arcade: Arcade) => {
      if (!confirm(`'${arcade.name}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
      const res = await fetch(`/api/arcades/${arcade.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedId === arcade.id) {
          setSelectedId(null);
          setDetailOpen(false);
        }
        if (mode.kind === 'edit' && mode.arcade.id === arcade.id) closeForm();
        void fetchArcades();
      } else {
        // 401/403 이면 세션이 끊긴 것이다 — "실패했습니다" 만으로는 다시 로그인해야
        // 한다는 걸 알 수 없다.
        const data = await res.json().catch(() => null);
        alert(data?.error ?? '삭제에 실패했습니다');
      }
    },
    [selectedId, mode, fetchArcades, closeForm],
  );

  /**
   * 상세의 '위치' 버튼 — 지도를 이 오락실로 되돌린다.
   *
   * 좁은 폭(≤1180px)에서는 상세를 열면 지도가 접혀 있으므로, 사이드바를 접어
   * 지도를 먼저 드러낸다 — 그러지 않으면 버튼을 눌러도 보이지 않는 지도만
   * 움직인다. 레이아웃이 바뀌며 지도 칸 크기가 달라지는 것은 NaverMap 이
   * autoResize + 전환 후 재센터링으로 이미 처리한다.
   */
  const handleLocate = useCallback(() => {
    if (mapFolded) setSidebarOpen(false);
    setFocusNonce((n) => n + 1);
  }, [mapFolded, setSidebarOpen]);

  const handlePick = useCallback((coord: Coord) => {
    setPickedCoord(coord);
    setPicking(false);
  }, []);

  // 지도 핀: 고르는 행위가 곧 상세를 여는 행위다 — 닫아 둔 상세도
  // 같은 곳을 다시 누르면 도로 열린다.
  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  /**
   * 목록 줄 — 데스크톱에서는 핀과 똑같이 상세를 열지만, 모바일(세로 스택,
   * ≤860px)에서는 **지도 이동까지만** 합니다. 상세는 지도 핀을 눌러야 열립니다.
   *
   * 폰에서는 목록·지도·상세가 한 화면에 다 들어가지 않아서, 줄을 누를 때마다
   * 상세가 지도를 밀어내면 "목록에서 골라 위치를 훑어보는" 흐름이 끊깁니다.
   * 선택(selectedId)만 바꾸면 지도가 그 좌표로 따라가고(NaverMap 의 센터링
   * 이펙트), 열려 있던 상세는 닫아 지도가 보이게 합니다.
   *
   * 판정은 useIsStacked (matchMedia 구독) — CSS 의 스택 경계와 같은 값이고,
   * 창 크기를 바꾸면 그 자리에서 따라 바뀝니다.
   */
  const handleListSelect = useCallback(
    (id: number) => {
      setSelectedId(id);
      setDetailOpen(!stacked);
    },
    [stacked],
  );

  /**
   * 상세 "닫기". 패널만 치우고 선택은 남긴다 — 목록 하이라이트·지도 핀이 유지된다.
   * useCallback 인 이유: 이 참조가 렌더마다 바뀌면 memo(ArcadeDetailPanel) 가
   * 무력해진다 (아래 최적화 주석).
   */
  const handleCloseDetail = useCallback(() => setDetailOpen(false), []);

  /**
   * 목록 행의 "위치 찾기 취소" — 선택을 통째로 푼다 (닫기와 다른 점).
   * 지도 강조 핀이 평범한 좌표 마커로 돌아가고, 열려 있던 상세도 함께 닫는다 —
   * 선택이 없는데 상세만 떠 있으면 무엇의 상세인지 목록이 말해 주지 못한다.
   */
  const handleClearSelect = useCallback(() => {
    setSelectedId(null);
    setDetailOpen(false);
  }, []);

  /**
   * 별 누르기. 스토어가 낙관적으로 먼저 바꾸고 서버 응답으로 한 번 더 맞춘다
   * (lib/use-favorites.ts) — 여기서 기다릴 것이 없다.
   */
  const handleToggleFavorite = useCallback(
    (id: number) => {
      void favorites.toggle(id);
    },
    // favorites 객체는 렌더마다 새로 만들어진다 (lib/use-favorites.ts 반환값).
    // toggle 자체는 playerId 가 바뀔 때만 바뀌므로 그걸 짚어야 memo 가 산다.
    [favorites.toggle],
  );

  // 폼을 열어 둔 채로 로그아웃하면(또는 권한이 회수되면) 저장이 401 로 떨어진다.
  // 채워 놓은 값이 사라지는 건 아쉽지만, 저장할 수 없는 폼을 띄워 두는 쪽이 더 나쁘다.
  useEffect(() => {
    if (!isAdmin && mode.kind !== 'list') closeForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, mode.kind]);

  // 제보/리뷰로 바뀐 오락실을 목록에 그대로 끼워 넣는다. 목록 전체를 다시
  // 받아오면 필터가 재실행되면서 방금 보던 항목이 화면에서 밀린다.
  // (거리·순위는 좌표에서 다시 계산되므로 따로 지켜 줄 값이 없다)
  const handleArcadeChanged = useCallback((updated: Arcade) => {
    setArcades((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  // 상세 패널에 그릴 것 — 선택돼 있어도 detailOpen 이 꺼져 있으면 패널은 없다.
  const selected =
    mode.kind === 'list' && detailOpen
      ? arcades.find((a) => a.id === selectedId)
      : undefined;

  /** 조건에는 맞지만 지금 화면 밖에 있는 곳 수 — 목록이 비었을 때의 답이 된다 */
  const offscreen = inRadius.length - inViewport.length;

  /**
   * 목록 머리글의 한 줄. 개수만 쓰지 않고 **무슨 순서인지**까지 적는다 —
   * 같은 "30곳" 이 가까운 순일 때와 평점 순일 때 전혀 다른 목록이다.
   * 30곳으로 잘렸으면 분모를 함께 적는다 ("화면 안 248곳 중 30곳").
   */
  // 검색 중에는 "화면 안" 이 아니다 — 전국에서 찾은 결과다. 같은 말을 쓰면
  // 화면 밖의 결과가 어디서 왔는지 설명이 안 된다.
  const listCountLabel = searching
    ? inViewport.length > ordered.length
      ? `검색 결과 ${inViewport.length}곳 중 ${ordered.length}곳 · ${orderLabel(listSort)}`
      : `검색 결과 ${inViewport.length}곳 · ${orderLabel(listSort)}`
    : inViewport.length > ordered.length
      ? `화면 안 ${inViewport.length}곳 중 ${ordered.length}곳 · ${orderLabel(listSort)}`
      : `화면 안 ${ordered.length}곳 · ${orderLabel(listSort)}`;

  const hint = listHint({
    canFavorite: favorites.canFavorite,
    listedCount: listed.length,
    offscreen,
    hasOrigin: origin !== null,
    truncated: inViewport.length > ordered.length,
    searching,
    loading,
  });

  /**
   * 검색의 첫 매치 — 버튼·Enter 가 갈 곳.
   *
   * 매치가 있으면 그 지점으로(거리 줌), 없으면 지역 검색으로 간다. "강남대로"
   * 처럼 지역이면서 매치도 있는 검색어는 지점 쪽이 이긴다 — 그 매치들이
   * 어차피 그 지역에 있고, 눈앞의 목록과 버튼이 같은 것을 가리켜야 한다.
   * 조회가 도는 동안은 비워 둔다: 옛 검색어의 첫 줄로 점프하면 안 된다.
   *
   * **예외는 시 단위 검색이다**(isCityQuery). '청주시' 는 그 도시를 보러 온
   * 검색인데 지점 쪽이 이기면 시내 어느 한 곳으로 줌 18까지 당겨져, 도시는
   * 못 보고 낯선 골목에 떨어진다. 그래서 매치가 있어도 비워 두고 지역
   * 이동(jumpToPlace)으로 보낸다 — 선택 없이 시가 드는 줌으로.
   */
  const topMatch =
    searching && !loading && !isCityQuery(q) ? listed[0]?.arcade : undefined;

  const jumpBySearch = () => {
    if (topMatch) {
      jumpToArcade(topMatch);
      return;
    }
    void jumpToPlace();
  };

  const layoutClass = [
    'layout',
    selected ? 'has-detail' : '',
    sidebarOpen ? '' : 'sidebar-off',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClass}>
      <aside className="sidebar" id="arcade-sidebar">
        <header className="brand">
          <h1>오락실 파인더</h1>
          <p>내 주변 오락실 · 보유 기종 · 영업시간</p>
        </header>

        {mode.kind === 'list' ? (
          <>
            <section className="filters">
              <input
                className="search"
                placeholder="오락실 이름 · 주소 · 지역(역/동/로) 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  // Enter = 첫 매치 지점 또는 지역으로 이동 (topMatch 주석).
                  // 지도 앱들의 손버릇 그대로다.
                  if (e.key === 'Enter') jumpBySearch();
                }}
              />

              {isPlaceQuery(q) && (
                <button
                  type="button"
                  className="btn btn-sm place-jump"
                  disabled={placeBusy}
                  onClick={jumpBySearch}
                >
                  {placeBusy
                    ? '지역 찾는 중…'
                    : topMatch
                      ? `'${topMatch.name}' 위치로 이동`
                      : `'${q.trim()}' 주변으로 지도 이동`}
                </button>
              )}
              {placeNotice && <p className="notice">{placeNotice}</p>}

              <div className="filter-row">
                {follow ? (
                  <button type="button" className="btn btn-on" onClick={stopFollow}>
                    따라가는 중
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={startFollow}>
                    내 위치
                  </button>
                )}
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  disabled={!origin}
                >
                  {/* 옆의 '해제' 버튼(기준점 제거)과 헷갈리지 않게 '전체' 로 쓴다 */}
                  <option value={RADIUS_NONE}>반경 전체</option>
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      반경 {r}km
                    </option>
                  ))}
                </select>
                {origin && (
                  <button type="button" className="btn btn-sm" onClick={clearCenter}>
                    해제
                  </button>
                )}
              </div>

              <LocationStatusLine
                follow={follow}
                status={live.status}
                accuracyM={live.accuracyM}
                hasOrigin={origin !== null}
                onGoToMyLocation={goToMyLocation}
              />
              {live.error && <p className="warn">{live.error}</p>}

              <div className="chips">
                {machines.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`chip ${machineIds.includes(m.id) ? 'is-on' : ''}`}
                    onClick={() => toggleMachineFilter(m.id)}
                    title={m.name}
                  >
                    {m.shortName}
                  </button>
                ))}
              </div>
              {machineIds.length > 1 && (
                <p className="muted small">선택한 기종을 모두 보유한 곳만 표시됩니다</p>
              )}
            </section>

            <div className="list-head">
              <span className="muted small">{listCountLabel}</span>
              {isAdmin ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                  + 오락실 등록
                </button>
              ) : (
                // 버튼만 지우면 "왜 없지"가 된다. 자리에 이유를 남긴다 —
                // 대신 이 화면에서 할 수 있는 일(제보)은 상세 패널에 그대로 있다.
                <span className="muted small admin-hint">등록·수정은 관리자만</span>
              )}
            </div>

            <div ref={listTopRef} />
            <ArcadeList
              items={listed}
              loading={loading}
              selectedId={selectedId}
              canEdit={isAdmin}
              canFavorite={favorites.canFavorite}
              isFavorite={favorites.isFavorite}
              onToggleFavorite={handleToggleFavorite}
              onSelect={handleListSelect}
              onClearSelect={handleClearSelect}
              onEdit={startEdit}
              onDelete={handleDelete}
              /*
                화면 안에 아무것도 없으면 빈 자리로 둔다 (null = 아무것도 안 그림).
                할 말이 있으면 아래 hint 가 한다 — "3곳이 화면 밖에 있습니다".
              */
              emptyMessage={null}
            />

            <Pagination
              page={page}
              total={ordered.length}
              pageSize={SIDEBAR_PAGE_SIZE}
              onChange={changePage}
            />

            {hint && <p className="muted small pad">{hint}</p>}
          </>
        ) : (
          <ArcadeForm
            machines={machines}
            initial={mode.kind === 'edit' ? mode.arcade : null}
            pickedCoord={pickedCoord}
            picking={picking}
            onTogglePick={() => setPicking((p) => !p)}
            onCoordChange={setPickedCoord}
            onCancel={closeForm}
            onSaved={handleSaved}
          />
        )}
      </aside>

      <main className="map-pane">
        <MapPane
          arcades={mode.kind === 'list' ? visibleArcades : arcades}
          selectedId={selectedId}
          onSelect={handleSelect}
          focusNonce={focusNonce}
          picking={picking}
          pickedCoord={mode.kind === 'list' ? null : pickedCoord}
          onPick={handlePick}
          center={origin}
          centerNonce={centerNonce}
          focusPoint={focusPoint}
          radiusKm={origin && radiusKm > 0 ? radiusKm : null}
          myLocation={follow ? live.coord : null}
          followCenter={follow}
          rankById={mode.kind === 'list' ? rankById : null}
          onViewportChange={setMapViewport}
        />

        {/* 지도 왼쪽 아래 플로팅 버튼. .map-pane 이 position:relative 라
            여기(지도 형제)에 두면 네이버 지도·대체 뷰 어느 쪽이든 위에 뜬다. */}
        <LocateButton
          following={follow}
          status={live.status}
          onStart={startFollow}
          onStop={stopFollow}
        />

        {showPerf && <MapPerfPanel />}
      </main>

      {selected && (
        <aside className="detail-pane">
          <ArcadeDetailPanel
            arcade={selected}
            machines={machines}
            onClose={handleCloseDetail}
            onLocate={handleLocate}
            onArcadeChanged={handleArcadeChanged}
          />
        </aside>
      )}

      {/*
        접기 손잡이. 지도(.map-pane) 안이 아니라 .layout 의 자식으로 둔다 —
        좁은 화면에서 상세를 열면 지도가 display:none 이 되므로, 지도 안에
        있으면 그때 손잡이도 같이 사라져서 접은 사이드바를 다시 열 수 없다.
      */}
      <SidebarHandle open={sidebarOpen} onToggle={toggleSidebar} controls="arcade-sidebar" />

      {/* 오락실 등록·수정 중에는 띄우지 않는다 — 폼 위에 겹쳐 앉는다 */}
      {mode.kind === 'list' && (
        <ChatBot onSearch={runSearch} extract={extract} initialOrder={order} />
      )}
    </div>
  );
}

/** 지금 목록이 무슨 순서인지 — 같은 개수라도 순서가 다르면 다른 목록이다 */
function orderLabel(sort: ListSort): string {
  if (sort === 'score') return '추천순';
  return sort === 'distance' ? '가까운 순' : '평점 높은 순';
}

/**
 * 목록 끝의 안내 한 줄 — **다음에 할 수 있는 일**만 적는다.
 *
 * 목록이 지도 화면을 따라가므로 "왜 비었지 / 왜 이만큼뿐이지" 의 답이 대개
 * 지도 조작이다. 그 답을 여기서 한 줄로 준다.
 */
function listHint({
  canFavorite,
  listedCount,
  offscreen,
  hasOrigin,
  truncated,
  searching,
  loading,
}: {
  canFavorite: boolean;
  /** 지금 그려진 줄 수 */
  listedCount: number;
  /** 조건에는 맞지만 화면 밖에 있는 곳 수 */
  offscreen: number;
  hasOrigin: boolean;
  /** 화면 안 목록이 상한(30곳)보다 많아 잘렸는지 */
  truncated: boolean;
  /** 이름·주소 검색 중 (전국 검색 — 화면·반경 컷 없음) */
  searching: boolean;
  loading: boolean;
}): string | null {
  // 검색이 전국에서 0곳 — 다음 행동은 지도 조작이 아니라 위의 지역 이동이다.
  // (조회가 도는 동안에는 말하지 않는다 — 결과가 오기 전의 0은 0이 아니다)
  if (searching && listedCount === 0 && !loading) {
    return '이름·주소가 맞는 오락실이 없습니다. 지역 이름이라면 위 버튼이 그 주변을 보여 줍니다.';
  }
  // 화면 안이 비었는데 조건에 맞는 곳은 있다 — 가장 헷갈리는 상태다. 검색은
  // 됐는데 목록이 비어 보이므로, 어디에 있는지부터 말해 준다.
  if (listedCount === 0) {
    return offscreen > 0
      ? `조건에 맞는 ${offscreen}곳이 지금 화면 밖에 있습니다. 지도를 옮기거나 축소해 보세요.`
      : null; // 정말 아무것도 없으면 빈 자리로 둔다
  }
  if (truncated) {
    // 검색 중에는 화면 컷이 없으므로 "지도를 확대하라" 는 답이 아니다.
    return searching
      ? `검색 결과가 많아 ${SIDEBAR_MAX_ITEMS}곳까지만 보여 줍니다. 검색어를 더 좁혀 보세요.`
      : `화면 안에서 ${SIDEBAR_MAX_ITEMS}곳까지만 보여 줍니다. 지도를 확대하거나 검색·기종으로 걸러 보세요.`;
  }
  if (offscreen > 0) return `${offscreen}곳은 화면 밖에 있습니다.`;
  if (!hasOrigin) return "'내 위치' 를 켜면 가까운 순으로 정리됩니다.";
  if (!canFavorite) return '로그인하면 즐겨찾기한 곳이 목록 맨 위에 옵니다.';
  return null;
}

/**
 * 기준점이 지금 어떤 상태인지 한 줄.
 *
 * '내 위치' 를 눌렀는데 아무 말도 없으면 눌린 건지 실패한 건지 알 수 없고,
 * 따라가는 중이라면 그 좌표가 얼마나 믿을 만한지(오차 반경)가 순위의 신뢰도를
 * 그대로 결정한다 — 오차 200m 짜리 좌표로는 200m 차이의 순위를 믿을 수 없다.
 */
function LocationStatusLine({
  follow,
  status,
  accuracyM,
  hasOrigin,
  onGoToMyLocation,
}: {
  follow: boolean;
  status: ReturnType<typeof useLiveLocation>['status'];
  accuracyM: number | null;
  hasOrigin: boolean;
  /** 추적 중인 좌표로 지도를 되돌린다 (추적 중일 때만 버튼이 붙는다) */
  onGoToMyLocation: () => void;
}) {
  if (follow && status === 'locating') {
    return <p className="muted small">위치 확인 중…</p>;
  }
  if (follow && status === 'tracking') {
    return (
      <p className="muted small live-dot loc-line">
        내 위치를 따라가는 중
        {accuracyM !== null && ` · 오차 ${formatDistance(accuracyM / 1000)}`}
        {/* 지도를 끌고 나갔다가 되돌아올 문 — 다음 GPS 좌표를 기다리지 않는다 */}
        <button type="button" className="btn btn-sm loc-go" onClick={onGoToMyLocation}>
          내 위치로 이동
        </button>
      </p>
    );
  }
  if (!follow && hasOrigin) {
    return <p className="muted small">마지막 위치를 기준점으로 쓰고 있습니다</p>;
  }
  return null;
}
