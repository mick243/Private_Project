import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INFO_ENDPOINT,
  LocaldataError,
  MAX_NUM_OF_ROWS,
  YOUTH_GAME_SERVICE,
  buildInfoUrl,
  crawlOpenProviders,
  dedupeProviders,
  fetchInfoPage,
  hintForError,
  classifyByName,
  isOpenBusiness,
  normalizeServiceKey,
  parseInfoResponse,
  pickCanonicalName,
  providerKey,
  stripCorporateForm,
  readServiceKey,
  tallyBy,
  spellingKey,
  splitAtArcadeWord,
  toGameProvider,
  unifySpellings,
  type LocaldataRow,
} from '@/lib/localdata-games';

/** 응답 item 한 건. 필요한 필드만 덮어씁니다 */
function row(over: Partial<Record<string, string>> = {}): LocaldataRow {
  return {
    OPN_ATMY_GRP_CD: '3220000',
    MNG_NO: '3220000-2020-0001',
    BPLC_NM: '펀시티 게임랜드',
    ROAD_NM_ADDR: '경기도 성남시 분당구 판교역로 235',
    LOTNO_ADDR: '경기도 성남시 분당구 삼평동 681',
    ROAD_NM_ZIP: '13494',
    TELNO: '031-000-0000',
    LCPMT_YMD: '20200301',
    SALS_STTS_CD: '01',
    SALS_STTS_NM: '영업/정상',
    DTL_SALS_STTS_CD: '01',
    DTL_SALS_STTS_NM: '영업',
    CULTR_SPTS_TPBIZ_NM: '청소년게임제공업',
    TOTAL_GMCON_CNT: '42',
    PVSN_VG_NM: '펌프잇업',
    FCAR: '150.5',
    CLSBIZ_YMD: '',
    TCBIZ_BGNG_YMD: '',
    TCBIZ_END_YMD: '',
    LAST_MDFCN_PNT: '20260416120000',
    CRD_INFO_X: '205123.456',
    CRD_INFO_Y: '441234.567',
    ...over,
  };
}

/** 성공 응답 한 페이지 */
function okBody(rows: LocaldataRow[], totalCount = rows.length): string {
  return JSON.stringify({
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
      body: { dataType: 'JSON', numOfRows: 100, pageNo: 1, totalCount, items: { item: rows } },
    },
  });
}

describe('normalizeServiceKey — Encoding/Decoding 두 벌 중 무엇이 와도 살려야 한다', () => {
  it('Decoding 키는 그대로 둔다', () => {
    expect(normalizeServiceKey('abc+def/ghi==')).toBe('abc+def/ghi==');
  });

  it('Encoding 키를 되돌린다 — 안 되돌리면 %2B 가 %252B 로 이중 인코딩된다', () => {
    expect(normalizeServiceKey('abc%2Bdef%2Fghi%3D%3D')).toBe('abc+def/ghi==');
  });

  it('앞뒤 공백을 떼어낸다 — 복사·붙여넣기로 가장 흔한 사고다', () => {
    expect(normalizeServiceKey('  abcdef  ')).toBe('abcdef');
  });

  it('되돌릴 수 없는 %XX 는 원본을 그대로 둔다 (억지로 고치면 원인 찾기가 어려워진다)', () => {
    expect(normalizeServiceKey('abc%ZZdef%2G')).toBe('abc%ZZdef%2G');
    expect(normalizeServiceKey('100%25 + %E0%A4%A')).toBe('100%25 + %E0%A4%A');
  });
});

describe('readServiceKey', () => {
  it('없으면 null', () => {
    expect(readServiceKey({})).toBeNull();
    expect(readServiceKey({ DATA_GO_KR_API_KEY: '   ' })).toBeNull();
  });

  it('있으면 정규화해서 준다', () => {
    expect(readServiceKey({ DATA_GO_KR_API_KEY: 'a%2Bb' })).toBe('a+b');
  });
});

