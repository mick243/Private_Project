import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  categoryLeaf,
  crawlArcades,
  dedupePlaces,
  isArcadeCategory,
  isArcadePlace,
  isExcludedByName,
  mapSearchUrl,
  normalizeName,
  placeKey,
  readCredentials,
  searchLocal,
  stripTags,
  toLatLng,
  toPlace,
  type ArcadePlace,
  type NaverLocalItem,
} from '@/lib/naver-local';

/** 문서 예시 모양의 item. 필요한 필드만 덮어씁니다 */
function item(over: Partial<NaverLocalItem> = {}): NaverLocalItem {
  return {
    title: '펀시티',
    link: 'https://store.naver.com/1234',
    category: '여가,오락>게임/오락',
    description: '',
    telephone: '',
    address: '서울특별시 마포구 서교동 358-1',
    roadAddress: '서울특별시 마포구 양화로 155',
    mapx: '1269237500',
    mapy: '375563250',
    ...over,
  };
}

describe('stripTags — title 은 <b> 와 HTML 엔티티를 달고 온다', () => {
  it('검색어 강조 태그를 걷어낸다', () => {
    expect(stripTags('<b>강남</b> 게임랜드')).toBe('강남 게임랜드');
  });

  it('엔티티를 원래 글자로 되돌린다', () => {
    expect(stripTags('놀이터 &amp; 오락실')).toBe('놀이터 & 오락실');
    expect(stripTags('&quot;펀&quot;시티')).toBe('"펀"시티');
    expect(stripTags('Joe&#39;s Arcade')).toBe("Joe's Arcade");
  });

  it('&amp; 를 먼저 풀어 이중 디코딩되지 않는다', () => {
    // "&amp;lt;" 는 화면에 "&lt;" 로 보여야 하는 값이다. &amp; 를 먼저 풀면
    // "&lt;" 가 되고 다시 "<" 까지 가버린다.
    expect(stripTags('A&amp;lt;B')).toBe('A&lt;B');
  });

  it('연속 공백을 하나로 줄이고 양끝을 다듬는다', () => {
    expect(stripTags('  강남   오락실 ')).toBe('강남 오락실');
  });
});

describe('toLatLng — 좌표계를 잘못 읽으면 지도에 엉뚱한 핀이 꽂힌다', () => {
  it('현행 WGS84 정수(1e7 배)를 위경도로 되돌린다', () => {
    expect(toLatLng('1270575397', '375120151')).toEqual({
      lng: 127.0575397,
      lat: 37.5120151,
    });
  });

  it('구 KATEC 정수는 한국 범위를 벗어나므로 거부한다', () => {
    // 308029 / 1e7 = 0.0308… → 위경도로 쓰면 기니만 앞바다다.
    expect(toLatLng('308029', '532516')).toBeNull();
  });

  it('0 과 숫자가 아닌 값을 거부한다', () => {
    expect(toLatLng('0', '0')).toBeNull();
    expect(toLatLng('', '')).toBeNull();
    expect(toLatLng('abc', '375120151')).toBeNull();
  });

  it('한국 밖 좌표를 거부한다', () => {
    // 도쿄 (139.69, 35.68) — 형식은 맞지만 우리 범위가 아니다.
    expect(toLatLng('1396917000', '356894000')).toBeNull();
  });

  it('제주와 최북단은 통과시킨다', () => {
    expect(toLatLng('1264931000', '333890000')).not.toBeNull(); // 제주
    expect(toLatLng('1287000000', '382000000')).not.toBeNull(); // 고성 부근
  });
});

describe('categoryLeaf — 상위 분류가 "스포츠,오락" 이라 말단만 봐야 한다', () => {
  it('마지막 조각만 남긴다', () => {
    expect(categoryLeaf('스포츠,오락>오락실')).toBe('오락실');
    expect(categoryLeaf('컴퓨터프로그래밍,정보서비스업>게임')).toBe('게임');
  });

  it('공백을 지운다 — "게임 팝업" 같은 표기가 있다', () => {
    expect(categoryLeaf('팝업스토어>게임 팝업')).toBe('게임팝업');
  });

  it('구분자가 없으면 전체가 말단이다', () => {
    expect(categoryLeaf('오락실')).toBe('오락실');
  });
});

