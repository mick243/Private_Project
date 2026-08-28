/**
 * 제보 / 리뷰 / 채보 평가의 공용 타입과 라벨 규칙.
 *
 * lib/reports.ts 같은 서버 모듈은 getDb() → fs 를 끌고 오므로 클라이언트에서
 * import 할 수 없습니다. 서버·클라이언트가 같은 문구와 같은 구간을 쓰도록
 * 순수 값만 이 파일에 모읍니다 (lib/types.ts · lib/tier-types.ts 와 같은 규칙).
 */

// ─── 기종 제보 ───────────────────────────────────────────────

export type ReportKind = 'presence' | 'absence' | 'queue' | 'condition';

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  presence: '이 게임 있어요',
  absence: '없어졌어요',
  queue: '대기 인원',
  condition: '기체 컨디션',
};

export interface MachineReport {
  id: number;
  arcadeId: number;
  arcadeName: string;
  machineId: number;
  machineName: string;
  machineShortName: string;
  /**
   * 컨디션 제보가 가리키는 기체. 대기·기종변동 제보는 null 입니다.
   * 기체가 지워진 옛 컨디션 제보도 null 이 됩니다 (제보는 남기고 집계에서만 뺍니다).
   */
  cabinetId: number | null;
  /** 그 기체의 표시 번호(1호기·2호기). cabinetId 가 null 이면 null */
  cabinetNo: number | null;
  /**
   * 제보 당시가 아니라 **지금** 그 오락실의 그 기종 대수.
   *
   * 대기 구간('보통'·'많음')이 기체당 인원으로 정해지므로(WAIT_LEVELS) 피드도
   * 이 값을 알아야 상세 화면과 같은 문구가 나옵니다. 기종이 그 사이 빠졌으면
   * 0 이고, 그때는 1대로 봅니다 (waitPerCabinet).
   */
  cabinetCount: number;
  /** 익명 제보이거나 탈퇴한 플레이어면 null */
  playerId: number | null;
  nickname: string | null;
  kind: ReportKind;
  waitCount: number | null;
  condition: number | null;
  comment: string | null;
  createdAt: string;
}

/**
 * machine_live 뷰 1행 — TTL 안의 대기 제보로 만든 "지금" 상태.
 *
 * 대기는 기종 단위입니다. 같은 게임이 2대여도 줄은 게임 앞에 서고, 제보하는
 * 사람에게 몇 호기 줄인지까지 고르게 하면 제보가 흩어져 집계가 서지 않습니다.
 * 기체마다 다른 값(컨디션)은 CabinetLive 로 따로 옵니다.
 */
export interface MachineLive {
  /**
   * 수명 안의 대기 제보 중 **가장 큰 값**. 없으면 null.
   *
   * 엇갈리는 제보는 가장 긴 줄을 말한 쪽으로 붙입니다 — 적게 알려주면 갔다가
   * 줄 서서 돌아오지만, 많게 알려주면 안 가고 마는 정도입니다.
   * 집계는 뷰(machine_live)가 하므로 화면에서 다시 가공하지 않습니다.
   */
  waitCount: number | null;
  waitReports: number;
  waitReportedAt: string | null;
}

/**
 * cabinet_condition 뷰 1행 — 기체 1대의 컨디션 종합.
 *
 * 등록 컨디션과 제보를 한 덩어리로 봅니다. 등록값을 제보 한 건처럼 세어 함께
 * 평균내고 **반올림한 정수**로 내보냅니다 — 1~5 다섯 칸짜리 눈금에 "4.67" 은
 * 있지도 않은 정밀도를 주장합니다. 집계 규칙은 db/views.sql 에 있습니다.
 */
export interface CabinetCondition {
  /** 등록값 + 제보를 종합해 반올림한 1~5 */
  value: number;
  /** 종합에 들어간 **제보** 수. 등록값은 세지 않으므로 0 일 수 있습니다 */
  reports: number;
  /** 가장 최근 제보 시각. 제보가 하나도 없으면 null */
  reportedAt: string | null;
}

