import type { ChartComment } from './community-types';

/**
 * 등급이 아니라 "상태"인 분류들.
 *
 * unique · undecided 는 투표 집계(recalc_chart_stats)가 tier_code 에 써 주고,
 * special 은 표시 인원으로 **읽을 때** 판정합니다 — isSpecialChart().
 */
export const UNIQUE_CODE = 'unique';
export const UNDECIDED_CODE = 'undecided';
export const SPECIAL_CODE = 'special';

/**
 * 특수 패턴 칸으로 갈 조건. 한 사람이 켜면 모두에게 보이는 것을 막으려고
 * 인원 합의(기본 3명)를 둡니다 — 투표의 min_votes 와 같은 성격이지만 값은 따로입니다.
 *
 * **서버(서열표 묶기)와 화면(현재 등급 표시)이 이 함수를 같이 씁니다.** 규칙을
 * 두 벌로 두면 서열표에 놓인 칸과 패널이 보여주는 등급이 어긋납니다.
 */
export function isSpecialChart(
  chart: { specialCount: number },
  settings: { specialMin: number },
): boolean {
  return chart.specialCount >= settings.specialMin;
}

/** 서열표에서 이 채보가 놓이는 칸의 코드 */
export function tierCodeOf(
  chart: { specialCount: number; tierCode: string | null },
  settings: { specialMin: number },
): string {
  if (isSpecialChart(chart, settings)) return SPECIAL_CODE;
  return chart.tierCode ?? UNDECIDED_CODE;
}

/** 게임별 플레이 모드 (펌프 S/D/CO, 사볼 NOV/ADV/EXH/MXM …) */
export interface GameMode {
  code: string;
  label: string;
}

/** 서열표를 가진 게임 = tier_settings 가 등록된 기종 */
export interface TierGame {
  machineId: number;
  name: string;
  shortName: string;
  modes: GameMode[];
  chartCount: number;
}

/** 등급 구간표 1행 */
export interface TierGrade {
  code: string;
  label: string;
  anchor: number;
  sortOrder: number;
}

/** 게임별 집계 임계값 */
export interface TierSettings {
  machineId: number;
  voteMin: number;
  voteMax: number;
  /** 투표 슬라이더 눈금 간격 (화면 입력 단위 — 집계에는 쓰이지 않는다) */
  voteStep: number;
  tierStep: number;
  minVotes: number;
  minConvergence: number;
  /** 이 수 이상이 표시하면 '특수패턴' 칸으로 간다 */
  specialMin: number;
  /**
   * 채보 목록을 어느 버전 기준으로 모았는지 (펌프 = 'PHOENIX 2').
   *
   * null 이면 화면이 그 줄을 그리지 않습니다 — 게임마다 기준이 다르고, 아직
   * 정해지지 않은 게임도 있어서 문구를 하드코딩하지 않습니다 (migrate-044).
   */
  chartBasis: string | null;
  /**
   * machine_modes 가 모드가 아니라 **난이도**인가 (사볼 = true, 펌프 = false).
   *
   * true 면 보드가 레벨만으로 정해지고(EXH18 과 MXM18 이 한 표에 섞임) 난이도는
   * 곡명 뒤 대괄호로 표시합니다. 펌프의 Single/Double 은 발판 쓰는 방식이 달라
   * 비교 대상이 아니므로 false 로 두고 지금까지처럼 모드별 보드를 유지합니다.
   * 근거는 migrate-045.
   */
  modeIsDifficulty: boolean;
}

/** 레벨 선택기 한 항목. mode 가 null 이면 레벨만으로 보드가 정해지는 게임이다. */
export interface TierLevelOption {
  mode: string | null;
  level: number;
  chartCount: number;
}

export interface ChartSummary {
  id: number;
  title: string;
  artist: string | null;
  /**
   * machine_modes.code. 게임마다 값이 달라 유니온으로 고정하지 않는다.
   * null = 난이도 미표기 — 출처 표에 난이도가 없던 채보다 (migrate-047).
   */
  mode: string | null;
  level: number;
  voteCount: number;
  /** 투표가 없으면 null */
  avgVote: number | null;
  /** 투표 2건 미만이면 null */
  convergence: number | null;
  /** tier_grades.code | 'unique' | 'undecided' */
  tierCode: string | null;
  /**
   * 이 채보를 특수 패턴으로 표시한 사람 수. settings.specialMin 이상이면
   * 등급과 상관없이 '특수패턴' 칸에 놓인다 — 판정은 isSpecialChart().
   * tierCode 는 그대로 남으므로 임계값 아래로 내려가면 원래 등급으로 돌아간다.
   */
  specialCount: number;
  /** 현재 플레이어 기준 */
  myClear: boolean;
  myVote: number | null;
  /** 내가 특수 패턴으로 표시했는지 */
  mySpecial: boolean;
}

/** 등급 하나와 거기 속한 채보들 */
export interface TierGroup {
  code: string;
  label: string;
  anchor: number | null;
  charts: ChartSummary[];
}

export interface TierBoard {
  settings: TierSettings;
  game: TierGame;
  /**
   * 이 보드가 어느 모드의 것인가. `settings.modeIsDifficulty` 인 게임에서는
   * 레벨만으로 보드가 정해지므로 **null** 입니다 (여러 난이도가 함께 실립니다).
   */
  mode: string | null;
  modeLabel: string | null;
  level: number;
  /** 최상 → 최하 순, 마지막에 개인차 / 특수패턴 / 미정 */
  groups: TierGroup[];
  totalCharts: number;
}

export interface ChartDetail extends ChartSummary {
  /** 익명화된 투표값 전체 (분포 히스토그램용) */
  votes: number[];
  grades: TierGrade[];
  settings: TierSettings;
  /** 이 채보가 속한 게임 — 게임마다 등급 단계 수와 투표 범위가 다르다 */
  machineId: number;
  machineName: string;
  /** null = 난이도 미표기 (ChartSummary.mode 참고) */
  modeLabel: string | null;
  /** 채보 평가 (코멘트 + 성향 태그) */
  comments: ChartComment[];
}

export interface Player {
  id: number;
  nickname: string;
}
