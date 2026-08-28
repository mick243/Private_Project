/**
 * 챗봇의 공용 타입과 **의도 판별** 규칙.
 *
 * 서버 모듈(lib/chat-tools.ts)은 getDb → fs 를 끌고 오므로 클라이언트에서
 * import 할 수 없습니다. 화면과 API 가 같은 말을 쓰도록 순수 값만 모읍니다
 * (lib/community-types.ts 와 같은 규칙).
 */

import type { ChatConstraints } from './query-constraints';
import type { FactorKey } from './recommend';

// ─── 대화 ────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

/** 웹 검색으로 실제로 읽은 문서 — 답변 아래에 그대로 답니다 */
export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /**
   * 이 말풍선에 붙는 입력 폼.
   *
   * 'priority' 는 1·2·3순위 드롭다운입니다. 폼을 **메시지에 붙이는** 이유:
   * 대화가 길어져도 "그때 뭘 골랐는지" 가 그 자리에 남아야 하고, 새 탐색을
   * 시작하면 이전 폼은 잠긴 채로 기록으로 남습니다.
   */
  form?: 'priority';
  /** 폼이 이미 제출되어 잠겼는지 */
  formDone?: boolean;
  /**
   * 트리거 문장에서 뽑은 제약 (lib/query-constraints.ts).
   *
   * 폼 메시지에 붙여 두는 이유: 제약은 "그 문장"의 것입니다. 새 탐색 문장이
   * 오면 새 폼이 새 제약을 갖고, 이전 폼은 이전 제약과 함께 기록으로 남습니다.
   */
  constraints?: ChatConstraints;
  /** 언급된 오락실 제약을 사용자가 껐는지 — 추출은 오인식일 수 있습니다 */
  constraintOff?: boolean;
  sources?: ChatSource[];
  /** 답을 기다리는 중 (…) */
  pending?: boolean;
  /** 실패한 답변 — 다시 보내기를 붙입니다 */
  failed?: boolean;
}

/** 서버로 보내는 대화 기록 한 줄 (폼·상태는 서버가 알 필요 없습니다) */
export interface ChatTurn {
  role: ChatRole;
  text: string;
}

export interface ChatResponse {
  text: string;
  sources?: ChatSource[];
}

// ─── 의도 판별 ───────────────────────────────────────────────

/**
 * "오락실 찾아 줘" 인가?
 *
 * **모델에 맡기지 않고 여기서 판별합니다.** 이 갈림길 하나로 대화의 다음
 * 화면이 정해지는데(드롭다운이 뜨느냐 마느냐), 같은 문장에 매번 다른 판단이
 * 나오면 사용자는 무엇을 해야 폼이 뜨는지 배울 수가 없습니다. 그리고 이쪽
 * 경로는 API 키 없이도 끝까지 굴러가야 합니다 — 탐색이 이 앱의 본체입니다.
 *
 * 장소를 가리키는 말과 행동을 가리키는 말이 **둘 다** 있어야 합니다.
 * '오락실' 만으로 걸면 "홍대 오락실 대기 어때?" 같은 질문까지 폼으로 끌려가고,
 * '찾아줘' 만으로 걸면 "이 곡 채보 찾아줘" 가 걸립니다.
 */
const PLACE_WORDS = ['오락실', '아케이드', '게임센터', '게임장'];
const ACTION_WORDS = [
  '찾', '추천', '탐색', '골라', '어디', '갈만', '갈 만', '가까운', '알려',
];

/** 장소·행동을 따지지 않고 바로 폼을 여는 말 */
const DIRECT_WORDS = ['우선순위', '다시 탐색', '재탐색'];

export function isArcadeSearchIntent(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '') return false;
  if (DIRECT_WORDS.some((w) => t.includes(w))) return true;
  return (
    PLACE_WORDS.some((w) => t.includes(w)) && ACTION_WORDS.some((w) => t.includes(w))
  );
}

// ─── 우선순위 폼 ─────────────────────────────────────────────

/** 드롭다운 세 칸의 라벨. 순위 번호는 화면이 붙입니다 */
export const RANK_LABELS = ['1순위', '2순위', '3순위'] as const;

/**
 * 탐색 결과 — 챗봇이 "완료" 라고 말할 때 함께 넘기는 요약.
 * 지도·목록은 부모(ArcadeFinder)가 이미 같은 데이터를 들고 있으므로
 * 여기서는 **말로 할 몫**만 담습니다.
 */
export interface SearchOutcome {
  /** 반경 안에서 실제로 순위를 매긴 곳의 수 */
  total: number;
  /** 0 = 반경 전체 (기준점은 있지만 자르지 않음) */
  radiusKm: number;
  /** 기준점이 없으면 거리 항목이 빠진 채로 매겨졌다는 뜻 */
  hasOrigin: boolean;
  top: { name: string; score: number; distanceLabel: string | null; reason: string }[];
  /** 사용자가 기종 필터를 걸어 둔 경우 그 이름들 */
  machineNames: string[];
  /**
   * 기준점으로 삼고 결과에서 뺀 오락실 이름 (문장에 언급된 "지금 있는 곳").
   * 없으면 null. 말풍선이 이 사실을 밝혀야 "왜 그곳이 목록에 없지" 가 안 생깁니다.
   */
  excluded: string | null;
  /**
   * 탐색 순간 목록 조회가 아직 진행 중이었는지.
   *
   * 말풍선은 그때의 스냅샷이지만 목록·지도는 응답이 오면 다시 그려집니다.
   * 이 값이 true 면 "12곳" 이라고 말해 놓고 목록이 15곳이 되는 일이 생기므로,
   * 그럴 수 있다고 미리 적습니다.
   */
  stale: boolean;
}

export type { FactorKey };
