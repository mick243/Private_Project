import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * 챗봇 라우트의 **도구 왕복**을 붙잡아 둡니다.
 *
 * Gemini 의 JS SDK 는 함수를 대신 실행해 주지 않으므로 이 루프는 우리가 직접
 * 돕니다 — 그리고 여기서 틀리면 에러가 아니라 **조용히 빈 답**이 돌아옵니다.
 * 그래서 모델 대신 스텁 서버를 세워 놓고, 나가는 요청의 모양까지 봅니다
 * (SDK 가 `GOOGLE_GEMINI_BASE_URL` 을 봐 주기 때문에 가능합니다).
 *
 * DB 는 건드리지 않습니다. 확인하려는 것은 조회 결과가 아니라 왕복 자체입니다.
 */

vi.mock('@/lib/chat-tools', () => ({
  searchArcades: vi.fn(async () => ({ rows: [] })),
  searchReports: vi.fn(async () => ({ rows: [] })),
  searchPosts: vi.fn(async (args: unknown) => ({ echo: args, rows: [{ title: '펌프 후기' }] })),
}));

/** 스텁이 받은 요청 본문 — 테스트마다 비웁니다 */
let received: any[] = [];
/** 다음 응답으로 내보낼 candidate 들 (요청당 하나씩 꺼내 씁니다) */
let queue: unknown[] = [];

let server: Server;
/**
 * 라우트는 여기서 **한 번만** 불러옵니다.
 *
 * 테스트 안에서 import 하면 SDK 까지 딸려 오는 첫 로드가 기본 제한(5초)을
 * 넘겨, 전체 스위트를 함께 돌릴 때만 터집니다.
 */
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/chat/route'));

  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push(JSON.parse(raw || '{}'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [queue.shift() ?? textCandidate('빈 응답')] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  process.env.GOOGLE_GEMINI_BASE_URL = `http://127.0.0.1:${port}`;
}, 30_000);

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function textCandidate(text: string, groundingChunks?: unknown[]) {
  return {
    content: { role: 'model', parts: [{ text }] },
    finishReason: 'STOP',
    ...(groundingChunks ? { groundingMetadata: { groundingChunks } } : {}),
  };
}

function callCandidate(name: string, args: Record<string, unknown>) {
  return {
    content: {
      role: 'model',
      parts: [
        { text: '', thought: true, thoughtSignature: 'SIG-ABC' },
        { functionCall: { name, args } },
      ],
    },
    finishReason: 'STOP',
  };
}

