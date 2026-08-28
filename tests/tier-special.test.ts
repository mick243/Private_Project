import { describe, expect, it } from 'vitest';
import {
  SPECIAL_CODE,
  UNDECIDED_CODE,
  UNIQUE_CODE,
  isSpecialChart,
  tierCodeOf,
} from '@/lib/tier-types';

const settings = { specialMin: 3 };

describe('isSpecialChart — 특수 패턴은 인원 합의로 정해진다', () => {
  it('임계값 미만은 특수 패턴이 아니다', () => {
    expect(isSpecialChart({ specialCount: 0 }, settings)).toBe(false);
    expect(isSpecialChart({ specialCount: 2 }, settings)).toBe(false);
  });

  it('임계값과 같으면 특수 패턴이다 — 3명 "이상"', () => {
    expect(isSpecialChart({ specialCount: 3 }, settings)).toBe(true);
  });

  it('임계값을 넘어도 특수 패턴이다', () => {
    expect(isSpecialChart({ specialCount: 12 }, settings)).toBe(true);
  });

  it('임계값은 게임마다 다를 수 있다', () => {
    expect(isSpecialChart({ specialCount: 3 }, { specialMin: 5 })).toBe(false);
    expect(isSpecialChart({ specialCount: 5 }, { specialMin: 5 })).toBe(true);
  });
});

describe('tierCodeOf — 특수 패턴이 투표 등급보다 앞선다', () => {
  it('임계값을 넘으면 투표 등급이 있어도 특수패턴 칸', () => {
    expect(tierCodeOf({ specialCount: 3, tierCode: 'a' }, settings)).toBe(SPECIAL_CODE);
    expect(tierCodeOf({ specialCount: 3, tierCode: UNIQUE_CODE }, settings)).toBe(SPECIAL_CODE);
    expect(tierCodeOf({ specialCount: 3, tierCode: null }, settings)).toBe(SPECIAL_CODE);
  });

  it('임계값 미만이면 투표 등급을 그대로 쓴다 — 표시가 줄면 되돌아온다', () => {
    expect(tierCodeOf({ specialCount: 2, tierCode: 'a' }, settings)).toBe('a');
    expect(tierCodeOf({ specialCount: 2, tierCode: UNIQUE_CODE }, settings)).toBe(UNIQUE_CODE);
  });

  it('등급이 없으면 미정 — tier_code 가 NULL 인 새 채보', () => {
    expect(tierCodeOf({ specialCount: 0, tierCode: null }, settings)).toBe(UNDECIDED_CODE);
  });
});