describe('isArcadeCategory — 전국 975건을 실제로 받아 보고 정한 기준', () => {
  it('오락실 계열 말단을 통과시킨다', () => {
    expect(isArcadeCategory('스포츠,오락>오락실')).toBe(true);
    expect(isArcadeCategory('스포츠,오락>오락시설')).toBe(true);
    // 예전 표기도 남겨 둔다
    expect(isArcadeCategory('여가,오락>게임/오락')).toBe(true);
    expect(isArcadeCategory('여가,오락>아케이드게임')).toBe(true);
  });

  it('상위 분류의 "오락" 에 낚이지 않는다 — 이것 때문에 스케이트장이 들어왔다', () => {
    expect(isArcadeCategory('스포츠,오락>롤러,인라인스케이트장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>보조경기장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>종합운동장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>골프연습장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>사격장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>ATV체험장')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>스포츠시설')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>멀티방')).toBe(false);
  });

  it('말단이 "게임" 인 것들은 오락실이 아니다 — 게임 회사·소매점이다', () => {
    // 넥슨코리아, 지역 글로벌게임센터, 게임샵이 여기로 온다
    expect(isArcadeCategory('컴퓨터프로그래밍,정보서비스업>게임')).toBe(false);
    expect(isArcadeCategory('쇼핑,유통>게임')).toBe(false);
    expect(isArcadeCategory('게임>게임제작')).toBe(false);
    expect(isArcadeCategory('게임>게임유통')).toBe(false);
    expect(isArcadeCategory('협회,단체>게임')).toBe(false);
    expect(isArcadeCategory('제조업>영상게임기제조')).toBe(false);
    expect(isArcadeCategory('팝업스토어>게임 팝업')).toBe(false);
  });

  it('보드게임 카페와 서바이벌(레이저택)을 걷어낸다', () => {
    // 보드카페는 63곳이나 섞여 왔다
    expect(isArcadeCategory('스포츠,오락>보드카페')).toBe(false);
    expect(isArcadeCategory('스포츠,오락>서바이벌게임')).toBe(false);
  });

  it('빈 카테고리는 통과시키지 않는다', () => {
    expect(isArcadeCategory('')).toBe(false);
  });
});

describe('isArcadePlace — 카테고리가 빗나간 오락실을 이름으로 구제한다', () => {
  it('카테고리가 맞으면 이름은 안 본다', () => {
    expect(isArcadePlace({ name: '아무이름', category: '스포츠,오락>오락실' })).toBe(true);
  });

  it('펌프아케이드가 스포츠시설로 등록돼 있어도 살린다 — 이 앱이 찾는 그 종류다', () => {
    expect(
      isArcadePlace({ name: '펌프아케이드 구파발점', category: '스포츠,오락>스포츠시설' }),
    ).toBe(true);
  });

  it('이름에 오락실이 들어가면 살린다', () => {
    expect(isArcadePlace({ name: '짱오락실 홍대점', category: '쇼핑,유통>게임' })).toBe(true);
  });

  it('게임 회사·보드카페는 구제하지 않는다', () => {
    expect(isArcadePlace({ name: '넥슨코리아', category: '게임>게임제작' })).toBe(false);
    expect(
      isArcadePlace({ name: '경남글로벌게임센터', category: '컴퓨터프로그래밍,정보서비스업>게임' }),
    ).toBe(false);
    expect(
      isArcadePlace({ name: '더홀릭보드게임카페 동탄점', category: '스포츠,오락>보드카페' }),
    ).toBe(false);
    expect(
      isArcadePlace({ name: '창원축구센터인라인스케이트장', category: '스포츠,오락>보조경기장' }),
    ).toBe(false);
  });

  it('"게임센터"·"게임랜드" 는 표시로 쓰지 않는다 — 진흥기관이 딸려 온다', () => {
    expect(isArcadePlace({ name: '경기글로벌게임센터', category: '협회,단체>게임' })).toBe(false);
    expect(isArcadePlace({ name: '골든힐게임랜드', category: '쇼핑,유통>게임' })).toBe(false);
  });
});

