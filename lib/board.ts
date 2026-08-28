import type {
  Board,
  BoardCategory,
  PostComment,
  PostAttachment,
  PostDetail,
  PostSort,
  PostSummary,
} from './board-types';
import { attachmentIdsInBody, stripMarkers } from './board-content';
import {
  COMMENTS_PAGE_SIZE,
  NOTICE_CATEGORY,
  NOTICE_PIN_LIMIT,
  POPULAR_MIN_LIKES,
  POSTS_PAGE_SIZE,
} from './board-types';
import { cacheReference, clearReferenceCache } from './cache';
import { getDb, type Queryable } from './db';
import { normalizeDoc, type RichDoc } from './rich-text';

/**
 * 커뮤니티 게시판.
 *
 * 게임별 탭은 테이블이 아니라 `posts.machine_id` 필터입니다 — '전체' 탭은 필터를
 * 걸지 않은 조회일 뿐이고, 게임을 추가할 때 마이그레이션이 필요 없습니다.
 */

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function num(v: unknown): number {
  return Number(v);
}

/**
 * jsonb 컬럼 → 문서.
 *
 * 드라이버에 따라 이미 객체로 파싱돼 오기도 하고(node-postgres) 문자열로 오기도
 * 해서 둘을 다 받습니다. 그리고 **읽을 때도 정규화를 통과시킵니다** — 지금 코드가
 * 넣은 값만 들어 있을 테지만, 스키마가 좁아지는 변경(색 하나를 빼는 것 같은) 뒤에
 * 옛 문서가 그대로 화면까지 흘러가지 않게 하는 그물입니다.
 */
function docFromDb(v: unknown): RichDoc | null {
  return v === null || v === undefined ? null : normalizeDoc(v);
}

/** 목록 본문 미리보기 길이. 전문을 목록에 실으면 20건 응답이 수십 KB가 된다. */
const EXCERPT_LENGTH = 120;

function excerptOf(body: string): string {
  // 이미지 마커는 걷어낸다 — 목록에 '[[image:12]]' 가 보이면 안 된다.
  const flat = stripMarkers(body).replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

// ─── 탭 / 말머리 ─────────────────────────────────────────────

/**
 * 게임 탭 목록.
 *
 * 리듬 기종 전부를 돌려줍니다 — 글이 0건인 게임도 탭에 남깁니다. 글이 있는 게임만
 * 보여주면 새 게임에 첫 글을 쓸 방법이 없어집니다 (닭과 달걀).
 * 리듬게임이 아닌 기종(category='etc')은 제외합니다.
 */
export async function listBoards(): Promise<Board[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT m.id, m.name, m.short_name,
            (SELECT COUNT(*)::int FROM posts p WHERE p.machine_id = m.id) AS post_count
     FROM machines m
     WHERE m.category = 'rhythm'
     ORDER BY m.sort_order, m.id`,
  );
  return rows.map((r) => ({
    machineId: num(r.id),
    name: r.name as string,
    shortName: r.short_name as string,
    postCount: num(r.post_count),
  }));
}

export async function listCategories(): Promise<BoardCategory[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT code, label FROM board_categories ORDER BY sort_order`,
  );
  return rows.map((r) => ({ code: r.code as string, label: r.label as string }));
}

// ─── 글 목록 ─────────────────────────────────────────────────

const POST_SELECT = `
  SELECT p.id, p.machine_id, p.category, p.player_id, p.title, p.body, p.body_doc,
         p.comment_count, p.like_count, p.view_count, p.created_at, p.updated_at,
         m.name        AS machine_name,
         m.short_name  AS machine_short_name,
         bc.label      AS category_label,
         pl.nickname   AS nickname,
         (myl.player_id IS NOT NULL) AS my_like
  FROM posts p
  -- LEFT JOIN — 게임 없는 글(공지)이 목록에서 사라지지 않아야 한다. INNER JOIN 이면
  -- machine_id 가 NULL 인 행은 조용히 빠진다.
  LEFT JOIN machines m     ON m.id  = p.machine_id
  JOIN board_categories bc ON bc.code = p.category
  JOIN players pl          ON pl.id = p.player_id
  LEFT JOIN post_likes myl ON myl.post_id = p.id AND myl.player_id = $1::int`;