describe('buildInfoUrl', () => {
  it('필수 파라미터를 다 넣는다', () => {
    const url = buildInfoUrl({ serviceKey: 'KEY', pageNo: 3 });
    expect(url.origin + url.pathname).toBe(INFO_ENDPOINT);
    expect(url.searchParams.get('serviceKey')).toBe('KEY');
    expect(url.searchParams.get('pageNo')).toBe('3');
    expect(url.searchParams.get('numOfRows')).toBe(String(MAX_NUM_OF_ROWS));
    expect(url.searchParams.get('returnType')).toBe('json');
  });

  it('numOfRows 는 명세 상한 100 을 넘기지 않는다', () => {
    expect(buildInfoUrl({ serviceKey: 'K', pageNo: 1, numOfRows: 1000 }).searchParams.get('numOfRows')).toBe('100');
    expect(buildInfoUrl({ serviceKey: 'K', pageNo: 1, numOfRows: 10 }).searchParams.get('numOfRows')).toBe('10');
  });

  it('조건을 안 주면 cond 를 아예 붙이지 않는다 — 기본은 전부 받아서 거른다', () => {
    expect(buildInfoUrl({ serviceKey: 'K', pageNo: 1 }).search).not.toContain('cond');
  });

  it('cond 이름의 대괄호·콜론을 인코딩하지 않는다', () => {
    // 인코딩하면 게이트웨이가 조건을 무시할 수 있고, 그때는 오류가 아니라
    // "필터 안 걸린 전체 결과" 가 와서 알아채기 가장 어렵습니다.
    const url = buildInfoUrl({
      serviceKey: 'K',
      pageNo: 1,
      localCode: '3220000',
      statusCode: '01',
    });
    expect(url.href).toContain('cond[OPN_ATMY_GRP_CD::EQ]=3220000');
    expect(url.href).toContain('cond[SALS_STTS_CD::EQ]=01');
    expect(url.href).not.toContain('%5B');
    expect(url.href).not.toContain('%3A%3A');
  });

  it('인증키의 +, /, = 는 인코딩한다', () => {
    const url = buildInfoUrl({ serviceKey: 'a+b/c==', pageNo: 1 });
    expect(url.href).toContain('serviceKey=a%2Bb%2Fc%3D%3D');
    expect(url.searchParams.get('serviceKey')).toBe('a+b/c==');
  });
});

