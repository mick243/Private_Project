'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { inBox, padBox, type LatLngBox } from '@/lib/geo';
import { drawTally, reportSync, setPerfMap, useCullingOff } from '@/lib/map-perf';
import type { Arcade } from '@/lib/types';
import { loadNaverMaps } from '@/lib/naver-loader';
import type { MapPaneProps } from './MapPane';

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

/**
 * 화면 밖으로 이만큼(화면 폭·높이의 비율)까지는 마커를 남겨 둔다.
 *
 * 0 으로 두면 두 가지가 어긋난다. 이름표는 점의 오른쪽으로 뻗으므로 점이 왼쪽
 * 화면 밖으로 조금 나간 오락실도 이름표는 보여야 하고, 지도를 조금씩 끌 때
 * 경계에 걸친 마커가 붙었다 떨어졌다 하는 것도 이 여백이 흡수한다.
 */
const CULL_MARGIN = 0.2;

/**
 * 지도 칸 크기가 멈췄다고 볼 시간(ms).
 *
 * `.layout` 의 grid 전환이 180ms 다 (app/globals.css). 그보다 조금 길게 잡아,
 * 전환이 끝난 뒤 딱 한 번 크기를 다시 재게 한다.
 */
const LAYOUT_SETTLE_MS = 220;

/**
 * 숨겨 둔 채로 재활용을 기다리는 마커 수의 상한.
 *
 * 화면에서 빠진 마커를 `setMap(null)` 로 떼어내는 값이 **개당 1.66ms** 였다
 * (실측: 142개 제거 = 236ms — 지도를 한 번 움직일 때마다 화면이 0.2초 멈춘다).
 * 반면 숨겨 두고 다른 오락실로 갈아 끼우는 값은 거의 0 이다. 그래서 떼지 않고
 * 모아 둔다.
 *
 * 다만 무한정 모으면 컬링으로 줄인 DOM 이 다시 불어난다. 화면 하나 분량 정도만
 * 들고 있다가 넘치는 것은 그때 떼어낸다 — 그건 드물게 일어나므로 값이 싸다.
 */
const MARKER_POOL_MAX = 200;

/** 지금 보이는 범위 + 여백. 'idle' 로 지도가 멈춘 뒤에 읽는다 */
function readViewport(map: naver.maps.Map): LatLngBox {
  const bounds = map.getBounds();
  const sw = bounds.getSW();
  const ne = bounds.getNE();
  return padBox(
    { minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() },
    CULL_MARGIN,
  );
}

/*
 * 마커 z 순서: 일반 100 · 순위 150 · 선택 200 · 신규 위치 300 · 내 위치 400.
 *
 * hover 로 알약이 펼쳐지면 이름이 옆 마커의 점에 가린다 — 알약은 넓은데 이웃
 * 래퍼도 같은 100 이라 DOM 순서가 늦은 쪽이 위에 그려지기 때문이다(실제로
 * "액션 영등포 타임스퀘어점" 이름 위에 "지투존 영등포점" 점이 찍혔다).
 * CSS 로는 못 고친다: :hover 는 안쪽 .mk 에 걸리는데 형제끼리의 앞뒤를 정하는
 * 것은 바깥 래퍼의 z-index 라서, 자식 hover 로 부모 z-index 를 바꿀 수 없다.
 * 그래서 hover 동안만 래퍼를 여기까지 올린다 — 오락실 마커(최대 200)보다는
 * 위, 내 위치·신규 위치보다는 아래.
 */