function toSummary(r: Record<string, unknown>): PostSummary {
  return {
    id: num(r.id),
    machineId: r.machine_id === null ? null : num(r.machine_id),
    machineShortName: (r.machine_short_name as string | null) ?? null,
    category: r.category as string,
    categoryLabel: r.category_label as string,
    playerId: num(r.player_id),
    nickname: r.nickname as string,
    title: r.title as string,
    excerpt: excerptOf(r.body as string),
    commentCount: num(r.comment_count),
    likeCount: num(r.like_count),
    viewCount: num(r.view_count),
    myLike: Boolean(r.my_like),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export interface ListPostsParams {
  /** null = '전체' 탭 (모든 게임) */
  machineId?: number | null;
  category?: string | null;
  sort?: PostSort;
  playerId?: number | null;
  /**
   * 제목·본문 부분 일치. 게시판 검색창과, 챗봇이 "커뮤니티에서 뭐라고들 하나" 를
   * 뒤질 때(lib/chat-tools.ts) 같은 경로를 씁니다.
   * 본문까지 보는 이유: 제목만으로는 "발판" 이야기가 어느 글에 있는지 못 찾습니다.
   */
  q?: string | null;
  limit?: number;
  offset?: number;
}

export interface ListPostsResult {
  posts: PostSummary[];
  /**
   * 목록 맨 위에 고정되는 공지. `posts` 와 겹치지 않고, `total` 에도 들어가지
   * 않습니다 — 페이지 수는 일반 글만으로 계산되고 공지는 모든 페이지에 붙습니다.
   *
   * 게임 탭·말머리·정렬과 무관하게 같은 목록입니다 (아래 listPosts 주석 참고).
   * '공지' 말머리를 직접 고른 조회와 검색(q)에서는 비어 있습니다 — 검색 결과
   * 맨 위에 찾는 말과 무관한 공지가 붙으면 "몇 건 찾았나" 를 읽을 수 없습니다.
   */
  notices: PostSummary[];
  total: number;
  /** offset + limit < total */
  hasMore: boolean;
}

export async function listPosts(params: ListPostsParams): Promise<ListPostsResult> {
  const db = await getDb();
  const {
    machineId = null,
    category = null,
    sort = 'recent',
    playerId = null,
    q = null,
    limit = POSTS_PAGE_SIZE,
    offset = 0,
  } = params;

  const term = q && q.trim() ? q.trim() : null;

  // 인기글은 정렬이 아니라 '기준선을 넘은 글만' 이다. 최신순에는 걸지 않으므로
  // NULL 을 넣어 조건을 통과시킨다 (아래 두 쿼리의 IS NULL 분기).
  const minLikes = sort === 'popular' ? POPULAR_MIN_LIKES : null;

  /**
   * 공지를 위에 따로 붙일 조회인가.
   *
   * 공지는 '어느 게임 게시판에 썼는지' 와 무관하게 모든 탭 맨 위에 서야 하므로
   * 필터를 타는 목록에 섞을 수 없다 — 다른 게임 탭이나 다른 말머리를 고르면
   * 조건에서 빠져 사라진다. 그래서 별도 쿼리로 뽑아 올리고, 본 목록에서는
   * 빼서 같은 글이 두 번 나오지 않게 한다.
   *
   * 두 경우는 예외로 섞어 둔다:
   *   · '공지' 말머리를 직접 고른 조회 — 그 목록 자체가 공지다 (고정+본문 중복).
   *   · 검색(q) — 화면의 검색창과 챗봇이 같이 쓰는 경로다. 찾는 말과 무관한
   *     공지가 결과 앞에 끼면 검색 결과가 아닌 것이 검색 결과처럼 보인다.
   */
  const pinNotices = category !== NOTICE_CATEGORY && term === null;
  // NULL 이면 제외하지 않는다 (아래 두 쿼리의 `p.category <> ...` 분기).
  const excluded = pinNotices ? NOTICE_CATEGORY : null;

  /**
   * '공지' 말머리를 고르면 게임 탭을 무시한다.
   *
   * 공지는 어느 게시판에 썼든 모든 탭 맨 위에 고정되므로, 사볼 탭에서 방금
   * 위에 붙어 있던 공지가 '공지' 를 누른 순간 "아직 글이 없습니다" 로 바뀌면
   * 같은 화면이 스스로를 부정하는 셈이 된다. 고정과 필터가 같은 목록을 봐야 한다.
   */
  const tab = category === NOTICE_CATEGORY ? null : machineId;

  // 정렬 키는 화이트리스트로만 SQL 에 들어간다 (문자열 보간 지점).
  const ORDER: Record<PostSort, string> = {
    recent: 'p.created_at DESC, p.id DESC',
    popular: 'p.like_count DESC, p.comment_count DESC, p.created_at DESC',
  };

  /**
   * 목록과 총계를 **따로** 가져옵니다.
   *
   * 한때 `COUNT(*) OVER ()` 로 한 쿼리에 합쳤었습니다. 30행에서는 멀쩡했지만
   * 5만 행을 넣고 재 보니 141ms 로, 따로 세던 예전(5.9ms)보다 24배 느렸습니다.
   * 이유는 둘입니다.
   *
   *   · 창 함수가 LIMIT 을 아래로 못 밀어넣습니다. 20건만 필요한데도 조건에 맞는
   *     행을 **전부** 정렬해야 해서, 목록 쿼리가 Index Scan(21행에서 멈춤)에서
   *     Seq Scan + 전체 정렬로 내려앉습니다.
   *   · 그 전부가 machines·board_categories·players·post_likes 4개 조인을 통과합니다.
   *     조인 없이 posts 만 훑던 COUNT 는 Index Only Scan 이라 훨씬 쌉니다.
   *
   * 그래서 목록은 LIMIT 이 인덱스까지 내려가도록 되돌리고(0.2ms), 총계는 아래
   * countPosts 에서 캐시로 받습니다. 풀 슬롯을 아끼려던 원래 의도는 캐시가
   * 대신합니다 — 대부분의 요청은 총계 때문에 DB 를 치지 않습니다.
   */
  const [{ rows }, total, notices] = await Promise.all([
    db.query<Record<string, unknown>>(
      `${POST_SELECT}
       WHERE ($2::int  IS NULL OR p.machine_id = $2::int)
         AND ($3::text IS NULL OR p.category   = $3::text)
         AND ($6::text IS NULL
              OR p.title ILIKE '%' || $6::text || '%'
              OR p.body  ILIKE '%' || $6::text || '%')
         AND ($7::int  IS NULL OR p.like_count >= $7::int)
         AND ($8::text IS NULL OR p.category  <> $8::text)
       ORDER BY ${ORDER[sort]}
       LIMIT $4::int OFFSET $5::int`,
      [playerId, tab, category, limit, offset, term, minLikes, excluded],
    ),
    countPosts(tab, category, term, minLikes, excluded),
    // 공지는 필터를 안 타는 별도 목록이라 합치지 않습니다 (위 pinNotices 주석 참고).
    // 애초에 pinNotices 가 false 면 쿼리 자체가 나가지 않습니다.
    pinNotices ? listNotices(playerId) : Promise.resolve([]),
  ]);

  return {
    posts: rows.map(toSummary),
    notices,
    total,
    hasMore: offset + rows.length < total,
  };
}

/**
 * 조건에 맞는 글의 총계. 페이지 번호 UI 가 이 값으로 페이지 수를 셉니다.
 *
 * **총계는 본질적으로 조건에 맞는 행을 전부 봐야 합니다.** 5만 건이면 매번 5.7ms 씩
 * 드는데, 글 목록은 자주 열리는 화면이라 그게 그대로 쌓입니다. 그래서 캐시합니다 —
 * 인자(필터 조합)가 곧 캐시 키라 탭·말머리·검색어별로 따로 잡힙니다.
 *
 * 30초는 짧게 잡은 값입니다. 글이 늘거나 줄면 아래 invalidatePostCounts 가 즉시
 * 비우므로, TTL 이 실제로 쓰이는 건 추천 수가 바뀌어 '인기글' 기준선을 넘나드는
 * 경우 정도입니다 (그 정도 지연은 페이지 수에 영향이 거의 없습니다).
 */
const countPosts = cacheReference(countPostsUncached, 'post-count', 30_000);

/**
 * 글이 늘거나 줄거나 분류가 바뀌면 총계가 달라집니다. 어느 필터 조합이 영향을
 * 받는지 알 수 없으므로 총계 캐시를 통째로 비웁니다 (항목이 몇 개뿐이라 쌉니다).
 */
function invalidatePostCounts(): void {
  clearReferenceCache('post-count');
}

async function countPostsUncached(
  tab: number | null,
  category: string | null,
  term: string | null,
  minLikes: number | null,
  excluded: string | null,
): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ total: unknown }>(
    `SELECT COUNT(*)::int AS total FROM posts p
     WHERE ($1::int  IS NULL OR p.machine_id = $1::int)
       AND ($2::text IS NULL OR p.category   = $2::text)
       AND ($3::text IS NULL
            OR p.title ILIKE '%' || $3::text || '%'
            OR p.body  ILIKE '%' || $3::text || '%')
       AND ($4::int  IS NULL OR p.like_count >= $4::int)
       AND ($5::text IS NULL OR p.category  <> $5::text)`,
    [tab, category, term, minLikes, excluded],
  );
  return num(rows[0]?.total ?? 0);
}