describe('parseInfoResponse — 함정이 몰려 있는 자리', () => {
  it('정상 응답을 읽는다', () => {
    const page = parseInfoResponse(okBody([row(), row({ MNG_NO: 'x' })], 1234));
    expect(page.totalCount).toBe(1234);
    expect(page.rows).toHaveLength(2);
  });

  it('결과가 1건이면 item 이 배열이 아니라 객체 하나로 온다', () => {
    const body = JSON.stringify({
      response: { header: {}, body: { totalCount: 1, items: { item: row() } } },
    });
    expect(parseInfoResponse(body).rows).toHaveLength(1);
  });

  it('결과가 0건이면 items 가 빈 문자열로 오기도 한다', () => {
    const body = JSON.stringify({
      response: { header: {}, body: { totalCount: 0, items: '' } },
    });
    const page = parseInfoResponse(body);
    expect(page.rows).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  it('items 가 바로 배열이어도 읽는다', () => {
    const body = JSON.stringify({
      response: { header: {}, body: { totalCount: 1, items: [row()] } },
    });
    expect(parseInfoResponse(body).rows).toHaveLength(1);
  });

  it('totalCount 가 문자열이거나 없어도 숫자로 만든다', () => {
    expect(parseInfoResponse(okBody([], '7' as unknown as number)).totalCount).toBe(7);
    const noCount = JSON.stringify({ response: { header: {}, body: { items: '' } } });
    expect(parseInfoResponse(noCount).totalCount).toBe(0);
  });

  it('인증키 오류는 HTTP 200 + 다른 모양으로 온다 — status 만 봐선 모른다', () => {
    const body = JSON.stringify({
      OpenAPI_ServiceResponse: {
        cmmMsgHeader: {
          errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
          returnAuthMsg: '등록되지 않은 서비스키',
          returnReasonCode: '30',
        },
      },
    });
    try {
      parseInfoResponse(body, 200);
      expect.unreachable('LocaldataError 가 나야 한다');
    } catch (err) {
      expect(err).toBeInstanceOf(LocaldataError);
      const e = err as LocaldataError;
      expect(e.errMsg).toBe('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
      expect(e.message).toContain('등록되지 않은 서비스키');
      // 해결 안내가 붙어 있어야 합니다 — 이게 없으면 사용자가 다음에 뭘 할지 모릅니다
      expect(e.message).toContain('활용신청');
      expect(e.message).toContain(YOUTH_GAME_SERVICE.publicDataPk);
    }
  });

  it('JSON 이 아닌 본문(XML 오류 페이지)은 LocaldataError', () => {
    expect(() => parseInfoResponse('<OpenAPI_ServiceResponse>...', 200)).toThrow(LocaldataError);
    expect(() => parseInfoResponse('<html>500</html>', 500)).toThrow(/HTTP 500/);
  });

  it('response 는 있는데 body 가 없으면 resultCode 를 보여주며 실패한다', () => {
    const body = JSON.stringify({
      response: { header: { resultCode: '99', resultMsg: 'SERVICE ERROR' } },
    });
    expect(() => parseInfoResponse(body)).toThrow(/99/);
    expect(() => parseInfoResponse(body)).toThrow(/SERVICE ERROR/);
  });
});

describe('hintForError', () => {
  it('트래픽 초과는 다음에 뭘 할지 알려준다', () => {
    expect(hintForError('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')).toContain('10,000');
  });

  it('모르는 오류에는 억지로 안내를 붙이지 않는다', () => {
    expect(hintForError('SOMETHING_ELSE')).toBe('');
  });
});

describe('isOpenBusiness — 코드 하나만 믿지 않는다', () => {
  it('영업상태 01 이면 영업중', () => {
    expect(isOpenBusiness(row())).toBe(true);
  });

  it('01 이 아니면 아니다', () => {
    expect(isOpenBusiness(row({ SALS_STTS_CD: '03', SALS_STTS_NM: '폐업' }))).toBe(false);
    expect(isOpenBusiness(row({ SALS_STTS_CD: '02', SALS_STTS_NM: '휴업' }))).toBe(false);
  });

  it('폐업일자가 채워져 있으면 코드가 01 이어도 버린다 — 갱신이 밀린 행이 있다', () => {
    expect(isOpenBusiness(row({ CLSBIZ_YMD: '20240110' }))).toBe(false);
  });

  it('상세영업상태가 영업정지면 버린다 — 영업상태는 01 인데 상세는 정지인 행이 있다', () => {
    expect(isOpenBusiness(row({ DTL_SALS_STTS_NM: '영업정지' }))).toBe(false);
    expect(isOpenBusiness(row({ DTL_SALS_STTS_NM: '허가취소' }))).toBe(false);
    expect(isOpenBusiness(row({ DTL_SALS_STTS_NM: '직권말소' }))).toBe(false);
  });

  it('코드에 공백이 섞여 와도 알아본다', () => {
    expect(isOpenBusiness(row({ SALS_STTS_CD: ' 01 ' }))).toBe(true);
  });

  it('필드가 아예 없으면 영업중이 아니다 (모르면 넣지 않는다)', () => {
    expect(isOpenBusiness({})).toBe(false);
  });

  it('openCodes 를 주면 그것을 쓴다 — 휴업까지 포함하고 싶을 때', () => {
    const codes = new Set(['01', '02']);
    expect(isOpenBusiness(row({ SALS_STTS_CD: '02', SALS_STTS_NM: '휴업' }), codes)).toBe(true);
    expect(isOpenBusiness(row({ SALS_STTS_CD: '03' }), codes)).toBe(false);
  });
});

describe('toGameProvider', () => {
  it('쓸 필드만 남기고 빈 문자열은 null 로 만든다', () => {
    const p = toGameProvider(row({ TELNO: '', PVSN_VG_NM: '  ' }));
    expect(p.name).toBe('펀시티 게임랜드');
    expect(p.machineCount).toBe('42');
    expect(p.tel).toBeNull();
    expect(p.games).toBeNull();
  });

  it('좌표를 lat/lng 가 아니라 tmX/tmY 로 넘긴다 — EPSG:5174 라 그대로 못 쓴다', () => {
    const p = toGameProvider(row());
    expect(p.tmX).toBe('205123.456');
    expect(p.tmY).toBe('441234.567');
    expect(p).not.toHaveProperty('lat');
    expect(p).not.toHaveProperty('lng');
  });

  it('빈 행을 줘도 터지지 않는다 (CSV 헤더를 만들 때 쓴다)', () => {
    const p = toGameProvider({});
    expect(p.name).toBeNull();
    expect(Object.keys(p)).toContain('roadAddr');
  });
});

describe('providerKey — 관리번호는 지자체 안에서만 유일하다', () => {
  it('자치단체코드를 붙인다', () => {
    expect(providerKey(toGameProvider(row()))).toBe('3220000:3220000-2020-0001');
  });

  it('둘 중 하나라도 없으면 이름+주소로 물러선다', () => {
    const k = providerKey(toGameProvider(row({ MNG_NO: '' })));
    expect(k).toContain('펀시티 게임랜드');
    expect(k).toContain('판교역로 235');
  });

  it('다른 지자체의 같은 관리번호를 같은 업소로 보지 않는다', () => {
    const a = providerKey(toGameProvider(row({ OPN_ATMY_GRP_CD: '3220000', MNG_NO: 'X-1' })));
    const b = providerKey(toGameProvider(row({ OPN_ATMY_GRP_CD: '3000000', MNG_NO: 'X-1' })));
    expect(a).not.toBe(b);
  });
});

describe('dedupeProviders', () => {
  it('같은 업소가 두 번 오면 앞의 것을 남긴다', () => {
    const a = toGameProvider(row({ BPLC_NM: '먼저' }));
    const b = toGameProvider(row({ BPLC_NM: '나중' })); // 같은 자치단체+관리번호
    const out = dedupeProviders([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('먼저');
  });
});

describe('tallyBy', () => {
  it('많은 것부터 세어 준다', () => {
    const rows = [row(), row(), row({ SALS_STTS_CD: '03' })];
    expect(tallyBy(rows, 'SALS_STTS_CD')).toEqual([
      ['01', 2],
      ['03', 1],
    ]);
  });

  it('빈 값은 (빈값) 으로 묶는다 — 사라지면 합계가 안 맞는다', () => {
    expect(tallyBy([row({ SALS_STTS_CD: '' }), {}], 'SALS_STTS_CD')).toEqual([['(빈값)', 2]]);
  });
});

describe('fetchInfoPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('만든 URL 로 호출하고 응답을 해석한다', async () => {
    const spy = vi.fn(async () => new Response(okBody([row()], 1)));
    vi.stubGlobal('fetch', spy);

    const page = await fetchInfoPage({ serviceKey: 'K', pageNo: 2 });
    expect(page.rows).toHaveLength(1);

    const [url] = spy.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('pageNo')).toBe('2');
  });

  it('게이트웨이 오류는 LocaldataError 로 올라온다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_ACCESS_DENIED_ERROR' } },
            }),
          ),
      ),
    );
    await expect(fetchInfoPage({ serviceKey: 'K', pageNo: 1 })).rejects.toThrow(LocaldataError);
  });
});

