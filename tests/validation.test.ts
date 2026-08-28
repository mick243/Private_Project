import { describe, expect, it } from 'vitest';
import {
  commentInputSchema,
  formatIssues,
  parseListQuery,
  parsePostQuery,
  parseReportQuery,
  nicknameInputSchema,
  postInputSchema,
  reportInputSchema,
  signupInputSchema,
} from '@/lib/validation';
import { CHART_TAGS } from '@/lib/community-types';

const report = (over: Record<string, unknown>) =>
  reportInputSchema.safeParse({ machineId: 1, kind: 'queue', waitCount: 3, ...over });

describe('reportInputSchema — 종류마다 필수 칸이 다르다', () => {
  it('대기 제보는 인원이 있어야 한다', () => {
    const r = report({ kind: 'queue', waitCount: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error)).toContain('waitCount: 대기 인원을 입력해 주세요');
  });

  it('컨디션 제보는 값과 기체가 둘 다 있어야 한다', () => {
    const noValue = report({ kind: 'condition', waitCount: null, cabinetId: 7 });
    expect(noValue.success).toBe(false);

    const noCabinet = report({ kind: 'condition', waitCount: null, condition: 4 });
    expect(noCabinet.success).toBe(false);
    if (!noCabinet.success) {
      expect(formatIssues(noCabinet.error)).toContain('cabinetId: 어느 기체인지 골라 주세요');
    }
  });

  it('종류에 안 맞는 값은 잘라낸다 — DB CHECK 에 닿기 전에', () => {
    // 대기 제보에 컨디션·기체가 섞여 와도 null 로 정리되어야 한다.
    const r = report({ kind: 'queue', waitCount: 3, condition: 5, cabinetId: 9 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.condition).toBeNull();
      expect(r.data.cabinetId).toBeNull();
      expect(r.data.waitCount).toBe(3);
    }
  });

  it('있어요/없어졌어요는 페이로드 없이 통과한다', () => {
    const r = report({ kind: 'presence', waitCount: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.waitCount).toBeNull();
  });

  it('익명 제보를 허용한다 (playerId 생략 → null)', () => {
    const r = report({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.playerId).toBeNull();
  });

  it('DB 범위를 벗어난 값은 막는다', () => {
    expect(report({ waitCount: 100 }).success).toBe(false);
    expect(report({ kind: 'condition', waitCount: null, condition: 6, cabinetId: 1 }).success)
      .toBe(false);
  });

  it('빈 메모는 null 로 정규화한다 — 빈 문자열이 DB 에 쌓이지 않게', () => {
    const r = report({ comment: '   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.comment).toBeNull();
  });
});

const post = (over: Record<string, unknown>) =>
  postInputSchema.safeParse({
    machineId: 1,
    category: 'free',
    playerId: 1,
    title: '제목입니다',
    body: '내용입니다',
    ...over,
  });

describe('postInputSchema — 붙는 첨부는 본문 마커가 근거다', () => {
  it('첨부만 있고 글이 없어도 통과한다', () => {
    expect(post({ body: '[[image:3]]' }).success).toBe(true);
    expect(post({ body: '[[video:3]]' }).success).toBe(true);
  });

  it('글도 첨부도 없으면 막는다', () => {
    const r = post({ body: '   ' });
    expect(r.success).toBe(false);
  });

  it('본문 마커가 5개를 넘으면 막는다 — 사진과 동영상을 합쳐 센다', () => {
    const six = [1, 2, 3, 4].map((n) => `[[image:${n}]]`).join('') + '[[video:5]][[video:6]]';
    const r = post({ body: six });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error).join()).toContain('5개');
  });

  it('같은 첨부를 여러 번 써도 개수로 세지 않는다', () => {
    const body = Array(8).fill('[[image:1]]').join('');
    expect(post({ body }).success).toBe(true);
  });

  it('문서(bodyDoc)를 보내면 평문은 서버가 다시 만든다 — 보낸 body 는 무시된다', () => {
    const r = post({
      body: '거짓 평문',
      bodyDoc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '진짜 본문' }] },
          { type: 'postVideo', attrs: { attachmentId: 9 } },
        ],
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.body).toBe('진짜 본문\n[[video:9]]');
      expect(r.data.bodyDoc?.content).toHaveLength(2);
    }
  });

  it('스키마 밖의 문서를 보내면 문서 없이(평문만) 저장된다', () => {
    const r = post({ body: '평문만', bodyDoc: { type: 'script', content: [] } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.bodyDoc).toBeNull();
      expect(r.data.body).toBe('평문만');
    }
  });

  it('제목이 너무 짧으면 막는다', () => {
    expect(post({ title: 'x' }).success).toBe(false);
  });
});

