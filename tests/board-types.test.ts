import { describe, expect, it } from 'vitest';
import {
  defaultCategoryCode,
  isNotice,
  isPostSort,
  pageNumbers,
  totalPagesOf,
} from '@/lib/board-types';

describe('totalPagesOf', () => {
  it('글이 없어도 1페이지 — 0페이지짜리 목록은 그릴 수 없다', () => {
    expect(totalPagesOf(0, 20)).toBe(1);
  });

  it('딱 나누어떨어지면 빈 마지막 페이지를 만들지 않는다', () => {
    expect(totalPagesOf(40, 20)).toBe(2);
    expect(totalPagesOf(41, 20)).toBe(3);
  });
});

describe('pageNumbers — 번호 창', () => {
  it('전체가 창보다 작으면 전부 보여준다', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it('가운데에서는 현재 페이지가 창 중앙에 온다', () => {
    expect(pageNumbers(10, 20)).toEqual([7, 8, 9, 10, 11, 12, 13]);
  });

  it('앞쪽 끝에서 창이 잘리지 않는다 (0 이나 음수 페이지가 없다)', () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageNumbers(2, 20)[0]).toBe(1);
  });

  it('뒤쪽 끝에서도 창 크기를 유지한다 (마지막이 3칸만 남지 않는다)', () => {
    expect(pageNumbers(20, 20)).toEqual([14, 15, 16, 17, 18, 19, 20]);
  });

  it('어디서든 창 크기는 일정하다 — 버튼이 흔들리지 않는다', () => {
    for (let p = 1; p <= 20; p += 1) expect(pageNumbers(p, 20)).toHaveLength(7);
  });

  it('창 크기를 바꿀 수 있다', () => {
    expect(pageNumbers(5, 20, 3)).toEqual([4, 5, 6]);
  });
});

describe('isPostSort — SQL 에 들어가는 값이라 화이트리스트여야 한다', () => {
  it('아는 값만 통과시킨다', () => {
    expect(isPostSort('recent')).toBe(true);
    expect(isPostSort('popular')).toBe(true);
  });

  it('모르는 값과 주입 시도를 막는다', () => {
    expect(isPostSort('created_at; DROP TABLE posts')).toBe(false);
    expect(isPostSort('')).toBe(false);
    // 없어진 정렬. 링크가 남아 있어도 통과시키면 안 된다 —
    // parsePostListQuery 가 기본값 'recent' 로 되돌린다.
    expect(isPostSort('comments')).toBe(false);
  });
});

describe('defaultCategoryCode — 글쓰기 폼의 기본 말머리', () => {
  // db/seed-board.sql 과 같은 순서 (공지가 sort_order 0 이라 맨 앞)
  const CATEGORIES = [
    { code: 'notice', label: '공지' },
    { code: 'free', label: '자유' },
    { code: 'ask', label: '질문' },
  ];

  it('맨 앞이 공지여도 기본값으로 고르지 않는다 — 실수로 공지가 올라간다', () => {
    expect(defaultCategoryCode(CATEGORIES)).toBe('free');
  });

  it('공지가 없으면 첫 번째를 그대로 쓴다', () => {
    expect(defaultCategoryCode(CATEGORIES.slice(1))).toBe('free');
  });

  it('공지밖에 없으면 어쩔 수 없이 공지 — 선택 없는 폼보다는 낫다', () => {
    expect(defaultCategoryCode([{ code: 'notice', label: '공지' }])).toBe('notice');
  });

  it('말머리를 아직 못 받아왔으면 빈 문자열 (폼이 렌더는 된다)', () => {
    expect(defaultCategoryCode([])).toBe('');
  });
});

describe('isNotice', () => {
  it('공지 말머리만 참', () => {
    expect(isNotice('notice')).toBe(true);
    expect(isNotice('free')).toBe(false);
    expect(isNotice('')).toBe(false);
  });
});
