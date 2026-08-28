'use client';

import dynamic from 'next/dynamic';
import type { LatLngBox } from '@/lib/geo';
import type { Arcade } from '@/lib/types';
import { hasNaverKey } from '@/lib/naver-loader';

export interface Coord {
  lat: number;
  lng: number;
}

export interface MapPaneProps {
  arcades: Arcade[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** 위치 지정 모드 (등록/수정 폼에서 켜짐) */
  picking: boolean;
  pickedCoord: Coord | null;
  onPick: (coord: Coord) => void;
  /** 반경 검색 기준점 */
  center: Coord | null;
  radiusKm: number | null;
  /**
   * GPS 로 잡은 현재 위치. center 와 같은 좌표일 때가 많지만 뜻이 다릅니다 —
   * center 는 "무엇을 기준으로 찾는가"이고 이건 "내가 실제로 어디 있는가"라,
   * 추적을 끄면 center 는 그 자리에 남고 이 값만 사라집니다.
   */
  myLocation?: Coord | null;
  /** 켜져 있으면 기준점이 움직일 때마다 지도가 따라갑니다 */
  followCenter?: boolean;
  /**
   * 마커에 붙일 순위 (오락실 id → 1·2·3). 추천순으로 탐색했을 때만 옵니다.
   * "지도에 표시한다" 는 말이 실제로 눈에 보이려면 상위 몇 곳이 나머지와
   * 달라 보여야 합니다 — 전부 같은 핀이면 순위는 목록에만 있는 셈입니다.
   */
  rankById?: Map<number, number> | null;
  /**
   * 지금 **그리고 있는** 범위를 알립니다 (화면 + 마커 여백까지 포함한 값).
   *
   * 사이드바 목록이 "지도에 보이는 곳" 이 되려면 그 판정을 지도와 똑같이 해야
   * 합니다. 화면 경계만 넘겨주면 여백에 걸친 마커가 지도에는 있는데 목록에는
   * 없는 상태가 생깁니다 — 그래서 컬링에 쓰는 박스를 그대로 올려보냅니다.
   */
  onViewportChange?: (box: LatLngBox) => void;
  /**
   * 값이 바뀌면 **선택한 오락실로 지도를 다시 옮깁니다** (상세의 '위치' 버튼).
   *
   * 선택(selectedId)만으로는 다시 옮길 수 없습니다 — 한 선택에 한 번만 옮기는
   * 규칙이 있어서(NaverMap 의 centeredFor), 주변을 보러 지도를 끌고 나간 뒤에는
   * 같은 곳을 다시 눌러도 아무 일도 일어나지 않습니다. 그 규칙을 깨지 않고
   * "지금 한 번 더" 를 말하는 값입니다.
   */
  focusNonce?: number;
  /**
   * 값이 바뀌면 **기준점(center)으로 지도를 옮깁니다** (지역 검색으로 이동).
   *
   * center 변경만으로는 안 되는 이유: 기준점 이동은 대개 GPS 가 걸어가는
   * 것이라, 그때마다 지도를 세게 당기면 훑어보던 화면을 빼앗깁니다. 그래서
   * NaverMap 은 첫 기준점과 추적 중(followCenter)에만 따라갑니다. 이 값은
   * "이번 이동은 사용자가 시킨 것" 임을 따로 말합니다.
   */
  centerNonce?: number;
  /**
   * nonce 가 바뀌면 이 좌표로 이동합니다. zoom 이 있으면 그 레벨까지 당기고
   * (지점명 검색), 없으면 보던 줌을 그대로 둡니다 ('내 위치로 이동').
   *
   * 선택 센터링(selectedId)과 다른 점은 줌입니다 — 목록 줄을 눌러 훑는 동안은
   * 보던 줌을 지키지만, "○○ 위치로 이동" 은 그 지점 한 곳을 보러 가는 것이라
   * 거리(street) 수준까지 당깁니다. 기준점(center)은 건드리지 않습니다.
   */
  focusPoint?: { lat: number; lng: number; zoom?: number; nonce: number } | null;
}

// 지도 SDK 는 브라우저 전용이라 SSR 을 끈다.
const NaverMap = dynamic(() => import('./NaverMap'), { ssr: false });
const FallbackMap = dynamic(() => import('./FallbackMap'), { ssr: false });

export default function MapPane(props: MapPaneProps) {
  return hasNaverKey ? <NaverMap {...props} /> : <FallbackMap {...props} />;
}