/**
 * 고정 공지 — 최신 것부터 NOTICE_PIN_LIMIT 개.
 *
 * 게임 탭(machineId)도 정렬(sort)도 보지 않습니다. 공지는 어느 게시판에서 썼든
 * 커뮤니티 전체의 알림이고, 추천 수로 밀려나서도 안 됩니다. playerId 만 받는
 * 이유는 '내가 추천했는지' 표시가 일반 글과 같아야 하기 때문입니다.
 */
async function listNotices(playerId: number | null): Promise<PostSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `${POST_SELECT}
     WHERE p.category = $2::text
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $3::int`,
    [playerId, NOTICE_CATEGORY, NOTICE_PIN_LIMIT],
  );
  return rows.map(toSummary);
}

// ─── 글 상세 ─────────────────────────────────────────────────

/**
 * 댓글 한 페이지.
 *
 * 오래된 것부터(created_at ASC) 정렬합니다 — 대화 흐름이 위에서 아래로 읽혀야 하고,
 * 새 댓글이 항상 마지막 페이지에 붙어서 "쓰고 나면 그 페이지로 보내기"가 자연스럽습니다.
 */
export async function listComments(
  postId: number,
  limit = COMMENTS_PAGE_SIZE,
  offset = 0,
): Promise<PostComment[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT c.id, c.post_id, c.player_id, c.body, c.created_at, c.updated_at, pl.nickname
     FROM post_comments c
     JOIN players pl ON pl.id = c.player_id
     WHERE c.post_id = $1
     ORDER BY c.created_at, c.id
     LIMIT $2::int OFFSET $3::int`,
    [postId, limit, offset],
  );
  return rows.map((r) => ({
    id: num(r.id),
    postId: num(r.post_id),
    playerId: num(r.player_id),
    nickname: r.nickname as string,
    body: r.body as string,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }));
}

async function listAttachments(postId: number): Promise<PostAttachment[]> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, bytes, mime FROM post_images
     WHERE post_id = $1 ORDER BY sort_order, id`,
    [postId],
  );
  return rows.map((r) => ({
    id: num(r.id),
    // 파일은 public/ 이 아니라 이 라우트로만 나간다 (lib/uploads.ts 참고).
    url: `/api/uploads/${num(r.id)}`,
    bytes: num(r.bytes),
    // 사진인지 동영상인지를 가리는 값 — 화면이 <img>/<video> 를 이걸 보고 고른다.
    mime: r.mime as string,
  }));
}