describe('isExcludedByName — 뽑기·가챠 전문점은 리듬게임 기체가 없다', () => {
  it('뽑기·가챠가 든 이름을 걸러낸다', () => {
    expect(isExcludedByName('대빵인형뽑기 수유점')).toBe(true);
    expect(isExcludedByName('365뽑기')).toBe(true);
    expect(isExcludedByName('캑티 가챠샵 건대점')).toBe(true);
    expect(isExcludedByName('뽀꼬뽀꼬 가챠가챠')).toBe(true);
  });

  it("'뽑기' 가 아니어도 '뽑' 이 들어가면 걸러낸다", () => {
    // 이 업종은 '뽑기' 라고 짓지 않는 쪽이 오히려 많았다 — 실제 상호들
    expect(isExcludedByName('뽑아핑 왕십리점')).toBe(true);
    expect(isExcludedByName('뽑스쿨 별양점')).toBe(true);
    expect(isExcludedByName('뽑다방')).toBe(true);
    expect(isExcludedByName('뽑짱')).toBe(true);
    expect(isExcludedByName('뽑차코 청량리점')).toBe(true);
    expect(isExcludedByName('뽑파민')).toBe(true);
    expect(isExcludedByName('그만뽑아강')).toBe(true);
    expect(isExcludedByName('뽑으믄돼지')).toBe(true);
  });

  it('공백이 끼어 있어도 잡는다 — 간판 표기가 제각각이다', () => {
    expect(isExcludedByName('캑티  가챠  샵')).toBe(true);
    expect(isExcludedByName('인형 뽑 기')).toBe(true);
  });

  it('일반 오락실은 건드리지 않는다', () => {
    // 563곳을 실제로 훑어 '뽑' 이 걸리는 정상 오락실이 없음을 확인했다
    expect(isExcludedByName('짱오락실 홍대점')).toBe(false);
    expect(isExcludedByName('펌프아케이드 구파발점')).toBe(false);
    expect(isExcludedByName('게임토피아')).toBe(false);
    expect(isExcludedByName('와와오락실')).toBe(false);
    expect(isExcludedByName('뿅뿅오락실')).toBe(false);
    expect(isExcludedByName('럭키팝 성수점')).toBe(false);
  });

  it('아직 빠져나가는 변형 — 넓히려면 NAME_EXCLUDE 에 추가해야 한다', () => {
    expect(isExcludedByName('브라더굿즈가차샵')).toBe(false); // 가챠 아닌 '가차'
    expect(isExcludedByName('인형나라')).toBe(false);
    expect(isExcludedByName('토이토이인형방')).toBe(false);
  });
});

describe('isArcadePlace — 이름 제외가 카테고리보다 먼저다', () => {
  it('카테고리가 오락실로 맞게 붙어 있어도 뽑기 전문점은 제외한다', () => {
    // 네이버는 이들을 정당하게 '오락실' 로 분류한다. 제외를 나중에 보면 통과한다.
    expect(
      isArcadePlace({ name: '대빵인형뽑기 수유점', category: '스포츠,오락>오락실' }),
    ).toBe(false);
    expect(
      isArcadePlace({ name: '캑티 가챠샵 천호점', category: '스포츠,오락>오락실' }),
    ).toBe(false);
  });

  it('이름 구제보다도 먼저다 — "오락실"과 "뽑"이 같이 있으면 제외', () => {
    expect(
      isArcadePlace({ name: '힐존 오락실&뽑기방', category: '스포츠,오락>오락실' }),
    ).toBe(false);
    // 뽑아핑 체인점 하나는 상호에 '오락실' 을 달고 있다
    expect(
      isArcadePlace({ name: '뽑아핑오락실', category: '스포츠,오락>오락실' }),
    ).toBe(false);
  });
});

