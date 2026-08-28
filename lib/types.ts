import type { CabinetCondition, MachineLive } from './community-types';

export interface Machine {
  id: number;
  name: string;
  shortName: string;
  category: 'rhythm' | 'etc';
}

/**
 * 기체 1대. 같은 게임이 2대면 이 객체가 2개이고, 컨디션은 각자 답니다 —
 * 한쪽 발판만 죽어 있는 오락실이 흔한데 기종당 컨디션 한 칸으로는 그 사실을
 * 적을 자리가 없습니다.
 */
export interface ArcadeCabinet {
  id: number;
  /** 같은 (오락실, 기종) 안에서의 표시 번호 — 1호기, 2호기. 항상 1..N */
  cabinetNo: number;
  /**
   * 1~5, 등록 시점의 기체 컨디션. null = 정보 없음.
   * 화면에 이 값을 그대로 쓰지 마세요 — 표시용은 아래 conditionSummary 입니다.
   * 이건 **수정 폼에서 고치는 원본**이고, 종합 평균의 재료 중 하나입니다.
   */
  condition: number | null;
  /**
   * 등록값 + 제보를 종합한 컨디션 (반올림 정수). 화면에 찍는 값입니다.
   * 등록값도 없고 제보도 없으면 null — 그때만 "정보 없음" 입니다.
   */
  conditionSummary: CabinetCondition | null;
}

/** 오락실이 보유한 기종 1건 */
export interface ArcadeMachine extends Machine {
  /** cabinets.length 와 같습니다. 목록에서 배열을 세지 않아도 되게 함께 내보냅니다 */
  cabinetCount: number;
  /** cabinetNo 오름차순 */
  cabinets: ArcadeCabinet[];
  /**
   * TTL 안의 제보로 만든 "지금" 대기 상태. 기종 단위입니다.
   * 유효한 제보가 없으면 null.
   */
  live: MachineLive | null;
}

export interface Arcade {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  openTime: string | null;
  closeTime: string | null;
  is24h: boolean;
  phone: string | null;
  note: string | null;
  machines: ArcadeMachine[];
  /** 좌표 기준 검색일 때만 채워짐 */
  distanceKm: number | null;
  /** 리뷰 평점 집계 캐시. 리뷰가 없으면 null */
  ratingAvg: number | null;
  reviewCount: number;
}

/** 오락실 생성/수정 페이로드 */
export interface ArcadeInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
  openTime: string | null;
  closeTime: string | null;
  is24h: boolean;
  phone: string | null;
  note: string | null;
  /**
   * 대수는 별도 숫자가 아니라 cabinets 배열의 길이입니다 — 둘을 다 받으면
   * "3대인데 컨디션은 2개" 같은 어긋난 입력을 검증해야 합니다.
   * 배열 순서가 그대로 1호기·2호기가 됩니다.
   */
  machines: { machineId: number; cabinets: { condition: number | null }[] }[];
}