/**
 * 글 상세. 댓글은 전부가 아니라 `commentOffset` 부터 한 페이지만 실립니다 —
 * 전체 개수는 캐시 컬럼(comment_count)에 있으므로 화면이 페이지 수를 계산할 수 있고,
 * 댓글 500개짜리 글이 500개를 다 내려보내지 않습니다.
 */
export async function getPost(
  postId: number,
  playerId: number | null,
  commentOffset = 0,
): Promise<PostDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `${POST_SELECT} WHERE p.id = $2::int`,
    [playerId, postId],
  );
  if (!rows[0]) return null;

  const r = rows[0];
  const { excerpt: _excerpt, ...summary } = toSummary(r);

  // 글이 지워지거나 댓글이 줄어 offset 이 범위를 벗어나면 마지막 페이지로 당긴다.
  const safeOffset = clampOffset(commentOffset, summary.commentCount, COMMENTS_PAGE_SIZE);

  const [comments, attachments] = await Promise.all([
    listComments(postId, COMMENTS_PAGE_SIZE, safeOffset),
    listAttachments(postId),
  ]);

  return {
    ...summary,
    machineName: (r.machine_name as string | null) ?? null,
    body: r.body as string,
    bodyDoc: docFromDb(r.body_doc),
    attachments,
    comments,
    commentOffset: safeOffset,
  };
}