describe('toPlace', () => {
  it('도로명 주소를 우선 쓴다', () => {
    expect(toPlace(item())?.address).toBe('서울특별시 마포구 양화로 155');
  });

  it('도로명이 비면 지번 주소로 넘어간다', () => {
    expect(toPlace(item({ roadAddress: '' }))?.address).toBe(
      '서울특별시 마포구 서교동 358-1',
    );
  });

  it('이름의 강조 태그를 지운다', () => {
    expect(toPlace(item({ title: '<b>홍대</b> 펀시티' }))?.name).toBe('홍대 펀시티');
  });

  it('좌표를 못 읽으면 버린다 — 좌표 없는 오락실은 지도에 못 올린다', () => {
    expect(toPlace(item({ mapx: '0', mapy: '0' }))).toBeNull();
  });

  it('주소가 아예 없으면 버린다', () => {
    expect(toPlace(item({ roadAddress: '', address: '' }))).toBeNull();
  });

  it('이름이 비면 버린다', () => {
    expect(toPlace(item({ title: '<b></b>' }))).toBeNull();
  });
});

describe('normalizeName', () => {
  it('공백과 괄호 차이를 없앤다', () => {
    expect(normalizeName('펀시티 (홍대점)')).toBe(normalizeName('펀시티홍대점'));
  });
});

describe('dedupePlaces — 질의를 바꾸면 같은 업체가 다시 온다', () => {
  const at = (name: string, lat: number, lng: number): ArcadePlace => ({
    name,
    category: '스포츠,오락>오락실',
    address: 'addr',
    lat,
    lng,
    homepage: '',
    mapUrl: mapSearchUrl(name, 'addr'),
  });

  it('이름이 같고 가까우면 한 건으로 합친다', () => {
    const out = dedupePlaces([
      at('펀시티', 37.5563, 126.9237),
      at('펀 시티', 37.5564, 126.9238), // 공백만 다르고 약 14m
    ]);
    expect(out).toHaveLength(1);
  });

  it('같은 건물의 다른 오락실은 남긴다 — 좌표만으로 합치면 안 된다', () => {
    const out = dedupePlaces([
      at('펀시티', 37.5563, 126.9237),
      at('게임랜드', 37.5563, 126.9237), // 좌표는 같지만 다른 업체
    ]);
    expect(out).toHaveLength(2);
  });

  it('이름이 같아도 멀면 다른 지점이다', () => {
    const out = dedupePlaces([
      at('펀시티', 37.5563, 126.9237), // 홍대
      at('펀시티', 37.5006, 127.0364), // 강남 — 같은 브랜드 다른 지점
    ]);
    expect(out).toHaveLength(2);
  });

  it('입력 순서를 유지한다 (먼저 온 것을 남긴다)', () => {
    const out = dedupePlaces([at('가게A', 37.5, 127.0), at('가게B', 37.6, 127.1)]);
    expect(out.map((p) => p.name)).toEqual(['가게A', '가게B']);
  });
});

describe('readCredentials — 섞이기 쉬운 세 가지 키를 구분한다', () => {
  it('새 이름(NAVER_HUB_*)을 우선 쓴다', () => {
    const c = readCredentials({
      NAVER_HUB_API_KEY_ID: 'hub-id',
      NAVER_HUB_API_KEY: 'hub-key',
      NAVER_SEARCH_CLIENT_ID: 'old-id',
      NAVER_SEARCH_CLIENT_SECRET: 'old-secret',
    });
    expect(c).toEqual({ id: 'hub-id', secret: 'hub-key' });
  });

  it('이관 전 이름(NAVER_SEARCH_*)도 계속 받는다 — 이미 채워 둔 설정이 있다', () => {
    const c = readCredentials({
      NAVER_SEARCH_CLIENT_ID: 'old-id',
      NAVER_SEARCH_CLIENT_SECRET: 'old-secret',
    });
    expect(c).toEqual({ id: 'old-id', secret: 'old-secret' });
  });

  it('한쪽만 있으면 못 쓴다', () => {
    expect(readCredentials({ NAVER_HUB_API_KEY_ID: 'only-id' })).toBeNull();
    expect(readCredentials({})).toBeNull();
  });

  it('지도를 그리는 NCP Maps 키는 검색에 쓰이지 않는다', () => {
    expect(
      readCredentials({ NEXT_PUBLIC_NAVER_MAP_KEY_ID: 'k8g6rl7d7f' }),
    ).toBeNull();
  });

  it('네이버 로그인(OAuth) 키로 넘어가지 않는다', () => {
    // 이관 후 HUB 는 NCP 키만 받는다. 로그인 키가 흘러들어가면
    // "키가 있는데 401" 이라는 가장 헷갈리는 상태가 된다.
    expect(
      readCredentials({ NAVER_CLIENT_ID: 'login-id', NAVER_CLIENT_SECRET: 'login-secret' }),
    ).toBeNull();
  });
});

