/**
 * 커뮤니티 게시판의 공용 타입.
 *
 * lib/board.ts 는 getDb() → fs 를 끌고 오므로 클라이언트에서 import 할 수 없습니다.
 * 화면과 서버가 같은 모양을 보게 하는 순수 타입만 여기 둡니다
 * (lib/types.ts · lib/tier-types.ts · lib/community-types.ts 와 같은 규칙).
 */

// 문서 모델은 lib/rich-text.ts 에 있습니다. **타입만** 가져오므로 런타임
// import 가 생기지 않습니다 (rich-text → board-content → board-types 순환 회피).
import type { RichDoc } from './rich-text';

/** board_categories 1행 — 말머리 */
export interface BoardCategory {
  code: string;
  label: string;
}

/**
 * 공지 말머리의 code (db/seed-board.sql · db/migrate-015-notice-category.sql).
 *
 * 말머리 값은 보통 DB 에만 있으면 되는데 이것만 코드에 상수로 둡니다 — 공지는
 * 다른 말머리와 규칙이 다릅니다:
 *   · 관리자만 고를 수 있고 (판정은 서버 — app/api/posts)
 *   · 게임 탭·말머리 필터와 무관하게 목록 맨 위에 고정됩니다 (lib/board.ts listPosts)
 * 그 규칙을 적는 곳(서버·화면)이 같은 문자열을 봐야 하므로 여기 둡니다.
 */
export const NOTICE_CATEGORY = 'notice';

export function isNotice(category: string): boolean {
  return category === NOTICE_CATEGORY;
}

/**
 * 목록 맨 위에 고정할 공지 수.
 *
 * 상한이 없으면 공지가 쌓일수록 첫 화면이 공지로만 채워집니다. 넘친 공지는
 * 사라지는 게 아니라 '공지' 말머리 필터에서 페이지를 넘겨 볼 수 있습니다.
 */
export const NOTICE_PIN_LIMIT = 5;

/**
 * 글쓰기 폼이 처음 고를 말머리.
 *
 * 공지는 sort_order 0 이라 목록 맨 앞이지만 기본값이 되면 안 됩니다 — 관리자가
 * 폼을 열 때마다 공지가 선택된 채 시작하면, 일반 글을 쓰다가 실수로 공지를
 * 올리게 됩니다. 그래서 "첫 번째" 가 아니라 "공지가 아닌 첫 번째" 를 씁니다.
 */
export function defaultCategoryCode(categories: BoardCategory[]): string {
  return categories.find((c) => !isNotice(c.code))?.code ?? categories[0]?.code ?? '';
}

/** 게임 탭 하나 = 리듬 기종 하나 */
export interface Board {
  machineId: number;
  name: string;
  shortName: string;
  postCount: number;
}

