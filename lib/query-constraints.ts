/**
 * 탐색 트리거 문장에서 **제약**을 뽑아냅니다.
 *
 * "짱오락실 서울대점에 펌프 대기가 많은데 가까운 오락실 찾아줘" 같은 문장은
 * 의도 판별(chat-types.ts)로 우선순위 폼에 도착하는데, 폼 흐름은 문장을
 * 버립니다. 그러면 문장에 담긴 세 가지 — 어느 기종인지, 지금 어디에 있는지,
 * 그곳을 빼야 한다는 것 — 가 전부 사라지고, 거리 1순위 탐색은 **지금 있는
 * 바로 그곳**을 1위로 올립니다. 여기서 그 제약을 건져 탐색에 넘깁니다.
 *
 * 문장에 언급된 오락실은 "사용자가 지금 있는 곳"으로 봅니다 — 기준점으로
 * 삼고 결과에서는 뺍니다. 오인식일 수 있으므로 화면(ChatBot)이 이 판단을
 * 보여 주고 끌 수 있게 합니다.
 *
 * 순수 함수만 둡니다 — 클라이언트 번들에 들어갑니다 (lib/recommend.ts 와
 * 같은 규칙).
 */

import type { Arcade, Machine } from './types';

/** 문장에 언급된 오락실 — 탐색의 기준점이자 제외 대상 */
export interface MentionedArcade {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface ChatConstraints {
  arcade: MentionedArcade | null;
  /** 문장에 언급된 기종. 비어 있으면 기종 제약 없음 */
  machineIds: number[];
  /** 위 기종들의 축약명 — 말풍선에 그대로 적습니다 */
  machineNames: string[];
}

/** 이름·문장을 같은 꼴로 — 대소문자와 띄어쓰기는 사람마다 다릅니다 */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

/**
 * 이 말들로 **시작하는** 매칭은 그만큼을 넘어서야 인정합니다.
 *
 * "오락실"은 탐색 문장 거의 전부에 들어 있어서, '오락실나라' 같은 상호가
 * "오락실 나가서" 에 걸립니다. 잘못 걸리면 그 오락실이 결과에서 빠지므로
 * (없는 곳을 안 빼는 것보다 있는 곳을 빼는 쪽이 훨씬 나쁩니다) 보수적으로
 * 잡습니다.
 */
const GENERIC_STARTS = ['오락실', '아케이드', '게임센터', '게임장', '게임', '겜'];

/** 이보다 짧은 일치는 우연입니다 */
const MIN_MATCH = 4;

/**
 * 상호 앞부분이 문장에 얼마나 들어 있는지 (글자 수, 없으면 0).
 *
 * 접두 매칭인 이유: 사람은 상호를 앞에서부터 적고 뒤(지점명)를 줄입니다 —
 * "짱오락실 서울대입구점"을 "짱오락실 서울대점"으로 쓰지, "오락실입구점"
 * 으로 쓰지는 않습니다.
 */
function prefixScore(name: string, sentence: string): number {
  const n = norm(name);
  for (let len = n.length; len >= MIN_MATCH; len--) {
    const prefix = n.slice(0, len);
    if (!sentence.includes(prefix)) continue;
    // 일치가 일반 명사를 살짝 넘는 정도면 상호를 알아본 게 아닙니다.
    const generic = GENERIC_STARTS.find((g) => prefix.startsWith(g));
    if (generic && len < generic.length + 2) return 0;
    return len;
  }
  return 0;
}

/**
 * 지점명 보너스 — 같은 상호의 지점들을 가릅니다.
 *
 * 뒤쪽 토큰("서울대입구점")도 접두로 봅니다. 꼬리의 '점'은 사람이 흔히
 * 떼거나 붙이므로 떼고 비교합니다 ("서울대점" ↔ "서울대입구점" → "서울대").
 */
function branchBonus(name: string, sentence: string): number {
  let bonus = 0;
  for (const raw of name.toLowerCase().split(/\s+/).slice(1)) {
    const token = norm(raw).replace(/점$/, '');
    for (let len = token.length; len >= 2; len--) {
      if (sentence.includes(token.slice(0, len))) {
        bonus += len;
        break;
      }
    }
  }
  return bonus;
}

/**
 * 문장이 가리키는 오락실 하나. 확신이 없으면 null 입니다 —
 * 최고점이 여럿이면(같은 이름의 지점들 등) 아무나 빼느니 아무도 안 뺍니다.
 */
export function findMentionedArcade(text: string, arcades: Arcade[]): MentionedArcade | null {
  const sentence = norm(text);
  if (sentence === '') return null;

  let best: Arcade | null = null;
  let bestPrimary = 0;
  let bestBonus = 0;
  let tied = false;

  for (const arcade of arcades) {
    const primary = prefixScore(arcade.name, sentence);
    if (primary === 0 || primary < bestPrimary) continue;
    const bonus = branchBonus(arcade.name, sentence);
    if (primary > bestPrimary || bonus > bestBonus) {
      best = arcade;
      bestPrimary = primary;
      bestBonus = bonus;
      tied = false;
    } else if (bonus === bestBonus && arcade.id !== best?.id) {
      tied = true;
    }
  }

  if (!best || tied) return null;
  return { id: best.id, name: best.name, lat: best.lat, lng: best.lng };
}

/** 문장에 언급된 기종들. 정식 명칭·축약명 어느 쪽이 있어도 잡습니다 */
export function findMentionedMachines(text: string, machines: Machine[]): Machine[] {
  const sentence = norm(text);
  if (sentence === '') return [];
  return machines.filter((m) => {
    const short = norm(m.shortName);
    const full = norm(m.name);
    return (
      (short.length >= 2 && sentence.includes(short)) ||
      (full.length >= 2 && sentence.includes(full))
    );
  });
}

export function extractConstraints(
  text: string,
  arcades: Arcade[],
  machines: Machine[],
): ChatConstraints {
  const mentioned = findMentionedMachines(text, machines);
  return {
    arcade: findMentionedArcade(text, arcades),
    machineIds: mentioned.map((m) => m.id),
    machineNames: mentioned.map((m) => m.shortName),
  };
}