describe('mapSearchUrl · placeKey — 네이버가 안정된 장소 ID 를 주지 않는다', () => {
  it('이름+주소로 지도 검색 링크를 만든다', () => {
    const u = mapSearchUrl('짱오락실 홍대점', '서울특별시 마포구 어울마당로 69');
    expect(u.startsWith('https://map.naver.com/p/search/')).toBe(true);
    // 한글·공백이 인코딩돼 있어야 그대로 열린다
    expect(u).toContain(encodeURIComponent('짱오락실 홍대점'));
  });

  it('같은 업체는 같은 열쇠, 다른 지점은 다른 열쇠', () => {
    const a = { name: '짱오락실 홍대점', address: '서울 마포구 어울마당로 69' };
    const b = { name: '짱오락실  홍대점', address: '서울 마포구 어울마당로 69' };
    const c = { name: '짱오락실 강남점', address: '서울 강남구 테헤란로 1' };
    expect(placeKey(a)).toBe(placeKey(b));
    expect(placeKey(a)).not.toBe(placeKey(c));
  });
});

describe('searchLocal — NAVER API HUB', () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = {
    NAVER_HUB_API_KEY_ID: 'id',
    NAVER_HUB_API_KEY: 'secret',
  };

  it('자격증명이 없으면 요청하지 않고 바로 알려준다', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(searchLocal('오락실', { env: {} })).rejects.toThrow(
      /NAVER_HUB_API_KEY_ID/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('HUB 엔드포인트로 보낸다 — 종료된 openapi.naver.com 이 아니다', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await searchLocal('홍대 오락실', { env });

    const [url] = fetchSpy.mock.calls[0] as unknown as [URL];
    expect(url.origin).toBe('https://naverapihub.apigw.ntruss.com');
    expect(url.pathname).toBe('/search/v1/local');
  });

  it('NCP 게이트웨이 헤더로 키를 보낸다 — 쿼리스트링에 실으면 로그에 남는다', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await searchLocal('홍대 오락실', { env });

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [URL, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h['X-NCP-APIGW-API-KEY-ID']).toBe('id');
    expect(h['X-NCP-APIGW-API-KEY']).toBe('secret');
    // 종료된 구 헤더를 같이 보내지 않는다
    expect(h['X-Naver-Client-Id']).toBeUndefined();
    expect(url.searchParams.get('query')).toBe('홍대 오락실');
    expect(url.searchParams.has('X-NCP-APIGW-API-KEY')).toBe(false);
  });

  it('display 를 항상 보낸다 — 안 보내면 기본값 1 로 1건만 온다', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await searchLocal('오락실', { env });

    const [url] = fetchSpy.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('display')).toBe('5');
  });

  it('display 를 상한 5 로 깎아 보낸다 — 10 을 보내도 5 가 온다', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await searchLocal('오락실', { display: 50, env });

    const [url] = fetchSpy.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('display')).toBe('5');
  });

  it('start 를 보내지 않는다 — 서버가 무시하므로 보낼 이유가 없다', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await searchLocal('오락실', { env });

    const [url] = fetchSpy.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.has('start')).toBe(false);
  });

  it('items 가 없는 응답을 빈 배열로 받는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
    await expect(searchLocal('오락실', { env })).resolves.toEqual([]);
  });

  it('실패 응답은 상태코드를 달아 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota exceeded', { status: 429 })),
    );
    await expect(searchLocal('오락실', { env })).rejects.toThrow(/429/);
  });
});

