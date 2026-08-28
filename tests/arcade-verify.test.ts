import { describe, expect, it } from 'vitest';
import {
  MATCH_RADIUS_KM,
  SIDO_SHORT,
  buildQueries,
  cityOf,
  normalizeAddress,
  planAddressMerges,
  dongOf,
  rescueQueries,
  judge,
  regionOf,
} from '@/lib/arcade-verify';
import type { NaverLocalItem } from '@/lib/naver-local';

/** 지역 검색 item. 좌표는 mapx/mapy(정수 문자열) 로 옵니다 */
function item(over: Partial<NaverLocalItem> = {}): NaverLocalItem {
  return {
    title: '왕오락실',
    link: '',
    category: '스포츠,오락>오락실',
    description: '',
    telephone: '',
    address: '경기도 남양주시 다산동 1234',
    roadAddress: '경기도 남양주시 다산중앙로 100',
    // 서울 시청 근처 — 아래 테스트의 기준 좌표와 맞춰 씁니다
    mapx: '1269779692',
    mapy: '375665350',
    ...over,
  };
}

/** mapx/mapy 는 1e7 배 정수입니다 (lib/naver-local.ts toLatLng) */
function at(lat: number, lng: number): Pick<NaverLocalItem, 'mapx' | 'mapy'> {
  return { mapx: String(Math.round(lng * 1e7)), mapy: String(Math.round(lat * 1e7)) };
}

const SEOUL = { lat: 37.5665, lng: 126.9779 };

describe('regionOf', () => {
  it('시도를 축약하고 시·군·구를 뽑는다', () => {
    expect(regionOf('서울특별시 송파구 오금로11길 16')).toEqual({ sido: '서울', sgg: '송파구', city: '서울' });
    expect(regionOf('경기도 김포시 김포한강1로78번길 6-6')).toEqual({ sido: '경기', sgg: '김포시', city: '김포시' });
    expect(regionOf('강원특별자치도 태백시 황지로 112')).toEqual({ sido: '강원', sgg: '태백시', city: '태백시' });
  });

  it('광주·전남 통합 행정구역명도 알아본다 — 인허가 데이터에 이 표기가 있다', () => {
    expect(SIDO_SHORT['전남광주통합특별시']).toBe('광주');
    expect(regionOf('전남광주통합특별시 광양시 광장로 151').sido).toBe('광주');
  });

  it('모르는 시도는 그대로 쓴다 (억지로 고치지 않는다)', () => {
    expect(regionOf('없는도 어딘시 1로 1').sido).toBe('없는도');
  });
});

describe('buildQueries — 좁은 것부터', () => {
  it("'시·군 + 이름' 이 첫 질의다 — 이것이 판정의 기준 질의다", () => {
    expect(buildQueries('왕오락실', { sido: '경기', sgg: '남양주시', city: '남양주시' })).toEqual([
      '남양주시 왕오락실',
      '경기 남양주시 왕오락실',
      '경기 왕오락실',
    ]);
  });

  it('광역시는 구가 아니라 시 이름이 첫 질의다', () => {
    expect(buildQueries('스타게임장', { sido: '대구', sgg: '중구', city: '대구' })[0]).toBe(
      '대구 스타게임장',
    );
  });

  it('빈 지역은 빼고, 같은 질의는 한 번만', () => {
    expect(buildQueries('짱오락실', { sido: '서울', sgg: '', city: '서울' })).toEqual(['서울 짱오락실']);
    expect(buildQueries('짱오락실', { sido: '', sgg: '', city: '' })).toEqual([]);
  });
});

