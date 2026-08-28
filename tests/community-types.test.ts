import { describe, expect, it } from 'vitest';
import {
  WAIT_CHOICES,
  WAIT_LEVELS,
  WAIT_MAX,
  WAIT_OVER,
  timeAgo,
  waitChoiceLabel,
  waitCountLabel,
  waitLevel,
  waitPerCabinet,
} from '@/lib/community-types';

describe('waitLevel — 기체당 대기 인원 → 구간', () => {
  it.each([
    [0, '바로 가능'],
    [1, '대기 있음'],
    [2, '보통'],
    [3, '많음'],
    [4, '매우 많음'],
    [99, '매우 많음'],
  ])('1대에 %i명 → %s', (count, label) => {
    expect(waitLevel(count).label).toBe(label);
  });

  it.each([
    // 같은 머릿수라도 대수로 나눈 값이 다르면 구간이 달라진다
    [6, 3, '보통'], // 기체당 2명
    [6, 2, '많음'], // 기체당 3명
    [6, 1, '매우 많음'], // 기체당 6명
    [9, 3, '많음'], // 기체당 3명
    [5, 2, '보통'], // 기체당 2.5명
    [7, 2, '많음'], // 기체당 3.5명
    [8, 2, '매우 많음'], // 기체당 4명
  ])('%i명 / %i대 → %s', (count, cabinets, label) => {
    expect(waitLevel(count, cabinets).label).toBe(label);
  });

  it('경계는 포함이다 — 기체당 2.0명이면 대기 있음이 아니라 보통', () => {
    expect(waitLevel(2, 1).label).toBe('보통');
    expect(waitLevel(4, 2).label).toBe('보통');
    expect(waitLevel(3, 1).label).toBe('많음');
    expect(waitLevel(6, 2).label).toBe('많음');
  });

  it('기다리는 사람이 있으면 아무리 적어도 "바로 가능" 이 아니다', () => {
    // 3대에 1명이면 기체당 0.33명이지만, 앞에 사람이 있는 건 사실이다
    expect(waitLevel(1, 3).label).toBe('대기 있음');
    expect(waitLevel(1, 12).label).toBe('대기 있음');
    expect(waitLevel(0, 3).label).toBe('바로 가능');
  });

  it('대수를 모르면(0·null·undefined) 1대로 본다 — 모를 때는 불리하게', () => {
    expect(waitLevel(2, 0).label).toBe('보통');
    expect(waitLevel(2, null).label).toBe('보통');
    expect(waitLevel(2).label).toBe('보통');
  });

  it('구간이 올라갈수록 index 도 올라간다 — 추천 점수가 이 값을 쓴다', () => {
    const idx = [0, 1, 2, 3, 4, 8].map((n) => waitLevel(n).index);
    expect(idx).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('WAIT_LEVELS 의 min 은 오름차순이다', () => {
    const mins = WAIT_LEVELS.map((l) => l.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });
});

describe('waitPerCabinet — 기체 1대가 감당하는 인원', () => {
  it('대수로 나눈다', () => {
    expect(waitPerCabinet(6, 3)).toBe(2);
    expect(waitPerCabinet(5, 2)).toBe(2.5);
  });

  it('대수가 없거나 0 이면 1대로 본다', () => {
    expect(waitPerCabinet(4)).toBe(4);
    expect(waitPerCabinet(4, 0)).toBe(4);
    expect(waitPerCabinet(4, null)).toBe(4);
  });
});

describe('WAIT_CHOICES — 드롭다운 선택지', () => {
  it('0부터 WAIT_MAX 까지 빠짐없이 만들고, 마지막에 "초과" 항목을 하나 더 단다', () => {
    expect(WAIT_CHOICES[0]).toBe(0);
    expect(WAIT_CHOICES).toContain(WAIT_MAX);
    expect(WAIT_CHOICES.at(-1)).toBe(WAIT_OVER);
    expect(WAIT_CHOICES).toHaveLength(WAIT_OVER + 1);
  });

  it('사이값을 고를 수 있다 — 버튼 방식에서 드롭다운으로 바꾼 이유', () => {
    expect(WAIT_CHOICES).toContain(4);
    expect(WAIT_CHOICES).toContain(6);
    expect(WAIT_CHOICES).toContain(7);
  });

  it('0 은 "0명" 이 아니라 "없음" 으로 읽힌다', () => {
    expect(waitChoiceLabel(0)).toBe('없음');
    expect(waitChoiceLabel(1)).toBe('1명');
  });

  it('상한값은 그대로 "12명" — 정확히 12명인 줄을 말할 수 있어야 한다', () => {
    expect(waitChoiceLabel(WAIT_MAX)).toBe('12명');
  });

  it('초과 항목은 "12명+" 으로 읽힌다', () => {
    expect(waitChoiceLabel(WAIT_OVER)).toBe('12명+');
  });
});

describe('waitCountLabel — 고르는 쪽과 보여주는 쪽이 같은 규칙', () => {
  it('드롭다운에서 고른 문구가 목록에 그대로 다시 나온다', () => {
    for (const n of WAIT_CHOICES.filter((c) => c !== 0)) {
      expect(waitCountLabel(n)).toBe(waitChoiceLabel(n));
    }
  });

  it('센티넬만 "+" 를 붙인다 — 그 위 값은 숫자 그대로', () => {
    // 14~99 는 화면에서 만들 수 없고 API 로만 들어온다. 장난 제보(99명)를
    // '12명+' 로 뭉개면 어뷰징이 눈에 안 띈다.
    expect(waitCountLabel(WAIT_OVER)).toBe('12명+');
    expect(waitCountLabel(99)).toBe('99명');
    expect(waitCountLabel(WAIT_MAX)).toBe('12명');
  });

  it('센티넬은 상한 바로 위 값이다 — 사이에 빈 숫자가 없어야 한다', () => {
    expect(WAIT_OVER).toBe(WAIT_MAX + 1);
  });
});

describe('timeAgo', () => {
  const base = Date.parse('2026-08-18T12:00:00Z');
  const ago = (ms: number) => timeAgo(new Date(base - ms).toISOString(), base);

  it.each([
    [30 * 1000, '방금'],
    [5 * 60_000, '5분 전'],
    [3 * 3_600_000, '3시간 전'],
    [2 * 86_400_000, '2일 전'],
    [70 * 86_400_000, '2개월 전'],
  ])('%i ms 전 → %s', (ms, expected) => {
    expect(ago(ms)).toBe(expected);
  });

  it('경계에서 단위가 바뀐다', () => {
    expect(ago(59_000)).toBe('방금');
    expect(ago(60_000)).toBe('1분 전');
    expect(ago(59 * 60_000)).toBe('59분 전');
    expect(ago(60 * 60_000)).toBe('1시간 전');
  });

  it('미래 시각을 음수로 표시하지 않는다 (서버·클라이언트 시계 차이)', () => {
    expect(timeAgo(new Date(base + 10_000).toISOString(), base)).toBe('방금');
  });
});