/** 제보 등록 결과 — 임계값이 차서 arcade_machines 에 반영됐는지 */
export type PresenceOutcome = 'added' | 'removed' | null;

/**
 * 대기 인원 → 문구.
 *
 * "X명"만 보여주면 3명이 많은 건지 감이 안 오고, "많아요"만 받으면 집계가
 * 안 됩니다. 그래서 저장은 숫자로 하고 표시할 때 구간을 붙입니다.
 * 구간 경계는 UI 문구이므로 DB(report_settings) 가 아니라 여기 둡니다.
 *
 * ─────────────────────────────────────────────────────────────
 * 경계는 **기체 1대가 감당하는 인원**으로 잽니다 (대기 인원 ÷ 대수).
 *
 * 같은 "6명 대기" 가 1대뿐인 곳에서는 여섯 판을 기다리는 것이고 3대인 곳에서는
 * 두 판입니다. 사람이 실제로 기다리는 시간은 대수로 나눈 값에 붙으므로, 머릿수
 * 그대로 구간을 나누면 기체가 많은 곳이 억울하게 '많음' 이 됩니다.
 *
 * 그리고 그 경계를 **낮게** 둡니다 — 기체당 2명이면 이미 '보통', 3명이면 '많음'
 * 입니다. 리듬게임은 한 판이 짧지 않고, 내 앞에 한 명만 있어도 서서 기다리는
 * 일은 금세 지칩니다. 예전 경계(머릿수 4명까지 '보통', 7명까지 '많음')는
 * 갈 만한 곳을 고르는 데 도움이 되지 않았습니다.
 *
 * min 은 **포함**입니다 (기체당 2.0명 → '보통'). 0 명은 '바로 가능' 이고,
 * 0 명이 아니면 아무리 작아도(3대에 1명 = 0.33) 최소 '대기 있음' 입니다 —
 * 기다리는 사람이 있는데 '바로 가능' 이라고 말하면 안 됩니다. 이 첫 구간을
 * '여유' 라고 부르지 않는 이유도 같습니다: 줄이 있는데 '여유' 라고 읽히면
 * "가면 바로 할 수 있다" 쪽으로 오해합니다. 사실만 적습니다 — 대기가 있다.
 */
export const WAIT_LEVELS = [
  /** 기체당 인원의 하한(포함). 첫 칸은 "대기 없음" 전용이다 */
  { min: 0, label: '바로 가능', tone: 'free' },
  { min: 1, label: '대기 있음', tone: 'low' },
  { min: 2, label: '보통', tone: 'mid' },
  { min: 3, label: '많음', tone: 'high' },
  { min: 4, label: '매우 많음', tone: 'full' },
] as const;

export type WaitTone = (typeof WAIT_LEVELS)[number]['tone'];

/** 기체 1대가 감당하는 대기 인원. 대수를 모르면 1대로 봅니다 (모르는 쪽이 불리하게) */
export function waitPerCabinet(count: number, cabinetCount?: number | null): number {
  const cabinets = cabinetCount && cabinetCount > 0 ? cabinetCount : 1;
  return count / cabinets;
}

export interface WaitLevel {
  label: string;
  tone: WaitTone;
  /** WAIT_LEVELS 안에서의 자리 — 추천 점수가 이 값을 씁니다 (lib/recommend.ts) */
  index: number;
}

/**
 * 대기 인원과 기체 대수로 구간을 정합니다.
 *
 * cabinetCount 를 넘기지 않으면 1대로 봅니다. 대수를 모르는 자리(제보 목록 등)에서
 * 후하게 잡으면 "괜찮다더니 한참 기다렸다" 가 되므로, 모를 때는 불리하게 봅니다.
 */
export function waitLevel(count: number, cabinetCount?: number | null): WaitLevel {
  const at = (index: number): WaitLevel => ({ ...WAIT_LEVELS[index], index });
  if (count <= 0) return at(0);

  const per = waitPerCabinet(count, cabinetCount);
  // 0 명이 아니면 최소 '대기 있음'(1) 부터 시작해, min 을 넘는 마지막 구간을 고른다.
  let index = 1;
  for (let i = 2; i < WAIT_LEVELS.length; i += 1) {
    if (per >= WAIT_LEVELS[i].min) index = i;
  }
  return at(index);
}

