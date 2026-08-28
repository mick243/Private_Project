/**
 * 네이버 지도 Web Dynamic Map v3 중 이 프로토타입에서 실제로 쓰는 부분만
 * 최소한으로 선언합니다. 전체 타입이 필요하면 @types/navermaps 를 설치하세요.
 */
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class LatLngBounds {
    extend(latlng: LatLng): void;
    /** 남서(최소 위·경도) 꼭짓점 */
    getSW(): LatLng;
    /** 북동(최대 위·경도) 꼭짓점 */
    getNE(): LatLng;
  }

  interface MapOptions {
    center: LatLng;
    zoom: number;
    minZoom?: number;
    zoomControl?: boolean;
    zoomControlOptions?: Record<string, unknown>;
    scaleControl?: boolean;
    mapDataControl?: boolean;
    logoControlOptions?: Record<string, unknown>;
  }

  class Map {
    constructor(el: HTMLElement | string, options: MapOptions);
    setCenter(latlng: LatLng): void;
    setZoom(zoom: number, animate?: boolean): void;
    getCenter(): LatLng;
    /** 화면 픽셀만큼 밀어서 옮긴다. 성능 계측의 '흔들기' 가 쓴다 (lib/map-perf.ts) */
    panBy(offset: Point): void;
    /** 지금 화면에 보이는 범위. 'idle' 이벤트 뒤에 읽는다 (components/NaverMap.tsx) */
    getBounds(): LatLngBounds;
    /**
     * **컨테이너 크기를 다시 재서** 지도 크기를 맞춘다.
     *
     * naver 는 창 크기만 지켜보므로, 사이드바를 접거나 상세 패널이 열려서 지도
     * 칸만 바뀌면 알지 못한다. 그 상태로 두면 투영이 옛 폭을 써서 마커가 통째로
     * 밀린다 (실측 360px — components/NaverMap.tsx).
     *
     * ⚠ refresh() 와 다르다. refresh() 는 **다시 그리기만** 하고 크기를 재지
     *   않으므로 이 증상이 그대로 남는다 (실제로 그렇게 해 보고 확인했다).
     */
    autoResize(): void;
    /** 다시 그리기만 한다 (크기는 autoResize 가 잰다) */
    refresh(noEffect?: boolean): void;
    fitBounds(bounds: LatLngBounds, margin?: Record<string, number>): void;
    destroy(): void;
  }

  class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  interface MapPanes {
    overlayLayer: HTMLElement;
  }

  interface MapSystemProjection {
    /** 위경도 → 지도 컨테이너 기준 픽셀 오프셋. components/NaverMap.tsx 의
     *  HtmlOverlay 가 이 값으로 transform 을 직접 계산한다 (기본 제공 Marker 는
     *  내부적으로 left/top 을 쓰는데 그 방식을 바꿀 방법이 없어서 이 쪽을 쓴다). */
    fromCoordToOffset(coord: LatLng): Point;
  }

  /** 커스텀 오버레이 베이스 클래스. onAdd/draw/onRemove 를 오버라이드해서 쓴다. */
  abstract class OverlayView {
    setMap(map: Map | null): void;
    getMap(): Map | null;
    getPanes(): MapPanes;
    getProjection(): MapSystemProjection;
    onAdd(): void;
    draw(): void;
    onRemove(): void;
  }

  class Circle {
    constructor(options: {
      map?: Map;
      center: LatLng;
      radius: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      clickable?: boolean;
    });
    setMap(map: Map | null): void;
    setCenter(latlng: LatLng): void;
    setRadius(radius: number): void;
  }

  interface PointerEvent {
    coord: LatLng;
  }

  namespace Event {
    function addListener(
      target: unknown,
      eventName: string,
      listener: (e: PointerEvent) => void,
    ): unknown;
    function removeListener(listener: unknown): void;
  }
}

interface Window {
  naver?: typeof naver;
}