/** offset 을 [0, 마지막 페이지 시작] 안으로 맞춘다 */
function clampOffset(offset: number, total: number, pageSize: number): number {
  if (offset <= 0 || total === 0) return 0;
  const lastStart = Math.floor(Math.max(0, total - 1) / pageSize) * pageSize;
  return Math.min(offset, lastStart);
}

/** 마지막 댓글 페이지의 시작 위치. 댓글을 쓴 뒤 그 페이지로 보내는 데 씁니다. */
export function lastCommentOffset(commentCount: number): number {
  return clampOffset(Number.MAX_SAFE_INTEGER, commentCount, COMMENTS_PAGE_SIZE);
}

/**
 * 조회수 +1.
 *
 * 조회 로그를 남기지 않으므로 되돌릴 수 없는 누적 카운터입니다. 같은 사람이 새로
 * 고칠 때마다 오르는 것도 막지 않습니다 — 막으려면 (글, 사람, 시각) 을 저장해야 하고,
 * 그건 정확도가 이 값의 용도(목록에서 대충 눈에 띄는 순서)에 비해 과합니다.
 *
 * ⚠ dev 서버는 React Strict Mode 로 effect 를 두 번 실행하므로 개발 중에는 2씩 오릅니다.
 */
export async function bumpView(postId: number): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE posts SET view_count = view_count + 1 WHERE id = $1`, [postId]);
}

// ─── 쓰기 ────────────────────────────────────────────────────

/** 댓글/추천 수 캐시 갱신. 댓글·추천이 바뀔 때마다 호출. */
async function recalc(postId: number): Promise<void> {
  const db = await getDb();
  await db.query(`SELECT recalc_post_stats($1)`, [postId]);
}

/**
 * 문서 → jsonb 파라미터.
 *
 * 객체를 그대로 넘기지 않고 문자열로 넘깁니다 — 객체를 jsonb 로 보내는 규칙이
 * 드라이버마다 다르고(PGlite 와 node-postgres), 문자열 + `::jsonb` 캐스트는
 * 양쪽에서 같게 동작합니다.
 */
function docToDb(doc: RichDoc | null): string | null {
  return doc ? JSON.stringify(doc) : null;
}

export interface PostInput {
  /** null = 게임에 속하지 않는 글 (공지). 규칙은 lib/validation.ts 가 지킨다 */
  machineId: number | null;
  category: string;
  playerId: number;
  /** 본문 안의 [[image:N]] 마커가 어떤 이미지를 어디에 붙일지의 유일한 근거 */
  body: string;
  /**
   * 서식 있는 본문. null 이면 서식 없는 글입니다.
   *
   * `body` 는 이 문서의 평문 투영본이어야 합니다 — 어긋나지 않도록 서버가
   * 문서에서 다시 만듭니다 (lib/validation.ts postInputSchema).
   */
  bodyDoc: RichDoc | null;
  title: string;
}

/**
 * 본문 마커에 등장한 첨부(사진·동영상)를 글에 붙이고, 사라진 것은 떼어 냅니다.
 * 본문에서 지우면 마커도 사라지므로 자동으로 분리됩니다.
 *
 * `player_id = 올린 사람` 조건이 핵심입니다 — 없으면 남이 올린 파일의 id 를
 * 본문에 적어서 자기 글에 끌어다 붙일 수 있습니다.
 *
 * 떼어 낸 첨부는 지우지 않고 post_id 를 NULL 로 되돌립니다. 같은 파일을 다시
 * 붙일 수도 있고, 파일과 행을 함께 정리하는 배치를 나중에 붙이는 쪽이 낫습니다
 * (post_images_orphan_idx 가 그걸 위한 인덱스입니다).
 */
async function syncAttachments(
  tx: Queryable,
  postId: number,
  playerId: number,
  attachmentIds: number[],
): Promise<void> {
  await tx.query(
    `UPDATE post_images SET post_id = NULL
     WHERE post_id = $1 AND NOT (id = ANY($2::int[]))`,
    [postId, attachmentIds],
  );

  for (const [index, attachmentId] of attachmentIds.entries()) {
    await tx.query(
      `UPDATE post_images SET post_id = $1, sort_order = $2
       WHERE id = $3 AND player_id = $4 AND (post_id IS NULL OR post_id = $1)`,
      [postId, index, attachmentId, playerId],
    );
  }
}

export async function createPost(input: PostInput): Promise<number> {
  const db = await getDb();
  // 글 삽입과 이미지 연결은 한 트랜잭션. 따로 하면 "글은 있는데 이미지가
  // 안 붙은" 상태가 남고, 사용자는 이미지를 다시 올려야 한다.
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO posts (machine_id, category, player_id, title, body, body_doc)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        input.machineId,
        input.category,
        input.playerId,
        input.title,
        input.body,
        docToDb(input.bodyDoc),
      ],
    );
    const id = rows[0].id;
    await syncAttachments(tx, id, input.playerId, attachmentIdsInBody(input.body));
    invalidatePostCounts();
    return id;
  });
}

/** 작성자 본인만. 다른 사람이면 false. */
export async function updatePost(
  postId: number,
  playerId: number,
  input: PostInput,
): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `UPDATE posts SET machine_id = $3, category = $4, title = $5, body = $6,
              body_doc = $7::jsonb, updated_at = now()
       WHERE id = $1 AND player_id = $2
       RETURNING id`,
      [
        postId,
        playerId,
        input.machineId,
        input.category,
        input.title,
        input.body,
        docToDb(input.bodyDoc),
      ],
    );
    if (rows.length === 0) return false;
    await syncAttachments(tx, postId, playerId, attachmentIdsInBody(input.body));
    // 말머리·게임 탭이 바뀌면 어느 조합의 총계가 달라졌는지 알 수 없다.
    invalidatePostCounts();
    return true;
  });
}

// ─── 업로드 ──────────────────────────────────────────────────

/** 업로드 직후, 아직 글에 붙지 않은 첨부 행을 만든다 */
export async function createAttachment(input: {
  playerId: number;
  storageKey: string;
  mime: string;
  bytes: number;
}): Promise<PostAttachment> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO post_images (player_id, storage_key, mime, bytes)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.playerId, input.storageKey, input.mime, input.bytes],
  );
  const id = num(rows[0].id);
  return { id, url: `/api/uploads/${id}`, bytes: input.bytes, mime: input.mime };
}

export async function getAttachment(
  attachmentId: number,
): Promise<{ storageKey: string; mime: string } | null> {
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT storage_key, mime FROM post_images WHERE id = $1`,
    [attachmentId],
  );
  if (!rows[0]) return null;
  return { storageKey: rows[0].storage_key as string, mime: rows[0].mime as string };
}