/**
 * 대기 인원 선택지 — 없음(0) ~ 12명, 그리고 "12명+".
 *
 * 처음에는 0·1·2·3·5·8 여섯 개를 버튼으로 늘어놓고 8 을 "8명+" 로 썼습니다.
 * 4명·6명·7명처럼 사이값을 고를 수가 없어서 실제 인원과 어긋났고, 버튼을 다
 * 채우면 폼이 두세 줄로 접혔습니다. 그래서 드롭다운으로 바꿨습니다.
 *
 * 상한은 화면이 아니라 이 상수가 정합니다 — DB(machine_reports.wait_count)는
 * 0~99 까지 받으므로, 더 늘리고 싶으면 여기만 고치면 됩니다.
 */
export const WAIT_MAX = 12;

/**
 * "12명 초과" 를 뜻하는 값. 드롭다운 마지막 항목이 이 값을 보냅니다.
 *
 * 상한값(12) 자체를 "12 이상" 으로 쓰지 않는 이유: 그러면 **정확히 12명인 줄을
 * 12명이라고 말할 수단이 없어집니다.** 센 사람이 12를 골랐는데 화면에 '12명+'
 * 로 뜨면, 실제로는 정확한 값인데 어림값처럼 읽힙니다. 그래서 12 는 12 그대로
 * 두고 그 위에 항목을 하나 더 답니다.
 *
 * DB(machine_reports.wait_count)는 0~99 를 받으므로 스키마 변경이 필요 없습니다.
 */
export const WAIT_OVER = WAIT_MAX + 1;

/** 없음(0) ~ 12명, 그리고 12명+ */
export const WAIT_CHOICES: number[] = Array.from({ length: WAIT_OVER + 1 }, (_, n) => n);

/**
 * 대기 인원을 화면에 찍는 문구. **고르는 쪽과 보여주는 쪽이 같은 규칙을 써야**
 * "12명+ 을 골랐는데 목록에는 13명으로 뜬다" 같은 어긋남이 안 생깁니다.
 *
 * WAIT_OVER 는 숫자가 아니라 "상한을 넘었다" 는 표시이므로 '12명+' 로 읽습니다.
 *
 * 그 위의 값(14~99)은 화면에서 만들 수 없고 API 로만 들어옵니다. 그건 숫자
 * 그대로 보여줍니다 — 가진 정보를 굳이 뭉갤 이유가 없고, 장난 제보(99명)가
 * 그대로 드러나야 어뷰징이 보이기 때문입니다.
 */
export function waitCountLabel(count: number): string {
  return count === WAIT_OVER ? `${WAIT_MAX}명+` : `${count}명`;
}

/** 드롭다운에 찍히는 문구. 0 은 "0명" 이 아니라 "없음" 입니다 */
export function waitChoiceLabel(count: number): string {
  return count === 0 ? '없음' : waitCountLabel(count);
}

/** '3분 전' / '2일 전'. 제보는 언제 적인지가 값 자체만큼 중요합니다. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return '방금';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}개월 전`;
}

// ─── 오락실 리뷰 ─────────────────────────────────────────────

export interface ArcadeReview {
  id: number;
  arcadeId: number;
  playerId: number;
  nickname: string;
  rating: number;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 채보 평가 ───────────────────────────────────────────────

/**
 * 채보 성향 태그 화이트리스트.
 *
 * 자유 입력으로 두면 '폭타' / '폭타패턴' / '폭타형' 이 각각 쌓여서 나중에
 * 집계가 불가능해집니다. 게임 공통으로 통하는 말만 고정 목록으로 둡니다.
 *
 * '물렙' · '불렙' · '개인차' 는 **뺐습니다** — 채보의 성향이 아니라 난이도 평가라
 * 서열표(투표 · 개인차 등급)가 이미 숫자로 말해 주는 것이고, 태그로 또 받으면
 * 같은 말이 두 곳에서 엇갈립니다. '기습' 도 뺐습니다 (migrate-036).
 * 목록에서 뺀 태그는 저장된 평가에서도 지웁니다 — 안 지우면 그 평가를 쓴 사람이
 * 자기 글을 수정할 때 화이트리스트 검증에 걸려 저장이 막힙니다.
 */