const HOVER_Z = 250;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function markerIcon(arcade: Arcade, selected: boolean, rank: number | undefined) {
  const count = arcade.machines.length;
  // 순위 뱃지는 이름 앞에 온다 — 뒤에 붙이면 이름이 긴 오락실에서 잘린다.
  const rankBadge = rank === undefined ? '' : `<span class="mk-rank">${rank}</span>`;
  return {
    content: `
      <div class="mk mk-pin ${selected ? 'mk-on' : ''} ${rank === undefined ? '' : 'mk-ranked'}">
        ${rankBadge}
        <span class="mk-dot"></span>
        <span class="mk-label">${escapeHtml(arcade.name)}</span>
        <span class="mk-count">${count}</span>
      </div>`,
    // 앵커는 (0,0) — 래퍼 원점이 곧 좌표이고, 점 중심을 거기 맞추는 일은
    // .mk-pin 이 --mk-dot-cx 만큼 되밀어 CSS 에서 처리한다. 상태(알약·순위
    // 뱃지)마다 점 앞에 붙는 것이 달라져서 JS 상수로는 맞출 수 없다.
    anchor: new naver.maps.Point(0, 0),
  };
}

interface HtmlOverlayOptions {
  position: naver.maps.LatLng;
  map?: naver.maps.Map | null;
  content: string;
  anchor?: naver.maps.Point;
  zIndex?: number;
  /** false 면 클릭이 뚫고 지나가 지도로 그대로 넘어간다 (내 위치 마커처럼 장식인 것) */
  clickable?: boolean;
  /**
   * `will-change: transform` 을 걸어 합성 레이어로 올릴지. **기본은 false** 다.
   *
   * 예전에는 모든 마커에 걸었다. 화면에 337개가 붙으면 합성 레이어가 337개
   * 생기는데, 정작 패닝은 naver 가 마커가 담긴 pane 을 통째로 옮기므로 개별
   * 마커의 transform 은 **줌에서만** 바뀐다. 레이어를 그만큼 만들어 관리하는
   * 값이 거기서 얻는 값보다 크다.
   *
   * 좌표가 계속 바뀌는 마커(내 위치)만 true 로 둔다 — 그건 GPS 가 올 때마다
   * 자기 transform 이 바뀌므로 레이어로 올릴 이유가 있다.
   */
  promote?: boolean;
  onClick?: () => void;
}

interface HtmlOverlay extends naver.maps.OverlayView {
  setContent(content: string, anchor?: naver.maps.Point): void;
  setZIndexValue(z: number): void;
  setPosition(position: naver.maps.LatLng): void;
  /** 화면에서 빠진 마커 — 떼어내지 않고 숨긴다 (아래 재활용 주석) */
  hide(): void;
  /** 숨겨 둔 것을 다른 오락실로 **갈아 끼운다** */
  reuse(options: {
    position: naver.maps.LatLng;
    content: string;
    anchor: naver.maps.Point;
    zIndex: number;
    onClick: () => void;
  }): void;
}

type HtmlOverlayCtor = new (options: HtmlOverlayOptions) => HtmlOverlay;

// `class X extends naver.maps.OverlayView` 는 extends 절을 클래스 "선언" 시점에
// 바로 평가한다 — 모듈 최상단에 이렇게 써 두면 loadNaverMaps() 로 SDK 스크립트가
// 붙기 전에 `naver`를 읽으려다 ReferenceError 로 죽는다. 그래서 클래스 정의 자체를
// 함수로 감싸고, SDK 로딩이 끝난 뒤(아래 init effect 안)에 딱 한 번만 만든다.
let HtmlOverlayImpl: HtmlOverlayCtor | undefined;

/**
 * naver.maps.Marker 대신 쓰는 커스텀 오버레이.
 *
 * 기본 제공 Marker 는 DOM 을 `position:absolute; left/top` 으로 옮기는데, 이
 * 방식을 바꿀 옵션이 SDK 에 없다. `naver.maps.OverlayView` 를 직접 상속해
 * `projection.fromCoordToOffset()` 으로 픽셀을 구하고 transform 으로 옮기면
 * 레이아웃(reflow) 없이 컴포지터에서만 위치가 갱신된다 — 마커 수백 개가 깔린
 * 화면에서, 특히 GPS 로 자주 움직이는 내 위치 마커에서 차이가 난다.
 */