describe('judge — 좌표가 1순위', () => {
  const base = { name: '왕오락실', ...SEOUL, region: { sido: '서울', sgg: '중구', city: '서울' } };

  it('반경 안에 있으면 이름 표기가 달라도 found', () => {
    const j = judge({
      ...base,
      name: '대빵오락실(삼화점)',
      results: [[item({ title: '대빵오락실 제주삼화점', ...at(37.5666, 126.978) })]],
    });
    expect(j.verdict).toBe('found');
    expect(j.matchedTitle).toBe('대빵오락실 제주삼화점');
  });

  it('반경을 벗어나면 좌표로는 안 맞춘다', () => {
    const j = judge({
      ...base,
      results: [[item({ title: '전혀다른곳', ...at(37.6, 127.1) })]],
    });
    expect(j.verdict).not.toBe('found');
  });

  it('좌표가 어긋나도 이름이 같고 같은 시·군·구면 found', () => {
    const j = judge({
      ...base,
      results: [
        [
          item({
            title: '왕오락실',
            ...at(37.61, 127.05),
            roadAddress: '서울특별시 중구 세종대로 110',
            address: '서울특별시 중구 태평로1가 31',
          }),
        ],
      ],
    });
    expect(j.verdict).toBe('found');
    expect(j.reason).toContain('중구');
  });

  it('이름이 같아도 다른 시·군·구면 안 맞춘다 — 같은 이름의 다른 가게다', () => {
    const j = judge({
      ...base,
      results: [
        [item({ title: '왕오락실', ...at(37.9, 127.9), roadAddress: '경기도 포천시 솔모루로 76', address: '경기도 포천시 송우리 1' })],
      ],
    });
    expect(j.verdict).toBe('absent');
  });
});

describe('judge — 5건 상한은 없음의 근거가 될 수 없다', () => {
  const base = { name: '왕오락실', ...SEOUL, region: { sido: '경기', sgg: '남양주시', city: '남양주시' } };

  it('가장 좁은 질의가 5건을 꽉 채우면 inconclusive', () => {
    // "경기 왕오락실" 이 포천·평택·광주·고양·용인을 주고 남양주는 상한에 잘린 실제 사례
    const five = Array.from({ length: 5 }, (_, i) =>
      item({ title: '왕오락실', ...at(37.9 + i * 0.01, 127.2), roadAddress: `경기도 포천시 ${i}로 1`, address: `경기도 포천시 ${i}동` }),
    );
    const j = judge({ ...base, results: [five] });
    expect(j.verdict).toBe('inconclusive');
    expect(j.reason).toContain('상한');
  });

  it('상한에 안 걸렸고 아무것도 못 맞추면 absent', () => {
    const j = judge({ ...base, results: [[], []] });
    expect(j.verdict).toBe('absent');
    expect(j.reason).toContain('0건');
  });

  it('4건이 왔지만 다 다른 곳이면 absent — 상한에 안 걸렸으므로 근거가 된다', () => {
    const four = Array.from({ length: 4 }, (_, i) =>
      item({ title: `다른오락실${i}`, ...at(38.1 + i * 0.01, 127.9), roadAddress: '강원특별자치도 철원군 1로 1', address: '강원특별자치도 철원군 1동' }),
    );
    const j = judge({ ...base, results: [four] });
    expect(j.verdict).toBe('absent');
    expect(j.reason).toContain('4건');
  });

  it('넓은 질의가 상한에 걸려도, 좁은 질의가 안 걸렸으면 absent 로 본다', () => {
    // 다섯 건 모두 **다른 시·군·구**여야 이름 규칙에 걸리지 않습니다.
    const five = Array.from({ length: 5 }, (_, i) =>
      item({
        title: '왕오락실',
        ...at(37.9, 127.2),
        roadAddress: `경기도 포천시 ${i}로 1`,
        address: `경기도 포천시 ${i}동`,
      }),
    );
    const j = judge({ ...base, results: [[], five] });
    expect(j.verdict).toBe('absent');
  });

  it('좌표를 못 읽는 결과는 조용히 건너뛴다', () => {
    const j = judge({ ...base, results: [[item({ mapx: '', mapy: '' })]] });
    expect(['absent', 'found']).toContain(j.verdict);
  });
});

describe('MATCH_RADIUS_KM', () => {
  it('40m — 실측 근거로 300m 에서 좁혔다', () => {
    // 참인 매칭 902건은 중앙 7m · p90 25m, 오판 365건은 중앙 99m 였다.
    expect(MATCH_RADIUS_KM).toBe(0.04);
  });
});

describe('dongOf — 이름 없는 구제 질의에 쓸 법정동', () => {
  it('괄호 안에서 뽑는다', () => {
    expect(dongOf('서울특별시 서초구 효령로31길 58, 1층 (방배동)')).toBe('방배동');
  });

  it('괄호에 아파트 이름이 같이 오면 첫 조각만', () => {
    expect(dongOf('서울특별시 서초구 서초대로19길 77, 1층 (방배동, 래미안원페를라)')).toBe('방배동');
  });

  it('괄호가 없으면 읍·면 토큰에서 뽑는다', () => {
    expect(dongOf('충청북도 음성군 대소읍 성본상가1길 77, 102호')).toBe('대소읍');
    expect(dongOf('경상북도 칠곡군 왜관읍 경부고속도로 159')).toBe('왜관읍');
  });

  it('못 뽑으면 빈 문자열 — 억지로 만들지 않는다', () => {
    expect(dongOf('경기도 성남시 분당구 판교역로 235')).toBe('');
    expect(dongOf('')).toBe('');
  });
});

