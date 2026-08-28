import { describe, expect, it } from 'vitest';
import {
  fromPlainText,
  normalizeDoc,
  safeHref,
  toPlainText,
  youtubeId,
  type RichDoc,
} from '@/lib/rich-text';

/** 문단 하나로 감싼 문서 (편집기가 보내는 모양) */
const para = (...content: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});

const text = (value: string, marks?: unknown[]) =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

describe('normalizeDoc — 스키마 밖의 것은 저장되지 않는다', () => {
  it('doc 이 아니면 null', () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc({ type: 'paragraph' })).toBeNull();
    expect(normalizeDoc('그냥 문자열')).toBeNull();
  });

  it('JSON 문자열도 받는다 (jsonb 를 문자열로 돌려주는 드라이버 대비)', () => {
    const doc = normalizeDoc(JSON.stringify(para(text('안녕'))));
    expect(doc?.content[0].content?.[0].text).toBe('안녕');
  });

  it('글자도 이미지도 없는 문서는 null — 저장할 이유가 없다', () => {
    expect(normalizeDoc(para())).toBeNull();
    expect(normalizeDoc(para(text('   ')))).toBeNull();
  });

  it('구분선만 있어도 내용으로 인정한다', () => {
    expect(normalizeDoc({ type: 'doc', content: [{ type: 'horizontalRule' }] })).not.toBeNull();
  });

  it('모르는 블록은 버리고 아는 블록만 남긴다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'iframe', attrs: { src: 'https://evil.example' } },
        { type: 'paragraph', content: [text('본문')] },
        { type: 'script', content: [text('alert(1)')] },
      ],
    });
    expect(doc?.content.map((n) => n.type)).toEqual(['paragraph']);
  });

  it('모르는 mark 는 버리고 서식 mark 만 남긴다', () => {
    const doc = normalizeDoc(
      para(text('굵게', [{ type: 'bold' }, { type: 'blink' }, { type: 'highlight' }])),
    );
    expect(doc?.content[0].content?.[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('팔레트에 없는 색·크기·서체는 통째로 버린다', () => {
    const doc = normalizeDoc(
      para(
        text('빨강', [{ type: 'textStyle', attrs: { color: '#f2555a' } }]),
        text('임의색', [{ type: 'textStyle', attrs: { color: 'red' } }]),
        text('임의크기', [{ type: 'textStyle', attrs: { fontSize: '400px' } }]),
        text('임의서체', [{ type: 'textStyle', attrs: { fontFamily: 'url(evil)' } }]),
      ),
    );
    const marks = doc?.content[0].content?.map((n) => n.marks);
    expect(marks?.[0]).toEqual([{ type: 'textStyle', attrs: { color: '#f2555a' } }]);
    expect(marks?.[1]).toBeUndefined();
    expect(marks?.[2]).toBeUndefined();
    expect(marks?.[3]).toBeUndefined();
  });

  it('제목 단계는 1~3 으로 좁힌다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 9 }, content: [text('제목')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('제목2')] },
      ],
    });
    expect(doc?.content.map((n) => n.attrs?.level)).toEqual([1, 2]);
  });

  it("기본값인 왼쪽 정렬은 저장하지 않는다", () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'left' }, content: [text('왼쪽')] },
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('가운데')] },
        { type: 'paragraph', attrs: { textAlign: 'weird' }, content: [text('이상') ] },
      ],
    });
    expect(doc?.content.map((n) => n.attrs?.textAlign)).toEqual([undefined, 'center', undefined]);
  });

  it('첨부 id 가 아닌 사진·동영상 노드는 버린다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'postImage', attrs: { attachmentId: 0 } },
        { type: 'postImage', attrs: { attachmentId: -3 } },
        { type: 'postImage', attrs: { attachmentId: '12' } },
        { type: 'postVideo', attrs: { attachmentId: 13 } },
        { type: 'postVideo', attrs: {} },
        { type: 'paragraph', content: [text('끝')] },
      ],
    });
    expect(doc?.content.filter((n) => n.type !== 'paragraph')).toEqual([
      { type: 'postImage', attrs: { attachmentId: 12 } },
      { type: 'postVideo', attrs: { attachmentId: 13 } },
    ]);
  });

  it('동영상만 있는 문서도 내용으로 인정한다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [{ type: 'postVideo', attrs: { attachmentId: 4 } }],
    });
    expect(doc).not.toBeNull();
  });

  it('코드블록은 더 이상 스키마에 없다 — 통째로 버린다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [text('const a = 1')] },
        { type: 'paragraph', content: [text('본문')] },
      ],
    });
    expect(doc?.content.map((n) => n.type)).toEqual(['paragraph']);
  });

  it('행간(lineHeight)도 더 이상 저장하지 않는다', () => {
    const doc = normalizeDoc(
      para(text('넓게', [{ type: 'textStyle', attrs: { lineHeight: '2.2' } }])),
    );
    expect(doc?.content[0].content?.[0].marks).toBeUndefined();
  });

  it('표는 행·칸만 남고 병합 값은 범위 안으로 좁혀진다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', attrs: { colspan: 999 }, content: [{ type: 'paragraph', content: [text('머리')] }] },
                { type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [text('칸')] }] },
                { type: 'div', content: [] },
              ],
            },
          ],
        },
      ],
    });
    const cells = doc?.content[0].content?.[0].content;
    expect(cells?.map((c) => c.type)).toEqual(['tableHeader', 'tableCell']);
    expect(cells?.[0].attrs).toBeUndefined(); // 999 는 버려짐
    expect(cells?.[1].attrs).toEqual({ colspan: 2 });
  });

  it('노드 수 상한을 넘으면 잘라 낸다 (구조만 부풀린 문서 방어)', () => {
    const many = Array.from({ length: 5000 }, () => ({
      type: 'paragraph',
      content: [text('가')],
    }));
    const doc = normalizeDoc({ type: 'doc', content: many });
    expect(doc?.content.length).toBeGreaterThan(0);
    expect(doc?.content.length).toBeLessThan(2000);
  });

  it('깊게 중첩된 인용구는 상한에서 멈춘다', () => {
    let node: unknown = { type: 'paragraph', content: [text('깊음')] };
    for (let i = 0; i < 40; i += 1) node = { type: 'blockquote', content: [node] };
    const doc = normalizeDoc({ type: 'doc', content: [node] });

    let depth = 0;
    let cursor = doc?.content[0];
    while (cursor?.type === 'blockquote') {
      depth += 1;
      cursor = cursor.content?.[0];
    }
    expect(depth).toBeLessThanOrEqual(13);
  });
});