export interface PostSummary {
  id: number;
  /**
   * 이 글이 속한 게임. **공지는 null 일 수 있습니다** — 커뮤니티 전체의 알림이라
   * 게임을 고르지 않고 쓸 수 있습니다 (db/migrate-017-notice-without-game.sql).
   * 화면은 null 이면 게임 뱃지를 그리지 않습니다.
   */
  machineId: number | null;
  machineShortName: string | null;
  category: string;
  categoryLabel: string;
  playerId: number;
  nickname: string;
  title: string;
  /** 목록용 본문 미리보기 (서버에서 잘라 보냄 — 전문을 목록에 실으면 응답이 커진다) */
  excerpt: string;
  commentCount: number;
  likeCount: number;
  viewCount: number;
  /** 현재 플레이어가 추천했는지. 플레이어 미선택이면 false */
  myLike: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostComment {
  id: number;
  postId: number;
  playerId: number;
  nickname: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 글에 붙은 첨부 하나 — 사진 또는 동영상. url 은 /api/uploads/:id
 * (public/ 에 두지 않는 이유는 그 라우트 주석 참고).
 *
 * 종류는 `mime` 이 가립니다. 테이블 이름은 아직 `post_images` 인데, 사진만 있던
 * 때 붙은 이름입니다 — 이름을 바꾸려면 DB 컬럼·인덱스까지 함께 가야 해서, 그 값이
 * 이 어수선함보다 크지 않다고 봤습니다 (db/schema-board-images.sql).
 */
export interface PostAttachment {
  id: number;
  url: string;
  bytes: number;
  mime: string;
}

/** 사진과 동영상을 가르는 유일한 기준 (lib/uploads.ts 의 같은 함수와 같은 규칙) */
export function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

export interface PostDetail extends Omit<PostSummary, 'excerpt'> {
  /** machineId 와 함께 null 일 수 있습니다 (게임 없는 공지) */
  machineName: string | null;
  /** 평문 본문. 서식 있는 글에서도 채워집니다 (bodyDoc 의 평문 투영본) */
  body: string;
  /**
   * 서식 있는 본문. null 이면 서식 없이 쓰인 글이고 화면은 `body` 를 그립니다
   * (components/PostBody.tsx). 저장 전에 정규화를 거친 문서만 여기 들어옵니다.
   */
  bodyDoc: RichDoc | null;
  attachments: PostAttachment[];
  /** commentCount 전체 중 이번 응답에 실린 한 페이지 */
  comments: PostComment[];
  /** 그 페이지의 시작 위치 (0-based). 페이지 번호는 화면이 계산한다 */
  commentOffset: number;
}

/** 목록 정렬 */
export const POST_SORTS = [
  { key: 'recent', label: '최신' },
  { key: 'popular', label: '인기글' },
] as const;

/**
 * '인기글' 로 볼 최소 추천 수.
 *
 * 인기순은 정렬만 하면 추천 0개인 글도 그냥 위에서부터 나열됩니다 — 글이 적은
 * 게시판에서는 최신순과 목록이 거의 같아져서 버튼을 눌러도 달라진 게 없어 보입니다.
 * 기준선을 넘은 글만 남겨야 '인기글' 이라는 이름이 사실이 됩니다.
 *
 * 바꾸면 SQL 필터(lib/board.ts)·빈 목록 문구·버튼 툴팁이 전부 따라갑니다.
 */
export const POPULAR_MIN_LIKES = 5;

export type PostSort = (typeof POST_SORTS)[number]['key'];

export function isPostSort(v: string): v is PostSort {
  return POST_SORTS.some((s) => s.key === v);
}

/** 목록 한 페이지에 담는 글 수 */
export const POSTS_PAGE_SIZE = 20;

/** 상세에서 한 페이지에 담는 댓글 수 */
export const COMMENTS_PAGE_SIZE = 10;

/**
 * 글 하나에 붙일 수 있는 첨부 수 — 사진과 동영상을 합쳐서 셉니다.
 *
 * 따로 세지 않는 이유: 동영상이 사진보다 훨씬 무거우니 "사진 5장 + 동영상 5개" 는
 * 한 글의 무게로 너무 큽니다. 한 통으로 5개면 어느 조합이든 상한이 예측됩니다.
 */
export const MAX_ATTACHMENTS_PER_POST = 5;

/**
 * 페이지 번호 목록. 전체 페이지가 많아도 버튼은 최대 `window` 개만 보여주고
 * 현재 페이지를 가운데 두려고 앞뒤로 밀어 줍니다.
 * 서버·클라이언트가 같은 규칙을 쓰도록 여기 둡니다.
 */
export function pageNumbers(current: number, totalPages: number, window = 7): number[] {
  if (totalPages <= window) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(window / 2);
  // 양 끝에서는 창이 잘리지 않도록 시작점을 당겨 온다.
  const start = Math.min(Math.max(1, current - half), totalPages - window + 1);
  return Array.from({ length: window }, (_, i) => start + i);
}

export function totalPagesOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