/**
 * 본인 글 삭제. 작성자 확인이 `WHERE` 절 안에 있습니다 — 조회로 확인한 뒤
 * 지우면 그 사이가 비고, 무엇보다 확인을 빠뜨린 호출부가 조용히 남의 글을
 * 지울 수 있게 됩니다.
 */
export async function deletePost(postId: number, playerId: number): Promise<boolean> {
  const db = await getDb();
  // 댓글·추천은 ON DELETE CASCADE 로 함께 정리된다.
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM posts WHERE id = $1 AND player_id = $2 RETURNING id`,
    [postId, playerId],
  );
  if (rows.length) invalidatePostCounts();
  return rows.length > 0;
}

/**
 * 관리자 삭제 — 작성자를 보지 않습니다.
 *
 * `deletePost(id, null)` 로 합치지 않은 이유: playerId 에 null 이 들어오면
 * 소유자 검사가 사라지는 함수는, 어딘가에서 playerId 가 실수로 null 이 되는
 * 순간 조용히 만능 삭제가 됩니다. 이름을 나눠 호출부에서 의도가 보이게 합니다.
 */
export async function deletePostAsAdmin(postId: number): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ id: number }>(
    `DELETE FROM posts WHERE id = $1 RETURNING id`,
    [postId],
  );
  if (rows.length) invalidatePostCounts();
  return rows.length > 0;
}

export async function createComment(input: {
  postId: number;
  playerId: number;
  body: string;
}): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO post_comments (post_id, player_id, body) VALUES ($1, $2, $3)`,
    [input.postId, input.playerId, input.body],
  );
  await recalc(input.postId);
}

