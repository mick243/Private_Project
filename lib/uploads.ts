import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 게시글 첨부 파일 저장소 — 사진과 동영상.
 *
 * 지금은 로컬 `uploads/posts/` 에 씁니다. S3/R2 로 옮길 때 이 파일의 `save` 와
 * `read` 두 함수만 바꾸면 되고, 호출부(API 라우트)와 DB(`post_images.storage_key`)는
 * 그대로입니다.
 *
 * ⚠ `public/` 에 두지 않습니다. `/api/uploads/:id` 로만 나가므로, 나중에 비공개
 *   게시판이 생기면 그 한 곳에 권한 조건을 넣으면 됩니다.
 */

const ROOT = path.join(process.cwd(), 'uploads', 'posts');

/** 사진 한 장의 상한 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * 동영상 하나의 상한.
 *
 * 사진과 따로 두는 이유: 5MB 는 몇 초짜리 mp4 도 안 들어가고, 반대로 사진에
 * 50MB 를 허용하면 목록에서 썸네일 하나가 수십 MB 가 됩니다.
 *
 * 이 값을 올릴 때는 저장 공간만 보지 말고, 업로드가 한 요청에 메모리로 다 올라온다는
 * 점(`file.arrayBuffer()`)을 함께 보세요 — 스트리밍 저장으로 바꾸기 전에는
 * 동시 업로드 수 × 이 값이 그대로 메모리입니다.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

/** 어떤 종류든 이보다 크면 형식을 확인할 필요조차 없다 (라우트의 선제 거절용) */
export const MAX_UPLOAD_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES);

export interface FileKind {
  mime: string;
  ext: string;
  maxBytes: number;
}

const asciiAt = (b: Buffer, from: number, to: number): string =>
  b.subarray(from, to).toString('latin1');

/**
 * mp4 · mov 의 브랜드(ftyp 다음 4바이트).
 *
 * 둘은 같은 컨테이너(ISO-BMFF)이고 브랜드로만 갈립니다. 목록에 없는 브랜드는
 * 받지 않습니다 — "재생은 될지도 모르는 파일" 을 넓게 받는 것보다, 확실히 브라우저가
 * 재생하는 것만 받는 쪽이 낫습니다 (재생 못 하는 첨부는 사용자에게는 고장입니다).
 */
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'mmp4'];
const MOV_BRANDS = ['qt  '];

/**
 * 확장자와 Content-Type 은 클라이언트가 보내는 값이라 믿을 수 없습니다.
 * 파일 앞부분의 매직 바이트로 실제 형식을 확인합니다 — .jpg 로 이름만 바꾼
 * 실행 파일이 업로드되는 걸 막는 가장 싼 방법입니다.
 */
const SIGNATURES: { test: (b: Buffer) => boolean; kind: FileKind }[] = [
  {
    kind: { mime: 'image/jpeg', ext: 'jpg', maxBytes: MAX_IMAGE_BYTES },
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: { mime: 'image/png', ext: 'png', maxBytes: MAX_IMAGE_BYTES },
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    kind: { mime: 'image/gif', ext: 'gif', maxBytes: MAX_IMAGE_BYTES },
    test: (b) => /^GIF8[79]a$/.test(asciiAt(b, 0, 6)),
  },
  {
    // RIFF....WEBP — 크기 4바이트를 건너뛰고 8번째부터 'WEBP'
    kind: { mime: 'image/webp', ext: 'webp', maxBytes: MAX_IMAGE_BYTES },
    test: (b) => asciiAt(b, 0, 4) === 'RIFF' && asciiAt(b, 8, 12) === 'WEBP',
  },
  {
    // ....ftypqt   — mov (아이폰 기본 녹화 형식)
    kind: { mime: 'video/quicktime', ext: 'mov', maxBytes: MAX_VIDEO_BYTES },
    test: (b) => asciiAt(b, 4, 8) === 'ftyp' && MOV_BRANDS.includes(asciiAt(b, 8, 12)),
  },
  {
    // ....ftyp<브랜드> — mp4
    kind: { mime: 'video/mp4', ext: 'mp4', maxBytes: MAX_VIDEO_BYTES },
    test: (b) => asciiAt(b, 4, 8) === 'ftyp' && MP4_BRANDS.includes(asciiAt(b, 8, 12)),
  },
];

/** 매직 바이트로 본 실제 형식. 모르는 형식이면 null */
export function detect(buffer: Buffer): FileKind | null {
  return SIGNATURES.find((s) => s.test(buffer))?.kind ?? null;
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

export class UnsupportedUploadError extends Error {
  constructor() {
    super('사진(JPEG · PNG · GIF · WebP) 또는 동영상(MP4 · MOV) 만 올릴 수 있습니다');
  }
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export class UploadTooLargeError extends Error {
  constructor(kind?: FileKind) {
    super(
      kind
        ? `${isVideoMime(kind.mime) ? '동영상' : '사진'}은 ${mb(kind.maxBytes)}MB 까지 올릴 수 있습니다`
        : `첨부는 ${mb(MAX_UPLOAD_BYTES)}MB 까지 올릴 수 있습니다`,
    );
  }
}

export interface SavedFile {
  storageKey: string;
  mime: string;
  bytes: number;
}

/** 매직 바이트로 형식을 확인하고 내용 해시를 파일명으로 저장합니다. */
export async function save(buffer: Buffer): Promise<SavedFile> {
  const kind = detect(buffer);
  if (!kind) throw new UnsupportedUploadError();
  // 상한은 형식을 알아낸 뒤에 본다 — 사진과 동영상이 다르기 때문이다.
  if (buffer.byteLength > kind.maxBytes) throw new UploadTooLargeError(kind);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const storageKey = `${hash}.${kind.ext}`;

  await fs.mkdir(ROOT, { recursive: true });
  const abs = resolveKey(storageKey);

  // 같은 내용이면 같은 파일명이므로 이미 있으면 다시 쓰지 않는다.
  try {
    await fs.access(abs);
  } catch {
    await fs.writeFile(abs, buffer);
  }

  return { storageKey, mime: kind.mime, bytes: buffer.byteLength };
}

/**
 * 스토리지 키를 실제 경로로 바꿉니다.
 *
 * 키는 DB 에서 오지만, 경로 조립은 언제나 방어적으로 합니다 — 어떤 경로로든
 * `..` 가 섞여 들어오면 uploads 밖의 파일을 읽어 내보낼 수 있습니다.
 */
function resolveKey(storageKey: string): string {
  const abs = path.resolve(ROOT, storageKey);
  if (abs !== path.join(ROOT, path.basename(storageKey))) {
    throw new Error(`잘못된 스토리지 키: ${storageKey}`);
  }
  return abs;
}

/** 파일이 없으면 null (DB 행은 있는데 파일이 사라진 경우) */
export async function read(storageKey: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveKey(storageKey));
  } catch {
    return null;
  }
}