describe('safeHref — 링크 주소', () => {
  it('http · https 만 통과', () => {
    expect(safeHref('https://arcade.example/글')).toBe('https://arcade.example/글');
    expect(safeHref('http://arcade.example')).toBe('http://arcade.example');
  });

  it('클릭 한 번에 스크립트가 되는 주소는 막는다', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('blob:https://x/y')).toBeNull();
  });

  it('앱 안쪽 경로도 막는다 (본문에서 /api 를 부르게 하는 링크 방지)', () => {
    expect(safeHref('/api/posts/1')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
  });

  it('link mark 의 주소가 걸러지면 mark 자체가 사라진다', () => {
    const doc = normalizeDoc(
      para(text('눌러보세요', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    );
    expect(doc?.content[0].content?.[0].marks).toBeUndefined();
  });
});

describe('youtubeId — 주소가 아니라 id 만 저장한다', () => {
  it('여러 형태의 주소에서 id 를 뽑는다', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('유튜브가 아니면 null', () => {
    expect(youtubeId('https://evil.example/embed/xxxxxxxxxxx')).toBeNull();
    expect(youtubeId('https://youtu.be/짧음')).toBeNull();
  });

  it('id 형식이 아닌 videoId 는 저장되지 않는다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [{ type: 'youtube', attrs: { videoId: '"></iframe><script>' } }],
    });
    expect(doc).toBeNull();
  });
});

describe('toPlainText — 검색·미리보기·이미지 연결이 보는 평문', () => {
  it('문단은 줄바꿈으로, 줄바꿈 노드도 줄바꿈으로', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [text('첫 줄'), { type: 'hardBreak' }, text('둘째 줄')] },
        { type: 'paragraph', content: [text('다음 문단')] },
      ],
    }) as RichDoc;
    expect(toPlainText(doc)).toBe('첫 줄\n둘째 줄\n다음 문단');
  });

  it('첨부는 마커로 남는다 — 이게 첨부 연결의 근거다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [text('사진 보세요')] },
        { type: 'postImage', attrs: { attachmentId: 7 } },
        { type: 'postVideo', attrs: { attachmentId: 8 } },
      ],
    }) as RichDoc;
    expect(toPlainText(doc)).toBe('사진 보세요\n[[image:7]]\n[[video:8]]');
  });

  it('영상은 주소로 남는다 — 영상만 있는 글도 본문이 비지 않는다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [{ type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ' } }],
    }) as RichDoc;
    expect(toPlainText(doc)).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('목록은 글머리를, 표는 칸 사이 탭을 남긴다', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('하나')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('둘')] }] },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [text('A')] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [text('B')] }] },
              ],
            },
          ],
        },
      ],
    }) as RichDoc;
    expect(toPlainText(doc)).toBe('· 하나\n· 둘\nA\tB');
  });

  it('서식은 평문에 흔적을 남기지 않는다', () => {
    const doc = normalizeDoc(
      para(text('굵고', [{ type: 'bold' }]), text(' 빨강', [
        { type: 'textStyle', attrs: { color: '#f2555a' } },
      ])),
    ) as RichDoc;
    expect(toPlainText(doc)).toBe('굵고 빨강');
  });
});

describe('fromPlainText — 옛 글을 편집기에 올린다', () => {
  const image = { id: 3, url: '/api/uploads/3', bytes: 10, mime: 'image/png' };
  const video = { id: 4, url: '/api/uploads/4', bytes: 999, mime: 'video/quicktime' };

  it('줄마다 문단이 된다', () => {
    const doc = fromPlainText('첫 줄\n둘째 줄', []);
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '첫 줄' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '둘째 줄' }] },
    ]);
  });

  it('첨부 마커는 사진·동영상 블록이 된다 (종류는 mime 이 정한다)', () => {
    const doc = fromPlainText('사진\n[[image:3]]\n[[video:4]]', [image, video]);
    expect(doc.content.map((n) => n.type)).toEqual(['paragraph', 'postImage', 'postVideo']);
    expect(doc.content[1].attrs).toEqual({ attachmentId: 3 });
    expect(doc.content[2].attrs).toEqual({ attachmentId: 4 });
  });

  it('첨부가 아닌 마커는 글자로 남는다 (남의 이미지를 끌어오지 못한다)', () => {
    const doc = fromPlainText('[[image:999]]', [image]);
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '[[image:999]]' }] },
    ]);
  });

  it('빈 본문도 문단 하나로 시작한다 (편집기가 커서를 놓을 자리)', () => {
    expect(fromPlainText('', []).content).toEqual([{ type: 'paragraph', content: [] }]);
  });

  it('평문 → 문서 → 평문 이 같은 글자를 돌려준다', () => {
    const body = '첫 줄\n둘째 줄\n[[image:3]]\n[[video:4]]';
    const doc = normalizeDoc(fromPlainText(body, [image, video])) as RichDoc;
    expect(toPlainText(doc)).toBe(body);
  });
});