function ensureHtmlOverlayCtor(): HtmlOverlayCtor {
  if (HtmlOverlayImpl) return HtmlOverlayImpl;

  class Impl extends naver.maps.OverlayView implements HtmlOverlay {
    private readonly element: HTMLDivElement;
    private position: naver.maps.LatLng;
    private anchor: naver.maps.Point;
    private onClick?: () => void;
    /** 숨겨 둔 상태. draw() 도 건너뛴다 — 안 보이는 것의 좌표를 계산할 이유가 없다 */
    private isHidden = false;
    /** hover 가 끝나면 되돌릴 원래 z (setZIndexValue 로 갱신된다) */
    private baseZ = 0;
    private hovered = false;

    constructor(options: HtmlOverlayOptions) {
      super();
      this.position = options.position;
      this.anchor = options.anchor ?? new naver.maps.Point(0, 0);
      this.onClick = options.onClick;

      this.element = document.createElement('div');
      this.element.style.position = 'absolute';
      this.element.style.left = '0';
      this.element.style.top = '0';
      if (options.promote) this.element.style.willChange = 'transform';
      this.element.innerHTML = options.content;
      this.setClickable(options.clickable ?? true);
      this.baseZ = options.zIndex ?? 0;
      if (options.zIndex !== undefined) this.element.style.zIndex = String(options.zIndex);

      this.setMap(options.map ?? null);
    }

    private setClickable(clickable: boolean) {
      this.element.style.pointerEvents = clickable ? 'auto' : 'none';
      this.element.style.cursor = clickable ? 'pointer' : 'default';
    }

    private handleClick = (e: MouseEvent) => {
      // 안 막으면 지도의 click 리스너(picking 모드의 위치 지정)까지 같이 튄다.
      e.stopPropagation();
      this.onClick?.();
    };

    private handleEnter = () => {
      this.hovered = true;
      this.element.style.zIndex = String(HOVER_Z);
    };

    private handleLeave = () => {
      this.hovered = false;
      this.element.style.zIndex = String(this.baseZ);
    };

    onAdd() {
      this.getPanes().overlayLayer.appendChild(this.element);
      // 리스너는 한 번만 단다. onClick 은 갈아 끼울 수 있으므로(reuse) 핸들러가
      // 그때그때 최신 값을 읽는다 — 재활용마다 리스너를 떼고 다시 달면 그게 비용이다.
      this.element.addEventListener('click', this.handleClick);
      this.element.addEventListener('mouseenter', this.handleEnter);
      this.element.addEventListener('mouseleave', this.handleLeave);
    }

    /**
     * naver 가 필요할 때(추가·패닝·줌) 알아서 불러 준다 — 실측으로 확인했다.
     * 줌 한 번에 마커 534개 × 3회 = 1602번 호출되고, 정착 후 오차는 0px 이다.
     * 그래서 bounds_changed 리스너나 rAF 루프로 우리가 따로 다시 그릴 필요가 없다
     * (그렇게 해 봤더니 pane 이 재정렬되는 시점을 못 맞춰 오히려 어긋났다).
     *
     * fromCoordToOffset 은 **지도 컨테이너 기준** 픽셀을 주고(지도 중심을 넣으면
     * 정확히 컨테이너 한가운데가 나온다), 마커가 들어가는 overlayLayer pane 은
     * 정착 상태에서 컨테이너와 원점이 같으므로 그 값을 그대로 쓰면 된다.
     */
    draw() {
      if (!this.getMap() || this.isHidden) return;
      // 계측용 카운터 (lib/map-perf.ts). 정수 하나 올리는 값이라 항상 세도 무방하다.
      drawTally.n += 1;
      const offset = this.getProjection().fromCoordToOffset(this.position);
      const x = offset.x - this.anchor.x;
      const y = offset.y - this.anchor.y;
      this.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    onRemove() {
      this.element.removeEventListener('click', this.handleClick);
      this.element.removeEventListener('mouseenter', this.handleEnter);
      this.element.removeEventListener('mouseleave', this.handleLeave);
      this.element.remove();
    }

    setContent(content: string, anchor?: naver.maps.Point) {
      this.element.innerHTML = content;
      if (anchor) this.anchor = anchor;
      this.draw();
    }

    setZIndexValue(z: number) {
      this.baseZ = z;
      // hover 중이면 지금 올려 둔 값을 유지한다 — 여기서 덮으면 이름이 다시 가린다.
      if (!this.hovered) this.element.style.zIndex = String(z);
    }

    setPosition(position: naver.maps.LatLng) {
      this.position = position;
      this.draw();
    }

    hide() {
      if (this.isHidden) return;
      this.isHidden = true;
      this.hovered = false;
      this.element.style.display = 'none';
      this.onClick = undefined;
    }

    reuse(options: {
      position: naver.maps.LatLng;
      content: string;
      anchor: naver.maps.Point;
      zIndex: number;
      onClick: () => void;
    }) {
      this.position = options.position;
      this.anchor = options.anchor;
      this.onClick = options.onClick;
      this.element.innerHTML = options.content;
      this.baseZ = options.zIndex;
      this.element.style.zIndex = String(options.zIndex);
      this.isHidden = false;
      this.element.style.display = '';
      this.draw();
    }
  }

  HtmlOverlayImpl = Impl;
  return Impl;
}

/**
 * 반경 원이 화면에 대강 들어오는 줌 (지역 이동 직후에만 씁니다).
 * 정확한 fit 이 아니라도 됩니다 — "그 동네가 보인다" 면 충분합니다.
 */
function zoomForRadius(radiusKm: number | null): number {
  // 반경 없이(전체) 이동하면 — 지역·역 이름 검색의 기본 상태 — 역 주변
  // 몇 블록이 한눈에 드는 수준으로. 지점 이동(SPOT_ZOOM 18)보다 네 단계 밖.
  if (!radiusKm) return 14;
  if (radiusKm <= 1) return 14;
  if (radiusKm <= 3) return 13;
  if (radiusKm <= 5) return 12;
  if (radiusKm <= 10) return 11;
  return 9;
}

export default function NaverMap({
  arcades,
  selectedId,
  onSelect,
  picking,
  pickedCoord,
  onPick,
  center,
  radiusKm,
  myLocation = null,
  followCenter = false,
  rankById = null,
  onViewportChange,
  focusNonce = 0,
  centerNonce = 0,
  focusPoint = null,
}: MapPaneProps) {
  /** 계측 패널이 컬링을 껐는지 (`/?perf=1` 에서만 켜집니다 — 평소엔 늘 false) */
  const cullingOff = useCullingOff();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef(new Map<number, HtmlOverlay>());
  /**
   * 화면에서 빠져 숨겨 둔 마커들. 새 오락실이 화면에 들어오면 여기서 꺼내 쓴다.
   * (위 MARKER_POOL_MAX 주석 — 붙였다 떼는 값이 갈아 끼우는 값보다 훨씬 비싸다)
   */
  const poolRef = useRef<HtmlOverlay[]>([]);
  /**
   * 마커별로 **지금 그려져 있는 모양**의 근거. 같으면 손대지 않는다.
   *
   * 없으면 시야가 조금 바뀔 때마다 보이는 마커 전부의 HTML 문자열을 다시 만들고
   * innerHTML 까지 다시 썼다. 실제로 바뀐 것은 마커 24개(7 추가 · 17 제거)뿐인데
   * 나머지 450개를 헛일로 다시 그리고 있었다.
   *
   * 실측 — 474개가 붙은 화면을 0.05° 옮길 때:
   *   동기화 64.6ms → 30.8ms · draw() 474회 → 7회
   * (남은 30ms 는 실제로 붙였다 뗀 마커 24개의 값이다)
   *
   * 두 단계로 본다.
   *   1) arcade **참조**가 같으면 끝 — 가장 흔한 경우다 (GPS 좌표가 와서 순위만
   *      다시 선 상태. 오락실 객체는 그대로다)
   *   2) 참조가 다르면 HTML 문자열을 만들어 **값**으로 견준다. 목록을 다시 받으면
   *      1,449개가 전부 새 객체가 되지만 내용은 대개 그대로여서, 참조만 보면
   *      화면에 붙은 마커 전부의 innerHTML 을 헛되게 다시 쓴다 (실측 200ms).
   */
  const markerShapeRef = useRef(
    new Map<number, { arcade: Arcade; z: number; content: string }>(),
  );
  const pickMarkerRef = useRef<HtmlOverlay | null>(null);
  const meMarkerRef = useRef<HtmlOverlay | null>(null);
  const circleRef = useRef<naver.maps.Circle | null>(null);
  // 기준점이 처음 잡혔을 때는 한 번 이동해 줘야 하지만, 그 뒤로는 사용자가
  // 지도를 끌어 놓은 자리를 GPS 가 매번 되돌리면 안 된다 (따라가기 모드 제외).
  const hadCenterRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 지금 화면에 보이는 범위. 이 안의 오락실만 마커로 그린다 — 전국 1,449곳을
   * 다 얹으면 서울만 보고 있어도 부산·제주 마커까지 DOM 에 남는다.
   * null 이면 아직 지도가 준비되지 않은 상태다 (그때는 아무것도 그리지 않는다).
   */
  const [viewport, setViewport] = useState<LatLngBox | null>(null);

  // 최신 콜백/모드를 리스너 안에서 참조하기 위한 ref (리스너 재등록 방지)
  const pickingRef = useRef(picking);
  const onPickRef = useRef(onPick);
  pickingRef.current = picking;
  onPickRef.current = onPick;

  // ── 지도 초기화 ────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;

    loadNaverMaps()
      .then(() => {
        if (disposed || !containerRef.current) return;
        const map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(
            center?.lat ?? DEFAULT_CENTER.lat,
            center?.lng ?? DEFAULT_CENTER.lng,
          ),
          zoom: 12,
          zoomControl: true,
          scaleControl: false,
          mapDataControl: false,
        });
        mapRef.current = map;
        // 계측 패널의 '흔들기' 가 이 인스턴스를 움직인다 (lib/map-perf.ts)
        setPerfMap(map);

        naver.maps.Event.addListener(map, 'click', (e) => {
          if (pickingRef.current) {
            onPickRef.current({ lat: e.coord.lat(), lng: e.coord.lng() });
          }
        });

        // 'idle' 은 끌기·줌이 **멈춘 뒤** 한 번 온다. bounds_changed 로 받으면
        // 끄는 중에 프레임마다 마커를 다시 붙이게 된다.
        naver.maps.Event.addListener(map, 'idle', () => setViewport(readViewport(map)));

        setViewport(readViewport(map));
        setReady(true);
      })
      .catch((e: Error) => !disposed && setError(e.message));

    return () => {
      disposed = true;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current.clear();
      poolRef.current.forEach((m) => m.setMap(null));
      poolRef.current = [];
      setPerfMap(null);
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // 최초 1회만 초기화한다. center 변경은 아래 effect 가 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 실제로 그릴 것 — **화면 안(+여백)에 있는 것만**.
   *
   * 선택한 곳은 화면 밖이어도 남긴다. 목록에서 먼 곳을 누르면 아래 effect 가
   * 지도를 그 자리로 옮기는데, 그 사이 한 프레임 동안 마커가 없으면 선택 표시가
   * 깜빡인다. (지도가 멈추면 'idle' 로 viewport 가 갱신돼 자연히 들어온다)
   */
  const inView = useMemo(() => {
    if (!viewport) return [];
    // 계측 패널이 컬링을 끈 상태 — 최적화 이전처럼 전국을 다 얹는다 (`/?perf=1`).
    if (cullingOff) return arcades;
    return arcades.filter((a) => a.id === selectedId || inBox(viewport, a));
  }, [arcades, viewport, selectedId, cullingOff]);

  // 사이드바가 같은 범위를 보게 알린다 (여백 포함 — 위 CULL_MARGIN).
  useEffect(() => {
    if (viewport) onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  // ── 오락실 마커 동기화 ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    // 계측 (lib/map-perf.ts) — 이 블록이 곧 "동기화 한 번" 이다.
    const perfT0 = performance.now();
    const perfDraw0 = drawTally.n;

    const HtmlOverlayCtor = ensureHtmlOverlayCtor();
    const markers = markersRef.current;
    const pool = poolRef.current;
    const nextIds = new Set(inView.map((a) => a.id));

    // 화면에서 빠진 것은 **숨겨서 모아 둔다** (떼어내지 않는다)
    markers.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.hide();
        pool.push(marker);
        markers.delete(id);
        markerShapeRef.current.delete(id);
      }
    });

    // 추가 / 갱신
    for (const arcade of inView) {
      const selected = arcade.id === selectedId;
      const rank = rankById?.get(arcade.id);
      // 순위가 붙은 마커는 다른 마커에 가리면 안 된다.
      const z = selected ? 200 : rank !== undefined ? 150 : 100;
      const existing = markers.get(arcade.id);
      if (existing) {
        const shown = markerShapeRef.current.get(arcade.id);
        // (1) 참조까지 같으면 문자열을 만들 이유조차 없다.
        if (shown && shown.arcade === arcade && shown.z === z) continue;

        const icon = markerIcon(arcade, selected, rank);
        if (shown) {
          // (2) 값이 같으면 DOM 은 그대로 둔다. 바뀐 것만 골라 쓴다.
          if (shown.content !== icon.content) existing.setContent(icon.content, icon.anchor);
          if (shown.z !== z) existing.setZIndexValue(z);
          markerShapeRef.current.set(arcade.id, { arcade, z, content: icon.content });
          continue;
        }
        existing.setContent(icon.content, icon.anchor);
        existing.setZIndexValue(z);
        markerShapeRef.current.set(arcade.id, { arcade, z, content: icon.content });
        continue;
      }

      const icon = markerIcon(arcade, selected, rank);
      const position = new naver.maps.LatLng(arcade.lat, arcade.lng);
      const onClick = () => onSelect(arcade.id);

      // 모아 둔 것이 있으면 갈아 끼운다. 없을 때만 새로 만든다.
      const recycled = pool.pop();
      const marker =
        recycled ??
        new HtmlOverlayCtor({
          position,
          map,
          zIndex: z,
          content: icon.content,
          anchor: icon.anchor,
          onClick,
        });
      if (recycled) {
        recycled.reuse({
          position,
          content: icon.content,
          anchor: icon.anchor,
          zIndex: z,
          onClick,
        });
      }

      markers.set(arcade.id, marker);
      markerShapeRef.current.set(arcade.id, { arcade, z, content: icon.content });
    }

    // 모아 둔 것이 화면 하나 분량을 넘으면 그만큼은 진짜로 떼어낸다.
    while (pool.length > MARKER_POOL_MAX) pool.pop()?.setMap(null);

    reportSync({
      markers: markers.size,
      total: arcades.length,
      syncMs: performance.now() - perfT0,
      drawCalls: drawTally.n - perfDraw0,
    });
  }, [inView, selectedId, ready, onSelect, rankById, arcades.length]);

  // ── 선택한 오락실을 화면 정중앙으로 ────────────────────────
  /**
   * 한 선택에 **한 번만** 옮긴다.
   *
   * 예전에는 arcades 가 바뀔 때마다 다시 옮겼다. 목록은 GPS 가 300m 움직일 때마다
   * 다시 받아오므로, 상세를 열어 둔 채로 걸으면 지도를 어디로 끌어 놓든 계속
   * 그 오락실로 되돌아왔다. 게다가 setCenter → idle → 마커 재동기화가 매번
   * 딸려 왔다.
   */
  /**
   * 이미 옮겨 준 (선택, 요청 횟수). focusNonce 를 키에 넣어야 '위치' 버튼을
   * 다시 눌렀을 때 한 번 더 옮긴다 — 선택만 키로 쓰면 두 번째 요청이 무시된다.
   */
  const centeredFor = useRef<string | null>(null);
  /** 레이아웃 전환이 끝난 뒤 한 번 더 맞출 좌표 (아래 ResizeObserver 가 쓴다) */
  const pendingCenterRef = useRef<naver.maps.LatLng | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (selectedId === null) {
      centeredFor.current = null;
      pendingCenterRef.current = null;
      return;
    }
    const key = `${selectedId}:${focusNonce}`;
    if (centeredFor.current === key) return;
    // 목록이 아직 안 왔으면(딥링크 ?arcade=3) 다음 arcades 갱신에서 다시 시도한다.
    const target = arcades.find((a) => a.id === selectedId);
    if (!target) return;

    centeredFor.current = key;
    const at = new naver.maps.LatLng(target.lat, target.lng);

    /*
     * 두 번 맞춘다.
     *
     * 1) 지금 — 다만 그 전에 autoResize() 로 **칸 크기를 다시 잰다**. naver 는 창
     *    크기만 지켜보므로 사이드바를 접었다 편 것을 모르고, 그 상태로 setCenter
     *    하면 옛 폭의 가운데에 놓아 핀이 그만큼 밀린다 (실측 360px).
     * 2) 상세 패널이 열리며 지도 칸이 380px 줄어드는 전환이 끝난 뒤 한 번 더.
     *    전환은 .layout 의 grid 180ms 다 (app/globals.css).
     */
    map.autoResize();
    map.setCenter(at);

    pendingCenterRef.current = at;
    const settle = setTimeout(() => {
      const m = mapRef.current;
      if (!m) return;
      m.autoResize();
      m.setCenter(at);
      pendingCenterRef.current = null;
    }, LAYOUT_SETTLE_MS);
    return () => clearTimeout(settle);
  }, [selectedId, arcades, ready, focusNonce]);

  // ── 지도 칸 크기가 바뀌면 알려 준다 ────────────────────────
  /*
   * naver 는 **창** 크기만 지켜본다. 사이드바를 접거나 상세 패널이 열려서 지도
   * 칸만 바뀌면 모르므로, 투영이 옛 폭을 그대로 써서 마커가 통째로 밀린다.
   *
   * 전환 중에는 매 프레임 크기가 바뀌는데 그때마다 refresh() 를 부르면 그게 곧
   * 렉이다. 마지막 변화에서 한 번만 부른다.
   *
   * ⚠ ResizeObserver 콜백은 브라우저의 렌더링 단계에서 배달된다 — 탭이 화면에
   *   그려지지 않는 동안(백그라운드·미리보기 패널이 접힌 상태)에는 오지 않는다.
   *   그래서 선택할 때의 보정은 위 effect 가 **타이머로도** 한 번 더 한다.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        map.autoResize();
        if (pendingCenterRef.current) {
          map.setCenter(pendingCenterRef.current);
          pendingCenterRef.current = null;
        }
      }, LAYOUT_SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [ready]);

  // ── 반경 검색 원 ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    if (!center || !radiusKm) {
      circleRef.current?.setMap(null);
      circleRef.current = null;
      hadCenterRef.current = false;
      return;
    }

    const latlng = new naver.maps.LatLng(center.lat, center.lng);
    if (!circleRef.current) {
      circleRef.current = new naver.maps.Circle({
        map,
        center: latlng,
        radius: radiusKm * 1000,
        strokeColor: '#6d5efc',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: '#6d5efc',
        fillOpacity: 0.08,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter(latlng);
      circleRef.current.setRadius(radiusKm * 1000);
    }

    if (followCenter || !hadCenterRef.current) map.setCenter(latlng);
    hadCenterRef.current = true;
  }, [center, radiusKm, ready, followCenter]);

  /**
   * 지역 검색으로 기준점이 뛰었을 때 — 이번 한 번은 지도를 세게 옮긴다.
   *
   * 위 반경 원 effect 는 두 번째 기준점부터는 따라가지 않는다(주변을 보러
   * 끌고 나간 지도를 GPS 가 도로 당기지 않기 위해서). 지역 검색은 반대다 —
   * 사용자가 "거기로 가라" 고 시킨 것이라, 화면이 안 움직이면 아무 일도
   * 없었던 것처럼 보인다. 줌도 반경이 들어오는 수준으로 맞춘다: 전국을 보던
   * 줌에서는 기준점이 옮겨져도 화면이 그대로다.
   */
  const centerJumped = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || centerNonce === 0 || centerNonce === centerJumped.current) return;
    if (!center) return;
    centerJumped.current = centerNonce;
    map.autoResize();
    map.setCenter(new naver.maps.LatLng(center.lat, center.lng));
    map.setZoom(zoomForRadius(radiusKm));
  }, [centerNonce, center, radiusKm, ready]);

  /**
   * 지점명 검색 — 그 좌표로 옮기고 요청받은 줌까지 당긴다 (MapPane 주석).
   * 위 두 이동과 분리한 이유: 선택 센터링에 줌을 섞으면 목록 줄을 누를 때마다
   * 보던 줌을 빼앗기고, centerNonce 는 기준점(center)을 움직이는 문이다.
   */
  const focusPointApplied = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusPoint || focusPoint.nonce === focusPointApplied.current) return;
    focusPointApplied.current = focusPoint.nonce;
    map.autoResize();
    map.setCenter(new naver.maps.LatLng(focusPoint.lat, focusPoint.lng));
    // zoom 이 없는 이동('내 위치로 이동')은 보던 줌을 지킨다.
    if (focusPoint.zoom !== undefined) map.setZoom(focusPoint.zoom);
  }, [focusPoint, ready]);

  // ── 내 위치 마커 ───────────────────────────────────────────
  // 반경 원만 있으면 원의 한가운데가 나인지, 내가 그 근처 어딘가인지 알 수 없다.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    if (!myLocation) {
      meMarkerRef.current?.setMap(null);
      meMarkerRef.current = null;
      return;
    }

    const latlng = new naver.maps.LatLng(myLocation.lat, myLocation.lng);
    if (meMarkerRef.current) {
      meMarkerRef.current.setPosition(latlng);
      return;
    }
    meMarkerRef.current = new (ensureHtmlOverlayCtor())({
      position: latlng,
      map,
      zIndex: 400,
      clickable: false,
      // GPS 가 올 때마다 자기 transform 이 바뀌는 유일한 마커다.
      promote: true,
      content: '<div class="mk mk-pin mk-me"><span class="mk-dot"></span><span class="mk-label">내 위치</span></div>',
      anchor: new naver.maps.Point(0, 0),
    });
  }, [myLocation, ready]);

  // ── 위치 지정 마커 ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    if (!pickedCoord) {
      pickMarkerRef.current?.setMap(null);
      pickMarkerRef.current = null;
      return;
    }

    pickMarkerRef.current?.setMap(null);
    pickMarkerRef.current = new (ensureHtmlOverlayCtor())({
      position: new naver.maps.LatLng(pickedCoord.lat, pickedCoord.lng),
      map,
      zIndex: 300,
      content: '<div class="mk mk-pin mk-pick"><span class="mk-dot"></span><span class="mk-label">신규 위치</span></div>',
      anchor: new naver.maps.Point(0, 0),
    });
  }, [pickedCoord, ready]);

  if (error) {
    return (
      <div className="map-error">
        <strong>네이버 지도를 불러오지 못했습니다</strong>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
      {picking && <div className="map-hint">지도를 클릭해 오락실 위치를 지정하세요</div>}
    </div>
  );
}