describe('crawlArcades — 하루 한도와 이어서 하기', () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { NAVER_HUB_API_KEY_ID: 'id', NAVER_HUB_API_KEY: 'secret' };

  /** 질의마다 오락실 1건씩 주는 스텁 */
  function stubOnePerQuery() {
    const spy = vi.fn(async (url: URL) => {
      const q = url.searchParams.get('query') ?? '';
      return Response.json({
        items: [
          {
            ...item(),
            title: `${q} 오락실`,
            link: `https://store.naver.com/p/${encodeURIComponent(q)}`,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('maxCalls 까지만 호출하고 남은 질의를 돌려준다', async () => {
    const spy = stubOnePerQuery();
    const r = await crawlArcades(['가', '나', '다', '라', '마'], { env, maxCalls: 2 });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.callsUsed).toBe(2);
    expect(r.done).toEqual(['가', '나']);
    expect(r.remaining).toEqual(['다', '라', '마']);
  });

  it('maxCalls 0 이면 한 번도 호출하지 않는다 — 한도를 다 쓴 날의 정상 동작', async () => {
    const spy = stubOnePerQuery();
    const r = await crawlArcades(['가', '나'], { env, maxCalls: 0 });

    expect(spy).not.toHaveBeenCalled();
    expect(r.callsUsed).toBe(0);
    expect(r.remaining).toEqual(['가', '나']);
  });

  it('skip 에 든 질의는 건너뛰고 예산도 쓰지 않는다 (이어서 하기)', async () => {
    const spy = stubOnePerQuery();
    const r = await crawlArcades(['가', '나', '다'], {
      env,
      skip: new Set(['가', '나']),
      maxCalls: 10,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.done).toEqual(['다']);
    expect(r.remaining).toEqual([]);
  });

  it('remaining 에 이미 끝낸 질의를 넣지 않는다', async () => {
    stubOnePerQuery();
    // '나' 는 이미 끝냈고, 예산은 1회뿐 → '가' 만 하고 '다' 가 남아야 한다.
    const r = await crawlArcades(['가', '나', '다'], {
      env,
      skip: new Set(['나']),
      maxCalls: 1,
    });

    expect(r.done).toEqual(['가']);
    expect(r.remaining).toEqual(['다']);
    expect(r.remaining).not.toContain('나');
  });

  it('전부 끝내면 remaining 이 비어 있다 — 완료 판정의 근거', async () => {
    stubOnePerQuery();
    const r = await crawlArcades(['가', '나'], { env, maxCalls: 10 });
    expect(r.remaining).toEqual([]);
  });

  it('onCall 이 호출마다 불린다 — 여기서 상태를 저장한다', async () => {
    stubOnePerQuery();
    const seen: { q: string; n: number }[] = [];
    await crawlArcades(['가', '나', '다'], {
      env,
      maxCalls: 3,
      onCall: ({ query, callsUsed }) => {
        seen.push({ q: query, n: callsUsed });
      },
    });

    expect(seen).toEqual([
      { q: '가', n: 1 },
      { q: '나', n: 2 },
      { q: '다', n: 3 },
    ]);
  });

  it('중복 제거를 하지 않는다 — 여러 날 결과를 합친 뒤 걸러야 한다', async () => {
    // 두 질의가 같은 업소를 준다
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ items: [{ ...item(), title: '펀시티', link: 'https://x/1' }] }),
      ),
    );
    const r = await crawlArcades(['가', '나'], { env, maxCalls: 5 });
    expect(r.places).toHaveLength(2); // 걸러지지 않은 상태로 넘어온다
    expect(dedupePlaces(r.places)).toHaveLength(1); // 거르는 건 호출한 쪽의 일
  });

  it('중간에 실패하면 그 전까지 한 것은 onCall 로 이미 기록돼 있다', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1;
        if (n === 3) return new Response('boom', { status: 500 });
        return Response.json({ items: [item()] });
      }),
    );
    const saved: string[] = [];
    await expect(
      crawlArcades(['가', '나', '다', '라'], {
        env,
        maxCalls: 10,
        onCall: ({ query }) => {
          saved.push(query);
        },
      }),
    ).rejects.toThrow(/500/);

    // 3번째에서 터졌으므로 1·2번은 저장돼 있어야 한다 (호출 수를 잊으면 안 된다)
    expect(saved).toEqual(['가', '나']);
  });
});
