'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { inBox, padBox, type Coord, type LatLngBox } from '@/lib/geo';
import type { MapPaneProps } from './MapPane';

/**
 * 네이버 지도 키가 없을 때 쓰는 대체 뷰.
 *
 * 실제 타일 대신 위/경도를 선형 투영해 배치만 합니다. 키 없이도 등록·수정·
 * 위치 지정·선택 흐름 전체를 확인할 수 있게 하는 것이 목적이며, 키를 넣으면
 * 자동으로 NaverMap 으로 교체됩니다.
 *
 * **보이는 범위 안의 마커만 그립니다** — NaverMap 과 같은 규칙입니다
 * (components/NaverMap.tsx 의 CULL_MARGIN). 예전에는 받은 좌표 **전부**를 한
 * 화면에 맞춰 넣었는데, 전국 실데이터로 바뀌자 1,449개가 한 화면에 깔려서
 * 점이 서로 붙어 지도라기보다 얼룩이 됐습니다. 그래서 기본 시야를 한 도시
 * 정도로 잡고(MAX_SPAN), 끌기·휠로 옮겨 보게 합니다 — 화면에 들어오는 순간
 * 그려집니다.
 */

/** 최소 여백(도) — 점 하나만 있을 때도 화면이 성립해야 합니다 */
const PAD = 0.02;

/**
 * 기본 시야의 최대 폭(위도 도). 0.3° ≈ 33km — 서울 하나가 들어가는 정도입니다.
 *
 * 받은 좌표 전부를 맞추려 하면(옛 동작) 전국이 한 화면에 들어와 점이 뭉칩니다.
 * 그렇다고 화면에 아무것도 없으면 안 되므로, 맞추기는 하되 이 폭을 넘으면
 * 가운데만 남기고 잘라 냅니다.
 */
const MAX_SPAN = 0.3;

/** 최소 시야 폭(도) — 이보다 더 확대하면 점 하나만 남습니다 */
const MIN_SPAN = 0.004;

/** 화면 밖으로 이만큼까지는 마커를 남깁니다 (이름표가 점 오른쪽으로 뻗습니다) */
const CULL_MARGIN = 0.2;

/** 휠 한 칸의 배율 */
const ZOOM_STEP = 1.25;

const spanOf = (box: LatLngBox) => ({
  lat: box.maxLat - box.minLat,
  lng: box.maxLng - box.minLng,
});

const centerOf = (box: LatLngBox): Coord => ({
  lat: (box.minLat + box.maxLat) / 2,
  lng: (box.minLng + box.maxLng) / 2,
});

function boxFrom(center: Coord, span: { lat: number; lng: number }): LatLngBox {
  return {
    minLat: center.lat - span.lat / 2,
    maxLat: center.lat + span.lat / 2,
    minLng: center.lng - span.lng / 2,
    maxLng: center.lng + span.lng / 2,
  };
}

/**
 * 점들을 담는 시야. 넓으면 MAX_SPAN 으로 자릅니다 (가운데를 남깁니다).
 *
 * 위·경도 폭을 따로 다루는 이유: 이 뷰는 박스를 컨테이너에 그대로 늘려 맞추므로
 * (100cqw × 100cqh) 두 축의 배율이 애초에 다릅니다. 한쪽만 자르면 그 비율이
 * 바뀌어 확대·축소할 때마다 지도가 늘어났다 줄어드는 것처럼 보입니다.
 */