describe('postInputSchema — 게임은 공지에서만 생략할 수 있다', () => {
  it('일반 글은 게임이 없으면 막는다', () => {
    const r = post({ machineId: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error).join()).toContain('게임을 선택해 주세요');
  });

  it('아예 보내지 않아도 같은 판단이다 (기본값 null)', () => {
    const r = postInputSchema.safeParse({
      category: 'free',
      playerId: 1,
      title: '제목입니다',
      body: '내용입니다',
    });
    expect(r.success).toBe(false);
  });

  it('공지는 게임 없이 통과한다', () => {
    const r = post({ category: 'notice', machineId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.machineId).toBeNull();
  });

  it('공지에 게임을 골라 보내도 게임 없는 글로 저장된다', () => {
    // 모든 탭 맨 위에 붙는 글이라 게임 값이 화면에 쓰이지 않는다 — 남겨 두면
    // 탭 글 수만 부풀린다.
    const r = post({ category: 'notice', machineId: 3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.machineId).toBeNull();
  });
});

describe('쿼리스트링 파서 — 사용자가 주는 값이라 전부 방어한다', () => {
  const q = (s: string) => new URLSearchParams(s);

  it('parsePostQuery: 모르는 정렬 키는 recent 로 떨어진다', () => {
    expect(parsePostQuery(q('sort=DROP')).sort).toBe('recent');
    expect(parsePostQuery(q('sort=popular')).sort).toBe('popular');
  });

  it('parsePostQuery: limit 은 100 을 넘지 못한다', () => {
    expect(parsePostQuery(q('limit=99999')).limit).toBe(100);
    expect(parsePostQuery(q('')).limit).toBe(20);
  });

  it('parsePostQuery: 음수·문자 offset 은 0 으로', () => {
    expect(parsePostQuery(q('offset=-5')).offset).toBe(0);
    expect(parsePostQuery(q('offset=abc')).offset).toBe(0);
    expect(parsePostQuery(q('offset=40')).offset).toBe(40);
  });

  it('parsePostQuery: machineId 없음 = 전체 탭', () => {
    expect(parsePostQuery(q('')).machineId).toBeNull();
    expect(parsePostQuery(q('machineId=0')).machineId).toBeNull();
  });

  it('parseReportQuery: 모르는 kind 는 걸러내고, 다 걸러지면 null', () => {
    expect(parseReportQuery(q('kind=queue,nope')).kinds).toEqual(['queue']);
    expect(parseReportQuery(q('kind=nope')).kinds).toBeNull();
  });

  /**
   * 검색어(q) — 게시판과 제보 피드가 같은 파서를 씁니다. 둘 다 확인하는 이유:
   * 한쪽에만 규칙을 넣고 다른 쪽을 잊는 것이 이 두 함수가 어긋나는 방식입니다.
   */
  describe('검색어(q)', () => {
    const both = [
      ['parsePostQuery', parsePostQuery],
      ['parseReportQuery', parseReportQuery],
    ] as const;

    for (const [name, parse] of both) {
      it(`${name}: 없거나 공백뿐이면 null — 빈 검색은 안 거른 것과 같다`, () => {
        expect(parse(q('')).q).toBeNull();
        expect(parse(q('q=')).q).toBeNull();
        expect(parse(q('q=%20%20')).q).toBeNull();
      });

      it(`${name}: 양옆 공백을 떼고 가운데 공백은 남긴다`, () => {
        expect(parse(q('q=%20%20발판%20소리%20%20')).q).toBe('발판 소리');
      });

      it(`${name}: 긴 검색어는 잘린다 — ILIKE 패턴이 그대로 되므로 상한이 있어야 한다`, () => {
        const long = 'ㄱ'.repeat(500);
        const got = parse(q(`q=${encodeURIComponent(long)}`)).q;
        expect(got).not.toBeNull();
        expect(got!.length).toBeLessThanOrEqual(60);
      });
    }
  });

  it('parseListQuery: machines 는 양의 정수만 남긴다', () => {
    expect(parseListQuery(q('machines=1,abc,-2,3')).machineIds).toEqual([1, 3]);
    expect(parseListQuery(q('machines=')).machineIds).toBeNull();
  });

  it('parseListQuery: 좌표는 음수를 허용한다 (서경·남위)', () => {
    const p = parseListQuery(q('lat=-33.8&lng=-70.6&radius=5'));
    expect(p.lat).toBe(-33.8);
    expect(p.lng).toBe(-70.6);
    expect(p.radiusKm).toBe(5);
  });
});

describe('signupInputSchema — 값을 처음 정하는 자리라 깐깐하게 본다', () => {
  const signup = (over: Record<string, unknown> = {}) =>
    signupInputSchema.safeParse({
      nickname: '펌린이',
      password: 'hunter2hunter',
      passwordConfirm: 'hunter2hunter',
      ...over,
    });

  it('제대로 채우면 통과한다', () => {
    expect(signup().success).toBe(true);
  });

  it('아이디는 곧 화면에 찍히는 닉네임이라 공백을 막는다', () => {
    expect(signup({ nickname: '펌 린이' }).success).toBe(false);
    expect(signup({ nickname: 'ㄱ' }).success).toBe(false);
    expect(signup({ nickname: 'ㄱ'.repeat(21) }).success).toBe(false);
  });

  it('앞뒤 공백은 잘라내고 받는다 — 겉보기 같은 이름이 둘 생기지 않도록', () => {
    const r = signup({ nickname: '  펌린이  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nickname).toBe('펌린이');
  });

  it('비밀번호 확인은 서버에서도 본다 — 브라우저를 거치지 않는 요청이 있다', () => {
    const r = signup({ passwordConfirm: '다른값입니다' });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error)).toContain('passwordConfirm: 비밀번호가 서로 다릅니다');
  });

  it('짧은 비밀번호는 막는다', () => {
    expect(signup({ password: 'short', passwordConfirm: 'short' }).success).toBe(false);
  });
});

describe('nicknameInputSchema — 소셜로 들어온 사람이 이름을 처음 정하는 자리', () => {
  const claim = (nickname: unknown) => nicknameInputSchema.safeParse({ nickname });

  it('가입 화면과 같은 규칙으로 본다 — 들어가는 칸이 players.nickname 하나이므로', () => {
    expect(claim('펌린이').success).toBe(true);
    expect(claim('ㄱ').success).toBe(false);
    expect(claim('ㄱ'.repeat(21)).success).toBe(false);
    expect(claim('펌 린이').success).toBe(false);
  });

  it('부르는 말만 다르다 — 안내 문구는 아이디가 아니라 닉네임이라고 한다', () => {
    const r = claim('ㄱ');
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error)).toContain('nickname: 닉네임은 2자 이상이어야 합니다');
  });

  it('앞뒤 공백은 잘라내고 받는다 — 겉보기 같은 이름이 둘 생기지 않도록', () => {
    const r = claim('  펌린이  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nickname).toBe('펌린이');
  });

  it('비밀번호는 선택이다 — 확인 값이 맞으면 함께 받는다', () => {
    const r = nicknameInputSchema.safeParse({
      nickname: '펌린이',
      password: 'hunter2hunter',
      passwordConfirm: 'hunter2hunter',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.password).toBe('hunter2hunter');
  });

  it('비밀번호를 채웠으면 가입과 같은 규칙을 적용한다', () => {
    // 확인 값 불일치
    expect(
      nicknameInputSchema.safeParse({
        nickname: '펌린이',
        password: 'hunter2hunter',
        passwordConfirm: '다른값입니다',
      }).success,
    ).toBe(false);
    // 최소 길이 미달
    expect(
      nicknameInputSchema.safeParse({
        nickname: '펌린이',
        password: 'short',
        passwordConfirm: 'short',
      }).success,
    ).toBe(false);
  });

  it('빈 문자열 비밀번호는 "설정 안 함" 으로 본다 — 폼이 빈 칸을 그대로 보낸다', () => {
    const r = nicknameInputSchema.safeParse({ nickname: '펌린이', password: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.password).toBeUndefined();
  });

  it('조합형(NFD) 한글은 완성형(NFC)으로 맞춰 받는다 — 겉보기 같은 이름 둘 방지', () => {
    const nfd = '펌린이'.normalize('NFD');
    expect(nfd).not.toBe('펌린이'); // 전제: 두 표기는 바이트가 다르다
    const r = claim(nfd);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nickname).toBe('펌린이');
  });

  it('보이지 않는 문자는 막는다 — 기존 이름과 똑같아 보이는 다른 이름을 만들 수 있다', () => {
    expect(claim('펌린​이').success).toBe(false); // zero-width space
    expect(claim('펌린﻿이').success).toBe(false); // BOM (끝에 오면 trim 이 지우므로 중간에)
    expect(claim('펌린­이').success).toBe(false); // soft hyphen
  });
});

const comment = (tags: unknown) =>
  commentInputSchema.safeParse({ playerId: 1, body: '폭타가 정직하게 나옵니다', tags });

describe('commentInputSchema — 성향 태그는 고정 목록만 받는다', () => {
  it('목록에 있는 태그는 통과한다', () => {
    const r = comment(['연타', '체중이동', '저속', '기믹']);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual(['연타', '체중이동', '저속', '기믹']);
  });

  it('목록에서 뺀 태그는 막는다 — 목록과 저장된 값이 어긋나면 수정이 불가능해진다', () => {
    for (const dropped of ['물렙', '불렙', '개인차', '기습']) {
      expect(comment([dropped]).success).toBe(false);
      expect(CHART_TAGS).not.toContain(dropped);
    }
  });

  it('목록에 없는 자유 입력은 막는다 — 같은 뜻이 여러 표기로 쌓이지 않게', () => {
    expect(comment(['폭타패턴']).success).toBe(false);
  });

  it('5개 이상은 막는다', () => {
    expect(comment(['폭타', '떨기', '틀기', '연타']).success).toBe(true);
    expect(comment(['폭타', '떨기', '틀기', '연타', '체력']).success).toBe(false);
  });
});
