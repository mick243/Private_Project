import { describe, expect, it } from 'vitest';
import type { NaverLocalItem } from '@/lib/naver-local';
import { isCityQuery, isPlaceQuery, pickPlace } from '@/lib/place-search';

/** 지역 검색 item 픽스처. 좌표는 WGS84 × 1e7 문자열 (toLatLng 주석) */
function item(over: Partial<NaverLocalItem> = {}): NaverLocalItem {
  return {
    title: '강남역 2호선',
    link: '',
    category: '교통,운수>지하철,전철',
    description: '',
    telephone: '',
    address: '서울특별시 강남구 역삼동 858',
    roadAddress: '서울특별시 강남구 강남대로 지하 396',
    mapx: '1270276368', // 127.0276368
    mapy: '374979517', //  37.4979517
    ...over,
  };
}

describe('pickPlace — 지역 검색 결과에서 이동할 곳 고르기', () => {
  it('첫 결과의 이름·주소·좌표를 돌려준다', () => {
    const place = pickPlace([item()]);
    expect(place).not.toBeNull();
    expect(place!.name).toBe('강남역 2호선');
    expect(place!.address).toBe('서울특별시 강남구 강남대로 지하 396');
    expect(place!.lat).toBeCloseTo(37.4979517, 6);
    expect(place!.lng).toBeCloseTo(127.0276368, 6);
  });

  it('title 의 검색어 강조 태그(<b>)를 벗긴다', () => {
    const place = pickPlace([item({ title: '<b>강남역</b> 2호선' })]);
    expect(place!.name).toBe('강남역 2호선');
  });

  it('도로명 주소가 없으면 지번 주소로', () => {
    const place = pickPlace([item({ roadAddress: '' })]);
    expect(place!.address).toBe('서울특별시 강남구 역삼동 858');
  });

  it('좌표가 깨진 항목은 건너뛰고 다음 항목을 쓴다', () => {
    const place = pickPlace([
      item({ title: '좌표 없음', mapx: '', mapy: '' }),
      item({ title: '한반도 밖', mapx: '1395000000', mapy: '356000000' }), // 도쿄
      item({ title: '성한 곳' }),
    ]);
    expect(place!.name).toBe('성한 곳');
  });

  it('이름이 태그뿐이면(벗기면 빈 문자열) 건너뛴다', () => {
    const place = pickPlace([item({ title: '<b></b>' }), item({ title: '다음 곳' })]);
    expect(place!.name).toBe('다음 곳');
  });

  it('쓸 만한 결과가 하나도 없으면 null', () => {
    expect(pickPlace([])).toBeNull();
    expect(pickPlace([item({ mapx: '0', mapy: '0' })])).toBeNull();
  });
});

describe('isPlaceQuery — 지역 검색에 물어볼 만한 검색어인지', () => {
  it('2자 이상만 묻는다 — 한 글자는 어디로 갈지 무작위다', () => {
    expect(isPlaceQuery('강')).toBe(false);
    expect(isPlaceQuery('강남')).toBe(true);
  });

  it('앞뒤 공백은 길이에 세지 않는다', () => {
    expect(isPlaceQuery('  강  ')).toBe(false);
    expect(isPlaceQuery(' 강남 ')).toBe(true);
    expect(isPlaceQuery('   ')).toBe(false);
  });

  it('60자를 넘으면 묻지 않는다', () => {
    expect(isPlaceQuery('가'.repeat(60))).toBe(true);
    expect(isPlaceQuery('가'.repeat(61))).toBe(false);
  });
});

describe('isCityQuery — 시 단위 검색인지 (지점 선택 없이 지역 이동만)', () => {
  it('시로 끝나면 시 단위로 본다', () => {
    expect(isCityQuery('청주시')).toBe(true);
    expect(isCityQuery('평택시')).toBe(true);
    expect(isCityQuery('고양시')).toBe(true);
  });

  it('시도 이름이 앞에 붙어도 시로 끝나면 마찬가지다', () => {
    expect(isCityQuery('충북 청주시')).toBe(true);
    expect(isCityQuery('경기도 평택시')).toBe(true);
  });

  it('광역시·특별시도 시다', () => {
    expect(isCityQuery('부산광역시')).toBe(true);
    expect(isCityQuery('서울특별시')).toBe(true);
  });

  it('시보다 좁게 짚은 검색어는 아니다 — 지점 매치가 쓸모 있는 자리다', () => {
    expect(isCityQuery('청주시 상당구')).toBe(false);
    expect(isCityQuery('평택시 자유로')).toBe(false);
    expect(isCityQuery('강남역')).toBe(false);
    expect(isCityQuery('북문로1가')).toBe(false);
  });

  it('오락실 이름 검색은 건드리지 않는다', () => {
    expect(isCityQuery('짱오락실')).toBe(false);
    expect(isCityQuery('모모스테이션')).toBe(false);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(isCityQuery('  청주시  ')).toBe(true);
  });
});
