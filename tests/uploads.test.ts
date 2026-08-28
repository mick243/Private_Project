import { describe, expect, it } from 'vitest';
import {
  detect,
  isVideoMime,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from '@/lib/uploads';

/**
 * 업로드 형식 판정.
 *
 * 확장자와 Content-Type 은 클라이언트가 말하는 값이라 보지 않습니다 — 그래서
 * 이 함수가 사실상 업로드 화이트리스트입니다.
 */

/** 앞부분만 진짜인 파일 조각 (판정은 앞 12바이트만 본다) */
const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** ISO-BMFF: [크기 4바이트]['ftyp'][브랜드 4바이트] */
const isoBmff = (brand: string) =>
  bytes(0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0);

describe('detect — 사진', () => {
  it('JPEG', () => {
    expect(detect(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))?.mime).toBe('image/jpeg');
  });

  it('PNG', () => {
    expect(detect(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
  });

  it('GIF (87a · 89a)', () => {
    expect(detect(bytes(...ascii('GIF87a')))?.mime).toBe('image/gif');
    expect(detect(bytes(...ascii('GIF89a')))?.mime).toBe('image/gif');
  });

  it('WebP — RIFF 뒤 4바이트를 건너뛰고 확인한다', () => {
    expect(detect(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')))?.mime).toBe('image/webp');
  });

  it('사진 상한이 붙는다', () => {
    expect(detect(bytes(0xff, 0xd8, 0xff))?.maxBytes).toBe(MAX_IMAGE_BYTES);
  });
});

describe('detect — 동영상', () => {
  it('mp4 계열 브랜드', () => {
    for (const brand of ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ']) {
      expect(detect(isoBmff(brand))?.mime, brand).toBe('video/mp4');
    }
  });

  it("mov 는 브랜드가 'qt  ' 다 (아이폰 기본 녹화 형식)", () => {
    const kind = detect(isoBmff('qt  '));
    expect(kind?.mime).toBe('video/quicktime');
    expect(kind?.ext).toBe('mov');
  });

  it('동영상은 상한이 따로다 — 5MB 로는 몇 초짜리도 안 들어간다', () => {
    expect(detect(isoBmff('isom'))?.maxBytes).toBe(MAX_VIDEO_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });

  it('모르는 브랜드는 받지 않는다 — 브라우저가 재생 못 하는 첨부는 고장이다', () => {
    expect(detect(isoBmff('avif'))).toBeNull();
    expect(detect(isoBmff('XXXX'))).toBeNull();
  });
});

describe('detect — 받지 않는 것', () => {
  it('실행 파일을 사진 이름으로 올려도 걸린다', () => {
    // MZ… = 윈도 실행 파일
    expect(detect(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });

  it('빈 파일이나 몇 바이트짜리에도 터지지 않는다', () => {
    expect(detect(Buffer.alloc(0))).toBeNull();
    expect(detect(bytes(0xff))).toBeNull();
    expect(detect(bytes(...ascii('ftyp')))).toBeNull();
  });

  it('글자만 든 파일(svg·html 등)은 받지 않는다', () => {
    expect(detect(Buffer.from('<svg onload=alert(1)>', 'utf8'))).toBeNull();
    expect(detect(Buffer.from('<!doctype html>', 'utf8'))).toBeNull();
  });
});

describe('isVideoMime', () => {
  it('mime 하나로 사진·동영상이 갈린다 (화면이 img/video 를 이걸로 고른다)', () => {
    expect(isVideoMime('video/mp4')).toBe(true);
    expect(isVideoMime('video/quicktime')).toBe(true);
    expect(isVideoMime('image/png')).toBe(false);
  });
});