/** 본인 댓글 삭제. 반환값은 그 댓글이 달려 있던 글의 id (없으면 null) */
export async function deleteComment(
  commentId: number,
  playerId: number,
): Promise<number | null> {
  const db = await getDb();
  const { rows } = await db.query<{ post_id: number }>(
    `DELETE FROM post_comments WHERE id = $1 AND player_id = $2 RETURNING post_id`,
    [commentId, playerId],
  );
  if (!rows[0]) return null;
  const postId = num(rows[0].post_id);
  await recalc(postId);
  return postId;
}

/** 관리자 댓글 삭제 — 작성자를 보지 않습니다 (deletePostAsAdmin 주석 참고) */
export async function deleteCommentAsAdmin(commentId: number): Promise<number | null> {
  const db = await getDb();
  const { rows } = await db.query<{ post_id: number }>(
    `DELETE FROM post_comments WHERE id = $1 RETURNING post_id`,
    [commentId],
  );
  if (!rows[0]) return null;
  const postId = num(rows[0].post_id);
  await recalc(postId);
  return postId;
}

/** 추천 토글. 반환값은 토글 후 상태. */
export async function toggleLike(
  postId: number,
  playerId: number,
): Promise<{ liked: boolean }> {
  const db = await getDb();
  const { rows } = await db.query<{ post_id: number }>(
    `DELETE FROM post_likes WHERE post_id = $1 AND player_id = $2 RETURNING post_id`,
    [postId, playerId],
  );

  const liked = rows.length === 0;
  if (liked) {
    await db.query(
      `INSERT INTO post_likes (post_id, player_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [postId, playerId],
    );
  }
  await recalc(postId);
  return { liked };
}
