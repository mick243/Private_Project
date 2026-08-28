import { describe, expect, it } from 'vitest';
import {
  attachmentIdsInBody,
  attachmentMarker,
  imageMarker,
  parseContent,
  stripMarkers,
  videoMarker,
} from '@/lib/board-content';
import type { PostAttachment } from '@/lib/board-types';

const img = (id: number): PostAttachment => ({
  id,
  url: `/api/uploads/${id}`,
  bytes: 100,
  mime: 'image/png',
});

const vid = (id: number): PostAttachment => ({
  id,
  url: `/api/uploads/${id}`,
  bytes: 5_000_000,
  mime: 'video/mp4',
});

describe('attachmentIdsInBody', () => {
  it('본문에 등장한 순서대로 돌려준다 — 표시 순서가 여기서 정해진다', () => {
    expect(attachmentIdsInBody('가[[image:9]]나[[image:3]]다')).toEqual([9, 3]);
  });

  it('사진과 동영상 마커를 함께 센다 (첨부 상한이 한 통이다)', () => {
    expect(attachmentIdsInBody('[[image:1]] 글 [[video:2]]')).toEqual([1, 2]);
  });

  it('같은 첨부를 두 번 써도 한 번만 센다', () => {
    expect(attachmentIdsInBody('[[image:5]] 사이 [[image:5]]')).toEqual([5]);
  });

  it('마커가 없으면 빈 배열', () => {
    expect(attachmentIdsInBody('그냥 글입니다')).toEqual([]);
  });

  it('0 이나 음수 id 는 무시한다 — SERIAL 은 1부터다', () => {
    expect(attachmentIdsInBody('[[image:0]][[image:7]]')).toEqual([7]);
  });

  it('아는 종류의 마커만 센다', () => {
    expect(attachmentIdsInBody('[[audio:3]][[file:4]][[video:5]]')).toEqual([5]);
  });
});

describe('attachmentMarker — 종류에 맞는 마커', () => {
  it('사진은 image, 동영상은 video', () => {
    expect(attachmentMarker(img(1))).toBe('[[image:1]]');
    expect(attachmentMarker(vid(2))).toBe('[[video:2]]');
  });
});

describe('parseContent', () => {
  it('마커 위치에서 텍스트를 끊고 첨부를 끼운다', () => {
    const segs = parseContent('앞[[image:1]]뒤', [img(1)]);
    expect(segs).toEqual([
      { kind: 'text', text: '앞' },
      { kind: 'file', file: img(1) },
      { kind: 'text', text: '뒤' },
    ]);
  });

  it('동영상 마커도 같은 규칙으로 조각이 된다', () => {
    const segs = parseContent('영상\n[[video:2]]', [vid(2)]);
    expect(segs[1]).toEqual({ kind: 'file', file: vid(2) });
  });

  it('첨부가 아닌 id 의 마커는 원문 텍스트로 남는다', () => {
    // 이걸 그려 주면 남의 업로드 id 를 본문에 적어 끌어올 수 있다.
    const segs = parseContent('앞[[image:99]]뒤', [img(1)]);
    expect(segs).toEqual([{ kind: 'text', text: '앞[[image:99]]뒤' }]);
  });

  it('인정되지 않은 마커는 앞뒤 텍스트와 한 조각으로 이어 붙는다', () => {
    const segs = parseContent('a[[image:99]]b[[image:1]]c', [img(1)]);
    expect(segs).toEqual([
      { kind: 'text', text: 'a[[image:99]]b' },
      { kind: 'file', file: img(1) },
      { kind: 'text', text: 'c' },
    ]);
  });

  it('마커 종류와 실제 mime 이 다르면 mime 을 따른다 (그리는 쪽이 사실이어야 한다)', () => {
    // `[[image:2]]` 로 적혀 있어도 첨부가 동영상이면 조각의 file 은 동영상이다.
    const segs = parseContent('[[image:2]]', [vid(2)]);
    expect(segs).toEqual([{ kind: 'file', file: vid(2) }]);
  });

  it('본문이 마커로 시작하거나 끝나도 빈 텍스트 조각을 만들지 않는다', () => {
    expect(parseContent('[[image:1]]', [img(1)])).toEqual([{ kind: 'file', file: img(1) }]);
  });

  it('줄바꿈을 그대로 보존한다 (pre-wrap 으로 렌더된다)', () => {
    const segs = parseContent('첫 줄\n[[image:1]]\n셋째 줄', [img(1)]);
    expect(segs[0]).toEqual({ kind: 'text', text: '첫 줄\n' });
    expect(segs[2]).toEqual({ kind: 'text', text: '\n셋째 줄' });
  });
});

describe('stripMarkers', () => {
  it('목록 미리보기에 마커가 새어 나가지 않는다', () => {
    expect(stripMarkers('가[[image:1]]나').includes('[[image:')).toBe(false);
    expect(stripMarkers('가[[video:1]]나').includes('[[video:')).toBe(false);
  });

  it('마커 자리를 공백으로 바꿔 단어가 붙지 않게 한다', () => {
    expect(stripMarkers('가[[image:1]]나')).toBe('가 나');
  });
});

describe('직렬화 왕복', () => {
  it('parse → 다시 조립하면 원본과 같다 (수정할 때마다 본문이 자라면 안 된다)', () => {
    const body = `첫 문단\n${imageMarker(4)}\n${videoMarker(5)}\n둘째 문단`;
    const rebuilt = parseContent(body, [img(4), vid(5)])
      .map((s) => (s.kind === 'text' ? s.text : attachmentMarker(s.file)))
      .join('');
    expect(rebuilt).toBe(body);
  });
});