/**
 * 어느 게임에서나 통하는 태그. 새 게임이 CHART_TAGS_BY_MACHINE 에 등록되기
 * 전까지의 기본값이기도 합니다.
 */
const COMMON_CHART_TAGS = [
  '폭타',
  '연타',
  // 속도 · 기믹
  '변속',
  '저속',
  '기믹',
  // 판정 · 구간
  '판정',
  '초살',
  '후살',
] as const;

/**
 * **게임마다 목록이 다릅니다.** 무엇으로 어려운지가 게임마다 달라서입니다.
 *
 *   펌프 — 발판을 밟는 몸동작 (떨기 · 틀기 · 체중이동 · 체력)
 *   사볼 — 손으로 건반과 노브를 다루는 것 (지력 · 건반 · 노브 · 트릴)
 *
 * 사볼에서 지력·건반·노브를 맨 앞(1·2·3)에 두는 이유: 이 셋은 다른 태그와
 * 성격이 다릅니다. 나머지가 "이런 패턴이 나온다" 라면 이 셋은 **"무엇이 어려운
 * 채보인가" 를 가르는 축**이라, 커뮤니티 난이도표도 이 축으로 곡을 먼저 나눕니다.
 */
export const CHART_TAGS_BY_MACHINE: Record<number, readonly string[]> = {
  // 펌프 잇 업 — 지금까지의 목록 그대로
  1: [
    '폭타',
    '떨기',
    '틀기',
    '연타',
    '체중이동',
    '체력',
    '변속',
    '저속',
    '기믹',
    '판정',
    '초살',
    '후살',
  ],
  // 사운드 볼텍스 — 발판 용어(떨기·틀기·체중이동·체력)를 빼고 손 쪽 용어로.
  3: ['지력', '건반', '노브', '트릴', ...COMMON_CHART_TAGS],
};

/** 그 게임에서 고를 수 있는 태그. 등록되지 않은 게임은 공통 태그만. */
export function chartTagsFor(machineId: number): readonly string[] {
  return CHART_TAGS_BY_MACHINE[machineId] ?? COMMON_CHART_TAGS;
}

/**
 * 저장 검증용 **합집합**.
 *
 * 게임별로 좁혀서 검증하지 않는 이유: 화이트리스트의 목적은 '폭타/폭타패턴/
 * 폭타형' 같은 표기 난립을 막아 집계를 가능하게 하는 것이지 권한 검사가
 * 아닙니다. 게임별로 좁히면 목록을 손볼 때마다 **이미 저장된 평가를 그 작성자가
 * 수정할 수 없게 되는** 함정이 생깁니다 (migrate-036 이 겪은 문제).
 * 고르는 쪽은 화면이 게임별 목록으로 좁힙니다.
 */
export const CHART_TAGS = [
  '폭타',
  '떨기',
  '틀기',
  '연타',
  '체중이동',
  '체력',
  '변속',
  '저속',
  '기믹',
  '판정',
  '초살',
  '후살',
  '지력',
  '건반',
  '노브',
  '트릴',
] as const;

export type ChartTag = (typeof CHART_TAGS)[number];

export interface ChartComment {
  id: number;
  chartId: number;
  playerId: number;
  nickname: string;
  body: string;
  tags: string[];
  /**
   * 작성자가 이 채보를 클리어했는지.
   *
   * 투표값은 함께 내보내지 않습니다 — 투표 분포를 익명으로 유지하기로 한 결정
   * (lib/tier.ts getChartDetail) 이 평가란을 통해 뚫리면 안 되기 때문입니다.
   */
  cleared: boolean;
  createdAt: string;
  updatedAt: string;
}