describe('rescueQueries — 인허가 상호와 간판 이름이 다를 때', () => {
  const r = { sido: '경남', sgg: '거제시', city: '거제시' };

  it('지점명을 뗀 이름으로 다시 묻는다', () => {
    const qs = rescueQueries('펀존게임랜드(중앙로점)', '경상남도 거제시 거제중앙로27길 10, 1층 (고현동)', r, '펀존게임랜드');
    expect(qs[0]).toEqual({ query: '경남 거제시 펀존게임랜드', nameFree: false });
  });

  it('이름 없이 동+오락실 질의도 넣는다 — 이름이 아예 다른 경우의 마지막 수단', () => {
    const qs = rescueQueries('엔엔대빵오락실', '서울특별시 서초구 효령로31길 58, 1층 (방배동)', { sido: '서울', sgg: '서초구', city: '서울' }, '엔엔대빵오락실');
    expect(qs).toEqual([{ query: '방배동 오락실', nameFree: true }]);
  });

  it('뗄 지점명도 없고 동도 없으면 빈 배열', () => {
    expect(rescueQueries('짱오락실', '경기도 성남시 분당구 판교역로 235', { sido: '경기', sgg: '성남시', city: '성남시' }, '짱오락실')).toEqual([]);
  });
});

describe('judge — 이름 없는 질의 결과는 좌표로만 쓴다', () => {
  const base = { name: '엔엔대빵오락실', lat: 37.4837, lng: 126.9955, region: { sido: '서울', sgg: '서초구', city: '서울' } };

  it('이름 없는 질의로 찾은 것은 found 가 아니라 inconclusive — 확인도 부정도 아니다', () => {
    // 예전에는 found 로 처리해서 '팡팡오락실'(양평군)이 100m 거리의
    // '즐겨찾기오락실' 때문에 확인됨이 되었다.
    const j = judge({
      ...base,
      results: [[]],
      nameFreeResults: [[item({ title: '대빵오락실 방배점', ...at(37.4838, 126.9956) })]],
    });
    expect(j.verdict).toBe('inconclusive');
    expect(j.matchedTitle).toBe('대빵오락실 방배점');
    expect(j.reason).toContain('이름이 다름');
  });

  it('노래방은 반경 안에 있어도 오락실로 보지 않는다 — 카테고리를 봐야 한다', () => {
    const j = judge({
      ...base,
      results: [
        [
          item({
            title: '리코스타 코인노래연습장',
            category: '오락시설>노래방',
            ...at(37.4838, 126.9956),
          }),
        ],
      ],
    });
    expect(j.verdict).toBe('absent');
  });

  it('같은 동의 무관한 오락실은 이름 규칙으로 맞추지 않는다', () => {
    const j = judge({
      ...base,
      name: '왕오락실',
      results: [[]],
      nameFreeResults: [
        [item({ title: '왕오락실', ...at(37.9, 127.9), roadAddress: '서울특별시 서초구 다른길 1', address: '서울특별시 서초구 방배동 9' })],
      ],
    });
    expect(j.verdict).toBe('absent');
  });

  it('동 단위 질의도 상한에 걸리면 inconclusive', () => {
    const five = Array.from({ length: 5 }, (_, i) => item({ title: `오락실${i}`, ...at(38 + i * 0.01, 128) }));
    const j = judge({ ...base, results: [[]], nameFreeResults: [five] });
    expect(j.verdict).toBe('inconclusive');
    expect(j.reason).toContain('동 단위');
  });
});

