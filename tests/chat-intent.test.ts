import { describe, expect, it } from 'vitest';
import { isArcadeSearchIntent } from '@/lib/chat-types';

/**
 * 이 판별이 대화의 다음 화면을 정합니다 — 걸리면 우선순위 드롭다운이 뜨고,
 * 안 걸리면 모델에게 질문이 넘어갑니다. 그래서 규칙을 못 박아 둡니다.
 */
describe('isArcadeSearchIntent', () => {
  it('장소 + 행동이 함께 있으면 탐색이다', () => {
    for (const text of [
      '내 주변 오락실 찾아줘',
      '오락실 추천해줘',
      '가까운 게임센터 알려줘',
      '아케이드 어디 갈까',
      '갈만한 오락실 있어?',
      '오락실 탐색',
    ]) {
      expect(isArcadeSearchIntent(text), text).toBe(true);
    }
  });

  it('장소만 있는 질문은 탐색이 아니다 — 그냥 물어본 것이다', () => {
    for (const text of ['홍대 오락실 대기 어때?', '이 오락실 펌프 몇 대야?', '오락실 많네']) {
      expect(isArcadeSearchIntent(text), text).toBe(false);
    }
  });

  it('"오락실 영업시간 알려줘" 는 탐색으로 샌다 — 알면서 그대로 둔 쪽이다', () => {
    // '알려' 를 행동 목록에서 빼면 이 문장은 안 걸리지만 "오락실 알려줘"
    // 라는 진짜 탐색 요청도 함께 놓칩니다. 폼이 잘못 떠도 무시하고 다시
    // 물으면 되지만, 놓치면 탐색을 시작할 방법이 없어집니다.
    expect(isArcadeSearchIntent('오락실 영업시간 알려줘')).toBe(true);
  });

  it('행동만 있는 질문은 탐색이 아니다', () => {
    for (const text of [
      '이 곡 채보 찾아줘',
      '펌프 신곡 추천해줘',
      '사볼 공략 알려줘',
    ]) {
      expect(isArcadeSearchIntent(text), text).toBe(false);
    }
  });

  it('우선순위·재탐색은 장소 말 없이도 바로 폼을 연다', () => {
    expect(isArcadeSearchIntent('우선순위 바꿀래')).toBe(true);
    expect(isArcadeSearchIntent('다시 탐색해줘')).toBe(true);
  });

  it('빈 입력과 공백은 탐색이 아니다', () => {
    expect(isArcadeSearchIntent('')).toBe(false);
    expect(isArcadeSearchIntent('   ')).toBe(false);
  });

  it('띄어쓰기가 달라도 같게 본다', () => {
    expect(isArcadeSearchIntent('갈  만한   오락실')).toBe(true);
  });
});