function fitBox(points: Coord[]): LatLngBox {
  if (points.length === 0) {
    // 서울시청 — NaverMap 의 DEFAULT_CENTER 와 같은 자리입니다.
    return boxFrom({ lat: 37.5665, lng: 126.978 }, { lat: MAX_SPAN, lng: MAX_SPAN });
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const raw: LatLngBox = {
    minLat: Math.min(...lats) - PAD,
    maxLat: Math.max(...lats) + PAD,
    minLng: Math.min(...lngs) - PAD,
    maxLng: Math.max(...lngs) + PAD,
  };

  const span = spanOf(raw);
  return boxFrom(centerOf(raw), {
    lat: Math.min(Math.max(span.lat, MIN_SPAN), MAX_SPAN),
    lng: Math.min(Math.max(span.lng, MIN_SPAN), MAX_SPAN),
  });
}

export default function FallbackMap({
  arcades,
  selectedId,
  onSelect,
  picking,
  pickedCoord,
  onPick,
  center,
  myLocation = null,
  rankById = null,
  onViewportChange,
}: MapPaneProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * 지금 보고 있는 범위. 아래 두 가지가 이 값을 바꿉니다.
   *   1) 받은 좌표 묶음이 바뀌면 다시 맞춘다 (검색·필터·반경)
   *   2) 사람이 끌거나 휠을 돌리면 그대로 따라간다
   */
  const [view, setView] = useState<LatLngBox>(() =>
    fitBox(center ? [center] : arcades.map((a) => ({ lat: a.lat, lng: a.lng }))),
  );

  /**
   * 다시 맞출 때인지 알아보는 열쇠.
   *
   * `arcades` 는 GPS 좌표가 올 때마다 새 배열이라 그것만 보고 다시 맞추면
   * 끌어 놓은 자리가 매번 되돌아갑니다. 개수와 양 끝 id 만 봅니다 — 검색·필터로
   * 목록이 갈리면 이 값이 바뀌고, 순위만 다시 선 경우에는 그대로입니다.
   */
  const fitKey = `${arcades.length}:${arcades[0]?.id ?? 0}:${arcades[arcades.length - 1]?.id ?? 0}:${center ? `${center.lat},${center.lng}` : ''}`;
  const lastFitRef = useRef(fitKey);

  useEffect(() => {
    if (lastFitRef.current === fitKey) return;
    lastFitRef.current = fitKey;
    // 기준점이 있으면 그 자리를 본다 — 반경 검색의 가운데가 화면 가운데여야 한다.
    setView(fitBox(center ? [center] : arcades.map((a) => ({ lat: a.lat, lng: a.lng }))));
    // arcades / center 는 fitKey 에 녹아 있다 (매 GPS 갱신마다 다시 맞추지 않으려고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /**
   * 선택한 곳을 화면 정중앙으로. **한 선택에 한 번만** 옮긴다.
   *
   * 시야 안에 있어도 옮긴다 — "선택한 곳이 가운데" 가 규칙이고, 안에 있을 때만
   * 가만히 두면 같은 클릭이 어떤 때는 지도를 옮기고 어떤 때는 안 옮긴다.
   * view 를 의존성에 넣지 않는 이유: 끌 때마다 다시 판단해 선택한 곳으로
   * 되돌아온다.
   */
  const centeredFor = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      centeredFor.current = null;
      return;
    }
    if (centeredFor.current === selectedId) return;
    const target = arcades.find((a) => a.id === selectedId);
    if (!target) return; // 목록이 아직 안 왔다 — 다음 갱신에서 다시 시도
    centeredFor.current = selectedId;
    setView((prev) => boxFrom({ lat: target.lat, lng: target.lng }, spanOf(prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, arcades]);

  /** 지금 그리는 범위 (화면 + 마커 여백) */
  const drawn = useMemo(() => padBox(view, CULL_MARGIN), [view]);

  /** 실제로 그릴 것 — 그 범위 안의 것만 */
  const visible = useMemo(
    () => arcades.filter((a) => a.id === selectedId || inBox(drawn, a)),
    [arcades, drawn, selectedId],
  );

  // 사이드바가 같은 범위를 보게 알린다.
  useEffect(() => {
    onViewportChange?.(drawn);
  }, [drawn, onViewportChange]);

  /** cqw/cqh(부모 컨테이너 기준 %) 를 그대로 커스텀 프로퍼티 값으로 씁니다 —
   *  .mk-static 이 transform: translate3d(var(--x), var(--y), 0) 으로 옮깁니다. */
  const project = (lat: number, lng: number) => ({
    x: `${((lng - view.minLng) / (view.maxLng - view.minLng)) * 100}cqw`,
    y: `${(1 - (lat - view.minLat) / (view.maxLat - view.minLat)) * 100}cqh`,
  });

  // ── 끌기 ───────────────────────────────────────────────────
  // 위치 지정 모드에서는 끌지 않는다 — 그 모드의 클릭은 좌표를 찍는 일이고,
  // 끌기와 섞이면 어느 쪽인지 알 수 없다.
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (picking) return;
    // 새 누르기가 시작되면 지난 판정은 무효다 — 아래 draggedRef 주석 참고.
    draggedRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    // 캡처하면 커서가 마커 위를 지나가도 끌기가 끊기지 않는다. 활성 포인터가
    // 아니면(합성 이벤트 등) 예외가 나는데, 끌기 자체는 캡처 없이도 되므로 삼킨다.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 없이 진행 */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return; // 손떨림
    drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;

    setView((prev) => {
      const span = spanOf(prev);
      // 끄는 방향과 지도가 움직이는 방향은 반대다 (종이를 끌어당기는 셈).
      const dLng = -(dx / rect.width) * span.lng;
      const dLat = (dy / rect.height) * span.lat;
      return boxFrom(
        { lat: centerOf(prev).lat + dLat, lng: centerOf(prev).lng + dLng },
        span,
      );
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 캡처하지 못했던 경우 */
    }
    // 끌고 나서 손을 떼면 click 도 함께 온다. 그 클릭은 선택도 위치 지정도
    // 아니므로 걸러야 한다.
    draggedRef.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
  };

  /**
   * 직전 누르기가 **끌기**였는지.
   *
   * 클릭 쪽에서 이 값을 지우지 않는 이유: 끌기 뒤에 click 이 오지 않는 경우가
   * 있습니다(포인터를 창 밖에서 떼거나, 합성 이벤트로 움직였을 때). 지우는 일을
   * 클릭에 맡기면 그때 남은 true 가 **다음 진짜 클릭**을 먹습니다 — 마커를 눌러도
   * 상세가 안 열리는 증상으로 나타납니다. 그래서 다음 누르기 시작(pointerdown)이
   * 지웁니다.
   *
   * 마우스 클릭은 언제나 pointerdown 뒤에 오므로 이걸로 충분하지만, 키보드
   * (마커에 포커스를 두고 Enter)로 들어온 클릭은 pointerdown 이 없습니다.
   * 그건 detail === 0 으로 갈라냅니다 (fromPointer).
   */
  const draggedRef = useRef(false);

  /** 마우스·터치에서 온 클릭인지. 키보드로 누른 클릭은 detail 이 0 입니다 */
  const fromPointer = (e: { detail: number }) => e.detail > 0;

  // ── 휠 확대·축소 ───────────────────────────────────────────
  /*
   * React 의 onWheel 로 달지 않는다. React 는 루트에 **passive** 리스너로 붙이는데
   * 그 안에서는 preventDefault() 가 통하지 않는다 ("Unable to preventDefault inside
   * passive event listener invocation" 이 콘솔에 쌓인다). 확대는 되지만 페이지
   * 스크롤을 막지 못해서, 휠을 돌리면 지도가 확대되면서 화면도 함께 움직인다.
   * 그래서 여기서 직접 { passive: false } 로 붙인다.
   *
   * 리스너는 한 번만 달고 setView 의 함수형 갱신으로 지금 값을 읽는다 — 매 렌더마다
   * 다시 달면 휠을 돌리는 동안 리스너가 계속 교체된다.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // handleWheel 은 클로저로 아무 상태도 붙잡지 않는다 (아래 참고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 커서 아래 좌표를 붙잡아 두고 배율만 바꾼다 — 가운데 기준으로 확대하면
  // 보려던 곳이 화면 밖으로 밀려난다.
  function handleWheel(e: WheelEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();

    const factor = e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;

    setView((prev) => {
      const span = spanOf(prev);
      const next = {
        lat: Math.min(Math.max(span.lat * factor, MIN_SPAN), MAX_SPAN * 20),
        lng: Math.min(Math.max(span.lng * factor, MIN_SPAN), MAX_SPAN * 20),
      };
      // 커서가 가리키는 좌표 (0~1 비율)
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const anchor = {
        lat: prev.maxLat - ry * span.lat,
        lng: prev.minLng + rx * span.lng,
      };
      // 그 좌표가 화면에서 같은 자리에 남도록 새 박스를 잡는다.
      return {
        minLng: anchor.lng - rx * next.lng,
        maxLng: anchor.lng + (1 - rx) * next.lng,
        maxLat: anchor.lat + ry * next.lat,
        minLat: anchor.lat - (1 - ry) * next.lat,
      };
    });
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current && fromPointer(e)) return;
    if (!picking || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onPick({
      lat: view.maxLat - y * (view.maxLat - view.minLat),
      lng: view.minLng + x * (view.maxLng - view.minLng),
    });
  };

  return (
    <div className="map-wrap">
      <div
        ref={boxRef}
        className={`map-canvas map-fallback ${picking ? 'is-picking' : ''}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {visible.map((a) => {
          const pos = project(a.lat, a.lng);
          const rank = rankById?.get(a.id);
          return (
            <button
              key={a.id}
              type="button"
              className={`mk mk-static ${a.id === selectedId ? 'mk-on' : ''} ${
                rank === undefined ? '' : 'mk-ranked'
              }`}
              style={{ '--x': pos.x, '--y': pos.y } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                // 끌다가 마커 위에서 손을 뗀 경우 — 선택이 아니다.
                if (draggedRef.current && fromPointer(e)) return;
                onSelect(a.id);
              }}
            >
              {rank !== undefined && <span className="mk-rank">{rank}</span>}
              <span className="mk-dot" />
              <span className="mk-label">{a.name}</span>
              <span className="mk-count">{a.machines.length}</span>
            </button>
          );
        })}

        {myLocation && inBox(drawn, myLocation) && (
          <div
            className="mk mk-static mk-me"
            style={
              {
                '--x': project(myLocation.lat, myLocation.lng).x,
                '--y': project(myLocation.lat, myLocation.lng).y,
              } as React.CSSProperties
            }
          >
            <span className="mk-dot" />
            <span className="mk-label">내 위치</span>
          </div>
        )}

        {pickedCoord && (
          <div
            className="mk mk-static mk-pick"
            style={
              {
                '--x': project(pickedCoord.lat, pickedCoord.lng).x,
                '--y': project(pickedCoord.lat, pickedCoord.lng).y,
              } as React.CSSProperties
            }
          >
            <span className="mk-dot" />
            <span className="mk-label">신규 위치</span>
          </div>
        )}
      </div>

      <div className="map-badge">
        지도 키 미설정 — 좌표 배치만 보여주는 대체 뷰입니다 (끌어서 이동 · 휠로 확대).
        <code>.env.local</code> 에 <code>NEXT_PUBLIC_NAVER_MAP_KEY_ID</code> 를 넣으면
        네이버 지도로 전환됩니다.
      </div>
      {picking && <div className="map-hint">클릭해서 오락실 위치를 지정하세요</div>}
    </div>
  );
}