describe('cityOf — 검색에 쓸 시·군 (사용자가 지정한 조건)', () => {
  it('도 아래는 시·군을 쓴다', () => {
    expect(cityOf('경기도 김포시 김포한강1로78번길 6-6')).toBe('김포시');
    expect(cityOf('충청북도 음성군 대소읍 성본상가1길 77')).toBe('음성군');
    expect(cityOf('경상남도 진주시 가좌안골길6번길 7')).toBe('진주시');
  });

  it('광역시·특별시는 구가 아니라 시 이름을 쓴다 — 중구·북구는 여러 도시에 있다', () => {
    expect(cityOf('대구광역시 중구 동성로4길 39')).toBe('대구');
    expect(cityOf('서울특별시 송파구 오금로11길 16')).toBe('서울');
    expect(cityOf('세종특별자치시 한누리대로 1')).toBe('세종');
  });

  it('특별자치도는 도이므로 아래 시·군을 쓴다', () => {
    expect(cityOf('강원특별자치도 태백시 황지로 112')).toBe('태백시');
    expect(cityOf('전북특별자치도 완주군 봉동읍 둔산3로 52')).toBe('완주군');
  });

  it('통합특별시는 광역시처럼 다룬다', () => {
    expect(cityOf('전남광주통합특별시 동구 충장로안길 6')).toBe('광주');
  });

  it('빈 주소에도 터지지 않는다', () => {
    expect(cityOf('')).toBe('');
  });
});

describe('normalizeAddress — 병합 비교 열쇠', () => {
  it('층·호와 끝 괄호를 뗀다', () => {
    expect(normalizeAddress('서울특별시 성동구 마조로 9, 1층 (행당동)')).toBe('서울특별시 성동구 마조로 9');
    expect(normalizeAddress('서울특별시 성동구 마조로 9')).toBe('서울특별시 성동구 마조로 9');
  });

  it('공백 차이를 없앤다', () => {
    expect(normalizeAddress('경기도  안산시   고잔1길 42')).toBe('경기도 안산시 고잔1길 42');
  });

  it('번지가 다르면 다른 주소다 — 뭉개지 않는다', () => {
    expect(normalizeAddress('마조로 9')).not.toBe(normalizeAddress('마조로 90'));
  });
});

describe('planAddressMerges', () => {
  const r = (id: number, name: string, address: string, source: string | null, naverTitle?: string) =>
    ({ id, name, address, source, naverTitle });

  it('naver 행을 남기고 그 이름을 쓴다', () => {
    const plans = planAddressMerges([
      r(1331, '놀자게임장', '대구광역시 중구 중앙대로 434-4, 1층', 'localdata'),
      r(217, '놀자', '대구광역시 중구 중앙대로 434-4', 'naver'),
      r(1641, '놀자리듬게임장', '대구광역시 중구 중앙대로 434-4 (남산동)', 'localdata'),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].keepId).toBe(217);
    expect(plans[0].name).toBe('놀자');
    expect(plans[0].dropIds.sort()).toEqual([1331, 1641]);
    expect(plans[0].reason).toContain('naver');
  });

  it('naver 행이 없으면 검색에서 찾은 이름을 쓴다', () => {
    const plans = planAddressMerges([
      r(900, '한양 게임장', '서울특별시 성동구 마조로 9, 1층 (행당동)', 'localdata', '한양게임센터'),
      r(901, '한양게임장 2호', '서울특별시 성동구 마조로 9', 'localdata'),
    ]);
    expect(plans[0].keepId).toBe(900);
    expect(plans[0].name).toBe('한양게임센터');
    expect(plans[0].dropIds).toEqual([901]);
  });

  it('네이버 이름을 못 찾으면 남기는 행의 이름을 그대로 둔다', () => {
    const plans = planAddressMerges([
      r(10, 'A오락실', '부산광역시 중구 1로 1', 'localdata'),
      r(11, 'B오락실', '부산광역시 중구 1로 1, 2층', 'localdata'),
    ]);
    expect(plans[0].keepId).toBe(10);
    expect(plans[0].name).toBe('A오락실');
    expect(plans[0].dropIds).toEqual([11]);
  });

  it('주소가 겹치지 않으면 계획이 없다', () => {
    expect(planAddressMerges([
      r(1, 'A오락실', '서울특별시 중구 1로 1', 'localdata'),
      r(2, 'B오락실', '서울특별시 중구 1로 2', 'naver'),
    ])).toEqual([]);
  });

  it('주소를 정규화할 수 없으면 건드리지 않는다', () => {
    expect(planAddressMerges([
      r(1, 'A오락실', '', 'localdata'),
      r(2, 'B오락실', '', 'localdata'),
    ])).toEqual([]);
  });

  it('한 행뿐인 그룹에서 이름만 바꾸지는 않는다 — 병합은 겹칠 때만', () => {
    expect(planAddressMerges([r(1, 'A오락실', '서울특별시 중구 1로 1', 'localdata', '다른이름')])).toEqual([]);
  });
});