describe('crawlOpenProviders', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** totalCount 를 고정하고 페이지마다 다른 관리번호를 주는 가짜 서버 */
  function fakeServer(totalCount: number, perPage: number, rowsFor?: (page: number) => LocaldataRow[]) {
    return vi.fn(async (url: URL) => {
      const page = Number(url.searchParams.get('pageNo'));
      const rows =
        rowsFor?.(page) ??
        Array.from({ length: Math.min(perPage, Math.max(0, totalCount - (page - 1) * perPage)) }, (_, i) =>
          row({ MNG_NO: `p${page}-${i}` }),
        );
      return new Response(okBody(rows, totalCount));
    });
  }

  it('마지막 페이지까지 돈다', async () => {
    const spy = fakeServer(250, 100);
    vi.stubGlobal('fetch', spy);

    const res = await crawlOpenProviders({ serviceKey: 'K' });
    expect(spy).toHaveBeenCalledTimes(3); // ceil(250/100)
    expect(res.rows).toHaveLength(250);
    expect(res.open).toHaveLength(250);
    expect(res.truncated).toBe(false);
    expect(res.pagesFetched).toBe(3);
  });

  it('영업중이 아닌 행을 걸러내고, 거르기 전 분포는 남긴다', async () => {
    vi.stubGlobal(
      'fetch',
      fakeServer(3, 100, () => [
        row({ MNG_NO: 'a' }),
        row({ MNG_NO: 'b', SALS_STTS_CD: '03', SALS_STTS_NM: '폐업', CLSBIZ_YMD: '20240101' }),
        row({ MNG_NO: 'c', DTL_SALS_STTS_NM: '영업정지' }),
      ]),
    );

    const res = await crawlOpenProviders({ serviceKey: 'K' });
    expect(res.open.map((p) => p.mngNo)).toEqual(['a']);
    expect(res.rows).toHaveLength(3);
    expect(res.statusTally).toEqual([
      ['01', 2],
      ['03', 1],
    ]);
  });

  it('maxPages 로 잘렸으면 truncated 로 알린다 — 조용히 삼키면 전체라고 착각한다', async () => {
    const spy = fakeServer(1000, 100);
    vi.stubGlobal('fetch', spy);

    const res = await crawlOpenProviders({ serviceKey: 'K', maxPages: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.truncated).toBe(true);
    expect(res.pagesFetched).toBe(2);
    expect(res.totalCount).toBe(1000);
  });

  it('페이지네이션 중 겹쳐 온 업소는 지우고 몇 건인지 알려준다', async () => {
    vi.stubGlobal(
      'fetch',
      fakeServer(2, 1, () => [row({ MNG_NO: 'same' })]),
    );

    const res = await crawlOpenProviders({ serviceKey: 'K', numOfRows: 1 });
    expect(res.rows).toHaveLength(2);
    expect(res.open).toHaveLength(1);
    expect(res.duplicates).toBe(1);
  });

  it('0건이어도 페이지를 한 번은 부르고 빈 결과를 준다', async () => {
    const spy = fakeServer(0, 100);
    vi.stubGlobal('fetch', spy);

    const res = await crawlOpenProviders({ serviceKey: 'K' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.open).toEqual([]);
    expect(res.truncated).toBe(false);
  });

  it('서버 필터를 쓰면 cond 를 붙여 보낸다', async () => {
    const spy = fakeServer(1, 100);
    vi.stubGlobal('fetch', spy);

    await crawlOpenProviders({ serviceKey: 'K', statusCode: '01', localCode: '3220000' });
    const [url] = spy.mock.calls[0] as unknown as [URL];
    expect(url.href).toContain('cond[SALS_STTS_CD::EQ]=01');
    expect(url.href).toContain('cond[OPN_ATMY_GRP_CD::EQ]=3220000');
  });

  it('onPage 로 진행 상황을 알린다', async () => {
    vi.stubGlobal('fetch', fakeServer(150, 100));
    const seen: number[] = [];
    const res = await crawlOpenProviders({
      serviceKey: 'K',
      onPage: ({ pageNo, lastPage }) => {
        seen.push(pageNo);
        expect(lastPage).toBe(2);
      },
    });
    expect(seen).toEqual([1, 2]);
    expect(res.rows).toHaveLength(150);
  });
});

describe('classifyByName — 오락실이냐 뽑기방이냐', () => {
  it('오락실 어휘가 있으면 arcade', () => {
    for (const n of ['짱오락실', '대구 게임랜드 2호점', '스타게임장', 'THE ARCADE', '지구게임파크']) {
      expect(classifyByName(n)).toBe('arcade');
    }
  });

  it('뽑기·가챠 어휘가 있으면 claw', () => {
    for (const n of ['뽑아핑 봉담2지구점', '대빵인형뽑기', '뽀끼뽀끼 강남', '미미캐쳐', '럭키크로우(LUCKY CLAW)', '토이랜드', '가챠샵 홍대']) {
      expect(classifyByName(n)).toBe('claw');
    }
  });

  it("'뽀' 계열도 잡는다 — '뽑' 으로는 안 잡히는 281곳이 있다", () => {
    expect(classifyByName('뽀바방')).toBe('claw');
    expect(classifyByName('뽀꼬뽀꼬')).toBe('claw');
    expect(classifyByName('찌꼬뽀꼬 신촌점')).toBe('claw');
  });

  it('양쪽 어휘가 다 들어 있으면 claw 가 이긴다 — 유에프오게임은 뽑기방이다', () => {
    expect(classifyByName('유에프오게임 칠곡2호점')).toBe('claw');
    expect(classifyByName('인형뽑기게임랜드')).toBe('claw');
  });

  it('가챠는 면적이 커도 claw — 가챠 기계가 작아서 42대가 110㎡ 에 들어간다', () => {
    expect(classifyByName('가챠타운')).toBe('claw');
  });

  it('띄어쓰기와 대소문자를 무시한다', () => {
    expect(classifyByName('차차 오락실')).toBe('arcade');
    expect(classifyByName('lucky claw')).toBe('claw');
    expect(classifyByName('Toy Story 부평점')).toBe('claw');
  });

  it('브랜드 이름만 있으면 unknown — 넣지도 버리지도 않는다', () => {
    for (const n of ['봉봉스테이션 역곡점', '블링팝 남춘천점', '헌터독', '민트플레이']) {
      expect(classifyByName(n)).toBe('unknown');
    }
  });

  it("'게임' 이 붙어도 그것만으로는 오락실이 아니다 — 게임박스 42㎡, 게임존 65㎡ 는 뽑기방 쪽이다", () => {
    expect(classifyByName('게임박스 1호점')).toBe('unknown');
    expect(classifyByName('블링블링게임존')).toBe('unknown');
  });

  it('빈 이름은 unknown', () => {
    expect(classifyByName('')).toBe('unknown');
    expect(classifyByName(null)).toBe('unknown');
    expect(classifyByName(undefined)).toBe('unknown');
  });
});

describe('stripCorporateForm — 인허가 원부는 간판이 아니라 사업자명을 적는다', () => {
  it('앞에 붙은 (주) 를 뺀다', () => {
    expect(stripCorporateForm('(주)대빵오락실 방이점')).toBe('대빵오락실 방이점');
    expect(stripCorporateForm('(주)엔엔 대빵오락실')).toBe('엔엔 대빵오락실');
  });

  it('풀어 쓴 주식회사도 뺀다 — 같은 체인이 두 이름으로 남으면 안 된다', () => {
    expect(stripCorporateForm('주식회사 대빵오락실 사상점')).toBe('대빵오락실 사상점');
    expect(stripCorporateForm('주식회사 엔엔대빵오락실')).toBe('엔엔대빵오락실');
  });

  it('가운데·뒤에 있어도 뺀다', () => {
    expect(stripCorporateForm('금호리조트(주) 설악오락실')).toBe('금호리조트 설악오락실');
    expect(stripCorporateForm('한화호텔앤드리조트(주) 별관 오락실')).toBe('한화호텔앤드리조트 별관 오락실');
  });

  it('지운 자리에 빈칸을 넣는다 — 그냥 지우면 두 단어가 붙는다', () => {
    expect(stripCorporateForm('리얼엔젤플러스(주)블루스톤 스포츠 내 게임장')).toBe(
      '리얼엔젤플러스 블루스톤 스포츠 내 게임장',
    );
  });

  it('㈜ 와 전각 （주） 도 같은 글자로 본다', () => {
    expect(stripCorporateForm('㈜이월드 피터팬오락실')).toBe('이월드 피터팬오락실');
    expect(stripCorporateForm('（주）이월드 히말라야오락실')).toBe('이월드 히말라야오락실');
  });

  it('여러 번 적용해도 결과가 같다 — 마이그레이션이 재실행돼도 안전해야 한다', () => {
    const once = stripCorporateForm('(주)대빵오락실 방이점');
    expect(stripCorporateForm(once)).toBe(once);
  });

  it('법인 표기가 없으면 손대지 않는다', () => {
    expect(stripCorporateForm('짱오락실')).toBe('짱오락실');
    expect(stripCorporateForm('차차 오락실')).toBe('차차 오락실');
  });

  it('통째로 사라질 이름은 원본을 남긴다 — name 은 NOT NULL 이다', () => {
    expect(stripCorporateForm('(주)')).toBe('(주)');
    expect(stripCorporateForm('주식회사')).toBe('주식회사');
  });
});

describe('spellingKey — 공백만 무시한다', () => {
  it('공백을 뺀 것이 같으면 같은 열쇠', () => {
    expect(spellingKey('대빵 오락실')).toBe(spellingKey('대빵오락실'));
    expect(spellingKey('X TOP 오락실')).toBe('XTOP오락실');
  });

  it('다른 글자는 다른 열쇠 — 이름을 뭉개지 않는다', () => {
    expect(spellingKey('왕오락실')).not.toBe(spellingKey('왕왕오락실'));
    expect(spellingKey('짱오락실')).not.toBe(spellingKey('짱오락실2호점'));
  });
});

describe('pickCanonicalName', () => {
  const v = (name: string, source: string | null = 'localdata') => ({ name, source });

  it('많이 쓰인 표기를 고른다', () => {
    expect(
      pickCanonicalName([v('왕오락실'), v('왕오락실'), v('왕오락실'), v('왕 오락실')]),
    ).toBe('왕오락실');
  });

  it('다수형이 띄어쓴 쪽이면 그쪽을 고른다 — 무조건 붙이지 않는다', () => {
    expect(
      pickCanonicalName([v('도깨비 오락실'), v('도깨비 오락실'), v('도깨비오락실')]),
    ).toBe('도깨비 오락실');
  });

  it('네이버 표기가 있으면 그 안에서만 고른다 — 간판 이름이고, 수입이 되돌리지 않는다', () => {
    expect(
      pickCanonicalName([
        v('대빵오락실'),
        v('대빵오락실'),
        v('대빵오락실'),
        v('대빵 오락실', 'naver'),
      ]),
    ).toBe('대빵 오락실');
  });

  it('네이버 표기가 여럿이면 그 안에서 다수형', () => {
    expect(
      pickCanonicalName([
        v('짱오락실'),
        v('짱 오락실', 'naver'),
        v('짱오락실', 'naver'),
        v('짱오락실', 'naver'),
      ]),
    ).toBe('짱오락실');
  });

  it('동수면 공백이 적은 쪽 — 16개 그룹이 동수라 규칙이 필요하다', () => {
    expect(pickCanonicalName([v('퀸 오락실'), v('퀸오락실')])).toBe('퀸오락실');
    expect(pickCanonicalName([v('X TOP 오락실'), v('XTOP 오락실')])).toBe('XTOP 오락실');
  });

  it('같은 입력이면 순서가 달라도 같은 답 — 실행마다 결과가 흔들리면 안 된다', () => {
    const a = [v('무지개오락실'), v('무지개 오락실')];
    expect(pickCanonicalName(a)).toBe(pickCanonicalName([...a].reverse()));
  });

  it('후보가 비면 던진다', () => {
    expect(() => pickCanonicalName([])).toThrow();
  });
});

describe('splitAtArcadeWord — 지점명이 붙어도 브랜드끼리 비교해야 한다', () => {
  it('오락실 어휘에서 자른다', () => {
    expect(splitAtArcadeWord('왕오락실 걸포점')).toEqual({ base: '왕오락실', rest: ' 걸포점' });
    expect(splitAtArcadeWord('왕 오락실(장안점)')).toEqual({ base: '왕 오락실', rest: '(장안점)' });
  });

  it('가장 앞선 어휘에서 자른다 — 뒤에 다른 업종이 더 붙는 이름이 있다', () => {
    expect(splitAtArcadeWord('대빵오락실 노래연습장 구미점')).toEqual({
      base: '대빵오락실',
      rest: ' 노래연습장 구미점',
    });
    expect(splitAtArcadeWord('왕오락실,잇츠코인노래연습장 전주한옥마을점')?.base).toBe('왕오락실');
  });

  it('대소문자를 가리지 않는다', () => {
    expect(splitAtArcadeWord('the arcade 홍대점')?.base).toBe('the arcade');
  });

  it('어휘가 없으면 null — 이름 전체를 하나로 본다', () => {
    expect(splitAtArcadeWord('민트플레이')).toBeNull();
    expect(splitAtArcadeWord('봉봉스테이션 역곡점')).toBeNull();
  });
});

describe('unifySpellings', () => {
  const r = (id: number, name: string, source: string | null = 'localdata') => ({ id, name, source });

  it('갈린 그룹만 손대고, 바꿀 행만 돌려준다', () => {
    const changes = unifySpellings([
      r(1, '왕오락실'),
      r(2, '왕오락실'),
      r(3, '왕 오락실'),
      r(4, '혼자오락실'), // 갈린 적 없음
    ]);
    expect(changes).toEqual([{ id: 3, from: '왕 오락실', to: '왕오락실' }]);
  });

  it('네이버 행은 바뀌지 않는다', () => {
    const changes = unifySpellings([
      r(1, '대빵오락실'),
      r(2, '대빵오락실'),
      r(3, '대빵 오락실', 'naver'),
    ]);
    expect(changes.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(changes.every((c) => c.to === '대빵 오락실')).toBe(true);
  });

  it('네이버 표기가 두 가지인 그룹에서도 네이버 행은 그대로 둔다', () => {
    // pickCanonicalName 이 네이버 표기를 고르는 것만으로는 부족하다 — 소수쪽
    // 네이버 행까지 바꾸면 다음 arcades:import 가 되돌린다.
    const changes = unifySpellings([
      r(1, '짱오락실'),
      r(2, '짱 오락실', 'naver'),
      r(3, '짱오락실', 'naver'),
      r(4, '짱오락실', 'naver'),
    ]);
    expect(changes).toEqual([]); // 1번은 이미 다수 네이버 표기와 같다
    const changes2 = unifySpellings([
      r(1, '짱 오락실'),
      r(2, '짱 오락실', 'naver'),
      r(3, '짱오락실', 'naver'),
      r(4, '짱오락실', 'naver'),
    ]);
    expect(changes2).toEqual([{ id: 1, from: '짱 오락실', to: '짱오락실' }]);
  });

  it('지점명이 달라도 브랜드 표기를 맞춘다 — 이름 전체로만 묶으면 놓친다', () => {
    const changes = unifySpellings([
      r(1, '왕오락실 걸포점'),
      r(2, '왕오락실 군자점'),
      r(3, '왕 오락실 신곡점'),
      r(4, '왕 오락실(장안점)'),
    ]);
    expect(changes).toEqual([
      { id: 3, from: '왕 오락실 신곡점', to: '왕오락실 신곡점' },
      { id: 4, from: '왕 오락실(장안점)', to: '왕오락실(장안점)' },
    ]);
  });

  it('지점명은 건드리지 않는다', () => {
    const changes = unifySpellings([
      r(1, '레인보우 게임랜드 A 점'),
      r(2, '레인보우 게임랜드'),
      r(3, '레인보우게임랜드 B  점'),
    ]);
    expect(changes).toEqual([
      { id: 3, from: '레인보우게임랜드 B  점', to: '레인보우 게임랜드 B  점' },
    ]);
  });

  it('한 번 맞추면 더 바꿀 것이 없다 — 멱등', () => {
    const rows = [r(1, '왕오락실'), r(2, '왕 오락실'), r(3, '왕오락실')];
    const changes = unifySpellings(rows);
    const applied = rows.map((x) => {
      const c = changes.find((y) => y.id === x.id);
      return c ? { ...x, name: c.to } : x;
    });
    expect(unifySpellings(applied)).toEqual([]);
  });

  it('표기가 하나뿐이면 아무것도 안 한다', () => {
    expect(unifySpellings([r(1, '짱오락실'), r(2, '짱오락실')])).toEqual([]);
  });
});
