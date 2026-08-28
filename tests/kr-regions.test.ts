import { describe, expect, it } from 'vitest';
import {
  ARCADE_KEYWORDS,
  buildArcadeQueries,
  countRegions,
  KR_REGIONS,
} from '@/lib/kr-regions';

describe('KR_REGIONS', () => {
  it('17개 시·도가 다 있다', () => {
    expect(Object.keys(KR_REGIONS)).toHaveLength(17);
  });

  it('시·군·구 수가 실제 행정구역 수(약 229)와 비슷하다', () => {
    // 정확히 못 박지 않는 이유: 행정구역은 통합·편입으로 바뀝니다. 크게 어긋나면
    // (지역을 통째로 빼먹었거나 중복해 넣었으면) 잡히는 정도로 둡니다.
    expect(countRegions()).toBeGreaterThan(215);
    expect(countRegions()).toBeLessThan(245);
  });

  it('같은 시·도 안에 같은 이름이 두 번 들어가지 않았다', () => {
    for (const [sido, list] of Object.entries(KR_REGIONS)) {
      expect(new Set(list).size, `${sido} 에 중복이 있다`).toBe(list.length);
    }
  });

  it('서울은 25개 자치구다', () => {
    expect(KR_REGIONS.서울).toHaveLength(25);
  });
});

describe('buildArcadeQueries', () => {
  it('질의 수 = 시·군·구 × 표현', () => {
    expect(buildArcadeQueries()).toHaveLength(countRegions() * ARCADE_KEYWORDS.length);
  });

  it('시·도 + 시·군·구 + 표현 순으로 붙는다', () => {
    const qs = buildArcadeQueries({ 서울: ['강남구'] }, ['오락실']);
    expect(qs).toEqual(['서울 강남구 오락실']);
  });

  it('시·도명이 겹치면 한 번만 쓴다 — "세종 세종시" 를 만들지 않는다', () => {
    const qs = buildArcadeQueries({ 세종: ['세종시'] }, ['오락실']);
    expect(qs).toEqual(['세종시 오락실']);
  });

  it('지역을 바깥 루프로 돈다 — 중단 지점이 "어느 지역까지" 로 읽혀야 한다', () => {
    const qs = buildArcadeQueries({ 서울: ['강남구', '강동구'] }, ['오락실', '게임센터']);
    expect(qs).toEqual([
      '서울 강남구 오락실',
      '서울 강남구 게임센터',
      '서울 강동구 오락실',
      '서울 강동구 게임센터',
    ]);
  });

  it('질의에 중복이 없다 — 중복은 곧 호출 낭비다', () => {
    const qs = buildArcadeQueries();
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('전국 질의가 하루 상한(20,000)보다 훨씬 적다', () => {
    // 하루에 다 못 돌 규모라면 '이어서 하기' 가 항상 걸리게 되므로,
    // 목록을 늘릴 때 이 선을 넘지 않는지 확인합니다.
    expect(buildArcadeQueries().length).toBeLessThan(20_000);
  });
});