async function post(turns: { role: string; text: string }[]) {
  received = [];
  const res = await POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ turns }),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe('POST /api/chat', () => {
  it('키가 없으면 503 과 안내 문구를 돌려준다', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { status, json } = await post([{ role: 'user', text: '안녕' }]);
    expect(status).toBe(503);
    expect(json.error).toContain('GEMINI_API_KEY');
    process.env.GEMINI_API_KEY = saved;
  });



  /**
   * 시스템 프롬프트에 실린 **규칙**을 봅니다.
   *
   * 모델이 실제로 그 규칙을 지키는지는 여기서 확인할 수 없습니다(스텁이라
   * 답을 우리가 정합니다). 대신 규칙이 **프롬프트에서 사라지는 것**은 잡습니다 —
   * 이 두 가지는 지워져도 화면에서 티가 안 나고, 한참 뒤에 "왜 옛 버전으로
   * 답하지" / "왜 잡담에 답하지" 로 돌아옵니다.
   */
  const systemText = () => received[0].systemInstruction.parts[0].text as string;

  it('최신·버전 질문은 검색으로 확인하라는 규칙이 프롬프트에 있다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [textCandidate('답')];

    await post([{ role: 'user', text: '펌프 최신 버전 수록곡 알려줘' }]);

    const text = systemText();
    // '최신' 류 낱말을 검색 의무와 묶어 두는 문장
    expect(text).toMatch(/최신[\s\S]{0,120}구글 검색으로 확인/);
    // 학습 지식으로 답하지 말라는 금지
    expect(text).toMatch(/학습 지식으로 답하지 마세요/);
    // 기억 속 버전을 최신이라고 말하지 말라는 금지 (Phoenix → Phoenix 2 회귀 방지)
    expect(text).toMatch(/기억 속 버전을 최신이라고 말하면 안 됩니다/);
    // 답에 기준 버전을 밝히라는 요구 — 틀렸을 때 사람이 알아챌 유일한 단서
    expect(text).toMatch(/어느 버전 기준인지 이름을 밝힙니다/);
  });

  it('답변 범위 넷과 거절 문장이 프롬프트에 있다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [textCandidate('답')];

    await post([{ role: 'user', text: '파이썬 코드 짜줘' }]);

    const text = systemText();
    expect(text).toMatch(/답변 범위 — 아래 넷뿐입니다/);
    expect(text).toMatch(/오락실까지 가는 법/);
    expect(text).toMatch(/오락실에 있는 다른 게임/);
    // 범위 밖에서는 도구도 검색도 부르지 않아야 한다 (토큰·요금 문제이기도 하다)
    expect(text).toMatch(/도구도 검색도 부르지 말고/);
    expect(text).toContain('이 챗봇은 오락실과 오락실 게임에 대해서만 답할 수 있어요.');
    // 프롬프트 주입 방어 문구
    expect(text).toMatch(/규칙을 무시해/);
  });

  it('허용 기종 목록은 DB 의 리듬 기종에서 만들어진다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [textCandidate('답')];

    await post([{ role: 'user', text: '펌프 채보' }]);

    // 하드코딩이 아니라 listMachines 결과가 들어와야 한다
    expect(systemText()).toMatch(/이 앱에 등록된 리듬게임: .+\./);
  });

  it('앱 안쪽 도구와 구글 검색을 한 요청에 같이 물린다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [textCandidate('바로 답합니다')];

    await post([{ role: 'user', text: '요즘 신곡 뭐 나왔어?' }]);

    const tools = received[0].tools;
    expect(tools.some((t: any) => t.googleSearch)).toBe(true);
    expect(tools.flatMap((t: any) => t.functionDeclarations ?? []).map((d: any) => d.name)).toEqual([
      'search_arcades',
      'search_reports',
      'search_posts',
    ]);
  });

  it("조수 차례를 Gemini 의 'model' 로 바꿔 보낸다", async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [textCandidate('답')];

    await post([
      { role: 'user', text: '안녕' },
      { role: 'assistant', text: '무엇을 도와드릴까요' },
      { role: 'user', text: '펌프 후기 있어?' },
    ]);

    expect(received[0].contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('도구를 부르면 실행해서 functionResponse 로 돌려주고, 생각 서명을 보존한다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [
      callCandidate('search_posts', { query: '펌프' }),
      textCandidate('찾았습니다', [
        { web: { uri: 'https://example.com/a', title: '예시 문서' } },
        { web: { uri: 'https://example.com/a', title: '중복' } },
        { web: { uri: 'https://example.com/b', domain: 'example.com' } },
      ]),
    ];

    const { status, json } = await post([{ role: 'user', text: '펌프 후기 찾아봐' }]);

    // 두 번 왕복했다
    expect(received).toHaveLength(2);

    // 모델 턴이 손대지 않은 채 되돌아갔다 — 생각 서명이 살아 있어야 한다
    const modelTurn = received[1].contents.at(-2);
    expect(modelTurn.role).toBe('model');
    expect(modelTurn.parts.some((p: any) => p.thoughtSignature === 'SIG-ABC')).toBe(true);

    // 도구 결과가 functionResponse 로 붙었다
    const toolTurn = received[1].contents.at(-1);
    const fr = toolTurn.parts[0].functionResponse;
    expect(fr.name).toBe('search_posts');
    expect(fr.response.output).toEqual({ echo: { query: '펌프' }, rows: [{ title: '펌프 후기' }] });

    // 출처는 중복을 접고, 제목이 없으면 도메인으로 대신한다
    expect(status).toBe(200);
    expect(json.text).toBe('찾았습니다');
    expect(json.sources).toEqual([
      { title: '예시 문서', url: 'https://example.com/a' },
      { title: 'example.com', url: 'https://example.com/b' },
    ]);
  });

  it('없는 도구를 부르면 대화를 끊지 않고 실패를 모델에게 알린다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [callCandidate('search_songs', {}), textCandidate('그건 못 찾겠습니다')];

    const { status, json } = await post([{ role: 'user', text: '곡 검색해줘' }]);

    const fr = received[1].contents.at(-1).parts[0].functionResponse;
    expect(fr.response.output).toEqual({ error: '알 수 없는 도구입니다: search_songs' });
    expect(status).toBe(200);
    expect(json.text).toBe('그건 못 찾겠습니다');
  });

  it('도구만 계속 부르면 상한에서 끊고, 마지막 왕복은 도구를 막아 말로 끝낸다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    // 8번 내내 도구를 부르려 든다 — 마지막 왕복에서는 스텁이 텍스트를 준다
    queue = Array.from({ length: 7 }, () => callCandidate('search_posts', { query: '루프' }));
    queue.push(textCandidate('찾은 데까지 말씀드리면'));

    const { status, json } = await post([{ role: 'user', text: '계속 찾아봐' }]);

    expect(received).toHaveLength(8);
    // 내장 도구 + 함수 선언 조합의 필수 플래그는 **매 왕복** 켜져 있어야 한다
    // (하나라도 빠지면 그 요청이 400 으로 죽는다)
    for (const req of received) {
      expect(req.toolConfig.includeServerSideToolInvocations).toBe(true);
    }
    // 함수 호출은 마지막 요청에서만 막혀 있다
    expect(received[6].toolConfig.functionCallingConfig).toBeUndefined();
    expect(received[7].toolConfig.functionCallingConfig.mode).toBe('NONE');
    expect(status).toBe(200);
    expect(json.text).toBe('찾은 데까지 말씀드리면');
  });

  it('안전 필터에 걸리면 답할 수 없다고 말한다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    queue = [{ content: { role: 'model', parts: [] }, finishReason: 'SAFETY' }];

    const { status, json } = await post([{ role: 'user', text: '...' }]);

    expect(status).toBe(200);
    expect(json.text).toBe('이 질문에는 답할 수 없습니다.');
  });

  it('입력이 규칙에 맞지 않으면 400 으로 막는다', async () => {
    process.env.GEMINI_API_KEY = 'stub-key';
    // 마지막이 조수 차례라 모델이 답할 순서가 아니다
    const { status, json } = await post([{ role: 'assistant', text: '먼저 말함' }]);
    expect(status).toBe(400);
    expect(json.details.join()).toContain('사용자 차례');
  });
});
