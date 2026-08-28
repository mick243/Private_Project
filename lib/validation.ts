import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './auth-types';
import { attachmentIdsInBody, stripMarkers } from './board-content';
import {
  isNotice,
  isPostSort,
  MAX_ATTACHMENTS_PER_POST,
  POSTS_PAGE_SIZE,
} from './board-types';
import { CHART_TAGS } from './community-types';
import { normalizeDoc, toPlainText } from './rich-text';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** '' → null 로 정규화하는 선택 문자열 */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .default(null);

const timeField = optionalText.refine(
  (v) => v === null || TIME_RE.test(v),
  { message: 'HH:MM 형식이어야 합니다 (예: 10:00)' },
);

export const arcadeInputSchema = z
  .object({
    name: z.string().trim().min(1, '이름은 필수입니다').max(100),
    address: z.string().trim().min(1, '주소는 필수입니다').max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    openTime: timeField,
    closeTime: timeField,
    is24h: z.boolean().default(false),
    phone: optionalText,
    note: optionalText,
    machines: z
      .array(
        z.object({
          machineId: z.number().int().positive(),
          /**
           * 대수는 이 배열의 길이입니다 (배열 순서 = 1호기, 2호기…).
           * cabinets 를 아예 안 보내면 컨디션 모르는 1대로 봅니다 — 기체 개념이
           * 없던 시절의 페이로드가 400 으로 떨어지지 않게.
           */
          cabinets: z
            .array(
              z.object({
                condition: z.number().int().min(1).max(5).nullable().default(null),
              }),
            )
            .min(1, '기체는 1대 이상이어야 합니다')
            .max(20, '같은 기종은 20대까지 등록할 수 있습니다')
            .default([{ condition: null }]),
        }),
      )
      .default([]),
  })
  // 24시간 영업이면 영업시간 입력은 무시한다.
  .transform((v) =>
    v.is24h ? { ...v, openTime: null, closeTime: null } : v,
  );

export type ArcadeInputParsed = z.infer<typeof arcadeInputSchema>;

// ─── 로그인 ──────────────────────────────────────────────────
// 형식만 봅니다. "그런 계정이 없다"와 "비밀번호가 틀렸다"를 구분해 돌려주면
// 닉네임 존재 여부가 새어 나가므로, 판정은 전부 lib/auth.ts 가 한 마디로 합니다.
export const loginInputSchema = z.object({
  nickname: z.string().trim().min(1, '아이디를 입력해 주세요').max(100),
  password: z.string().min(1, '비밀번호를 입력해 주세요').max(200),
});

// ─── 회원가입 ────────────────────────────────────────────────
// 로그인과 달리 여기서는 **깐깐하게** 봅니다. 로그인은 이미 정해진 값을 맞히는
// 일이라 형식을 따져도 얻는 게 없지만, 가입은 그 값을 처음 정하는 자리입니다.
//
// 아이디는 곧 플레이어 닉네임입니다 (players.nickname · lib/auth.ts 주석) —
// 제보·리뷰·글에 그대로 찍히므로 공백만으로 된 이름이나 줄바꿈이 섞인 이름이
// 들어오면 목록이 무너집니다.
/**
 * 이름 한 칸의 규칙. 가입 화면은 '아이디', 소셜 첫 진입 화면은 '닉네임' 이라고
 * 부르지만 들어가는 칸은 players.nickname 하나입니다 — 한쪽만 느슨하면 그 길로
 * 규칙 밖의 이름이 들어옵니다.
 *
 * 부르는 말을 인자로 받는 이유는 조사 때문입니다. '아이디는/아이디에' 와
 * '닉네임은/닉네임에' 가 달라서, 명사 하나만 받으면 문장이 어그러집니다.
 */
function nicknameField(topic: string, locative: string) {
  return (
    z
      .string()
      .trim()
      // 같은 글자라도 조합형(NFD)과 완성형(NFC)은 바이트가 달라 UNIQUE 를
      // 통과합니다 — 겉보기가 같은 이름 둘이 생기지 않도록 저장 전에 NFC 로
      // 맞춥니다. macOS 파일명 붙여넣기 등으로 NFD 가 실제로 들어옵니다.
      .transform((v) => v.normalize('NFC'))
      .pipe(
        z
          .string()
          .min(2, `${topic} 2자 이상이어야 합니다`)
          .max(20, `${topic} 20자까지 쓸 수 있습니다`)
          .regex(/^[^\s]+$/, `${locative} 공백은 쓸 수 없습니다`)
          // 제어·서식 문자(zero-width space 등)는 눈에 안 보여서, 섞어 넣으면
          // 기존 이름과 똑같아 보이는 다른 이름을 만들 수 있습니다.
          .regex(/^[^\p{Cc}\p{Cf}]+$/u, `${locative} 보이지 않는 문자는 쓸 수 없습니다`),
      )
  );
}

export const signupInputSchema = z
  .object({
    nickname: nicknameField('아이디는', '아이디에'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`)
      .max(200, '비밀번호는 200자까지 쓸 수 있습니다'),
    // 화면에서도 같은 검사를 하지만, 여기서 빠뜨리면 브라우저를 거치지 않는
    // 요청이 확인 없이 통과합니다.
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: '비밀번호가 서로 다릅니다',
    path: ['passwordConfirm'],
  });

// ─── 소셜 로그인 뒤 닉네임 정하기 ────────────────────────────
// 본인이 이름을 처음 정하는 순간이라 규칙은 가입과 같습니다
// (app/api/auth/nickname · lib/auth.ts claimNickname).
//
// 비밀번호는 **선택**입니다 — 소셜 로그인만 쓸 사람에게 강요할 이유가 없지만,
// 설정해 두면 아이디/비밀번호 로그인과 개인정보 수정(/account)의 본인 확인에
// 쓰입니다. 빈 문자열은 "설정 안 함" 으로 봅니다 (폼이 빈 칸을 그대로 보냅니다).
export const nicknameInputSchema = z
  .object({
    nickname: nicknameField('닉네임은', '닉네임에'),
    password: z
      .string()
      .max(200, '비밀번호는 200자까지 쓸 수 있습니다')
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .refine((v) => v === undefined || v.length >= MIN_PASSWORD_LENGTH, {
        message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`,
      }),
    passwordConfirm: z.string().optional(),
  })
  .refine((v) => v.password === undefined || v.password === v.passwordConfirm, {
    message: '비밀번호가 서로 다릅니다',
    path: ['passwordConfirm'],
  });

// ─── 개인정보 수정 (/account) ────────────────────────────────
// 입장 검증 — 비밀번호 한 칸. 형식은 로그인과 같은 이유로 느슨하게 봅니다.
export const accountVerifySchema = z.object({
  password: z.string().min(1, '비밀번호를 입력해 주세요').max(200),
});

/**
 * 수정 요청. currentPassword 필요 여부는 여기서 판단하지 않습니다 — "비밀번호가
 * 있는 계정인가" 는 DB 만 알므로 라우트(app/api/account)가 봅니다.
 * 닉네임과 새 비밀번호 중 적어도 하나는 있어야 합니다.
 */
export const accountUpdateSchema = z
  .object({
    currentPassword: z.string().max(200).optional(),
    nickname: nicknameField('닉네임은', '닉네임에').optional(),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`)
      .max(200, '비밀번호는 200자까지 쓸 수 있습니다')
      .optional(),
    newPasswordConfirm: z.string().optional(),
  })
  .refine((v) => v.nickname !== undefined || v.newPassword !== undefined, {
    message: '바꿀 항목이 없습니다',
  })
  .refine((v) => v.newPassword === undefined || v.newPassword === v.newPasswordConfirm, {
    message: '비밀번호가 서로 다릅니다',
    path: ['newPasswordConfirm'],
  });

// ─── 기종 제보 ───────────────────────────────────────────────
// arcadeId 는 경로(/api/arcades/:id/reports)에서 오므로 본문에 받지 않습니다.
export const reportInputSchema = z
  .object({
    machineId: z.number().int().positive(),
    /** 컨디션 제보가 가리키는 기체. 나머지 종류에서는 무시됩니다 */
    cabinetId: z.number().int().positive().nullable().default(null),
    /** null = 익명 제보. 익명은 있어요/없어졌어요 임계값에 세지 않습니다 */
    playerId: z.number().int().positive().nullable().default(null),
    kind: z.enum(['presence', 'absence', 'queue', 'condition']),
    waitCount: z.number().int().min(0).max(99).nullable().default(null),
    condition: z.number().int().min(1).max(5).nullable().default(null),
    comment: optionalText,
  })
  // 종류와 무관한 필드가 섞여 들어오면 DB CHECK 에서 걸린다. 그 전에 여기서
  // 뜻이 통하는 메시지로 돌려주고, 남는 값은 잘라낸다.
  .superRefine((v, ctx) => {
    if (v.kind === 'queue' && v.waitCount === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['waitCount'],
        message: '대기 인원을 입력해 주세요',
      });
    }
    if (v.kind === 'condition' && v.condition === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['condition'],
        message: '컨디션(1~5)을 선택해 주세요',
      });
    }
    // 컨디션은 기체 1대에 대한 제보다. 어느 기체인지 없이 받으면 2대 중
    // 어느 쪽 얘기인지 영영 알 수 없는 행이 된다.
    if (v.kind === 'condition' && v.cabinetId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cabinetId'],
        message: '어느 기체인지 골라 주세요',
      });
    }
  })
  .transform((v) => ({
    ...v,
    waitCount: v.kind === 'queue' ? v.waitCount : null,
    condition: v.kind === 'condition' ? v.condition : null,
    cabinetId: v.kind === 'condition' ? v.cabinetId : null,
  }));

// ─── 오락실 리뷰 ─────────────────────────────────────────────
export const reviewInputSchema = z.object({
  playerId: z.number().int().positive(),
  rating: z.number().int().min(1, '평점은 1~5 입니다').max(5, '평점은 1~5 입니다'),
  body: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable().default(null),
});

// ─── 채보 평가 ───────────────────────────────────────────────
export const commentInputSchema = z.object({
  playerId: z.number().int().positive(),
  body: z.string().trim().min(2, '평가 내용을 입력해 주세요').max(1000),
  // 자유 입력을 막는 이유는 lib/community-types.ts CHART_TAGS 주석 참고.
  tags: z.array(z.enum(CHART_TAGS)).max(4, '태그는 4개까지 고를 수 있습니다').default([]),
});

// ─── 커뮤니티 게시판 ─────────────────────────────────────────
// category 는 board_categories 를 참조하는 FK 라서 값 검증은 DB 가 합니다.
// 여기서는 형식만 봅니다 (없는 말머리는 FK 위반 → 400 으로 변환).
/**
 * 첨부 id 목록을 따로 받지 않습니다 — 어떤 첨부가 붙는지는 **본문의 마커가 유일한
 * 근거** 입니다. 목록을 따로 받으면 본문과 어긋날 수 있고(본문에서 지웠는데 목록엔
 * 남는 등), 둘 중 무엇을 믿을지 정해야 하는 문제가 생깁니다. 서버가 본문에서 유도합니다.
 */
/** 평문 본문의 최대 길이. 서식 있는 글도 평문 투영본이 이 안에 들어와야 한다 */
const MAX_BODY = 20000;

export const postInputSchema = z
  .object({
    /**
     * 글이 속한 게임. 공지는 비워 둘 수 있습니다 (아래 superRefine) — 모든 탭 맨
     * 위에 붙는 글이라 어느 게시판에 썼는지가 뜻이 없습니다.
     */
    machineId: z.number().int().positive().nullable().default(null),
    category: z.string().trim().min(1, '말머리를 골라주세요').max(20),
    playerId: z.number().int().positive(),
    title: z.string().trim().min(2, '제목을 입력해 주세요').max(120),
    /**
     * 평문 본문. 서식 있는 글에서는 아래 transform 이 문서에서 다시 만들므로
     * 보내지 않아도 됩니다 (문서가 없는 요청에서만 이 값이 쓰입니다).
     */
    body: z.string().max(MAX_BODY).optional(),
    /**
     * 서식 있는 본문(편집기가 보낸 JSON 문서).
     *
     * 모양 검사를 zod 로 하지 않습니다 — 재귀 스키마를 zod 로 적으면
     * lib/rich-text.ts 의 화이트리스트와 규칙이 두 곳에 갈라지고, 둘이 어긋나는
     * 순간 "검증은 통과했는데 렌더러가 버리는" 문서가 생깁니다. 여기서는 통째로
     * unknown 으로 받고 normalizeDoc 하나에만 맡깁니다.
     */
    bodyDoc: z.unknown().optional(),
  })
  .transform((v) => {
    const bodyDoc = normalizeDoc(v.bodyDoc ?? null);
    // 문서가 있으면 평문은 **문서에서 다시 만든다**. 클라이언트가 보낸 평문을
    // 믿으면 검색·목록 미리보기·이미지 연결(마커)이 본문과 어긋날 수 있다.
    const body = (bodyDoc ? toPlainText(bodyDoc) : (v.body ?? '')).trim();
    return {
      // 공지는 게임을 고르든 말든 **게임 없는 글**로 저장한다 — 고정 위치가 모든
      // 탭이라 게임 값이 화면에 쓰이지 않고, 남겨 두면 탭 글 수만 부풀린다.
      machineId: isNotice(v.category) ? null : v.machineId,
      category: v.category,
      playerId: v.playerId,
      title: v.title,
      body,
      bodyDoc,
    };
  })
  .superRefine((v, ctx) => {
    // 공지가 아닌 글은 반드시 어느 게시판(게임)에 속해야 한다.
    if (v.machineId === null && !isNotice(v.category)) {
      ctx.addIssue({ code: 'custom', path: ['machineId'], message: '게임을 선택해 주세요' });
    }
    if (v.body.length > MAX_BODY) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: `본문은 ${MAX_BODY.toLocaleString('ko-KR')}자까지 쓸 수 있습니다`,
      });
    }
    const ids = attachmentIdsInBody(v.body);
    if (ids.length > MAX_ATTACHMENTS_PER_POST) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: `첨부는 사진·동영상 합쳐 ${MAX_ATTACHMENTS_PER_POST}개까지 붙일 수 있습니다`,
      });
    }
    // 첨부만 있고 글이 없는 것은 허용하지만, 둘 다 비면 막는다.
    if (stripMarkers(v.body).trim().length === 0 && ids.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: '내용을 입력해 주세요' });
    }
  });

export const postCommentInputSchema = z.object({
  playerId: z.number().int().positive(),
  body: z.string().trim().min(1, '댓글을 입력해 주세요').max(2000),
});

/**
 * 목록 검색어 (`?q=`). 게시판과 제보 피드가 같은 것을 씁니다.
 *
 * 트림해서 빈 문자열은 null 로 내립니다 — 빈 검색어로 조건을 걸면 모든 행이
 * `ILIKE '%%'` 를 통과하느라 인덱스를 못 타고, 결과는 안 거른 것과 같습니다.
 *
 * 길이는 **자릅니다**. 검색어가 그대로 `ILIKE '%…%'` 의 패턴이 되므로 상한이
 * 없으면 남의 브라우저에서 수십 KB짜리 패턴을 보내 DB 를 태울 수 있습니다.
 * 거절하지 않고 자르는 이유 — 이 길이를 넘겨 검색하는 사람은 없어서, 거절은
 * 사람에게는 안 보이고 공격자에게만 재시도 신호가 됩니다.
 */
const SEARCH_TERM_MAX = 60;

function searchTerm(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get('q')?.trim();
  return raw ? raw.slice(0, SEARCH_TERM_MAX) : null;
}

/** 게시판 목록 쿼리스트링 → listPosts 파라미터 */
export function parsePostQuery(searchParams: URLSearchParams) {
  const int = (key: string): number | null => {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const rawSort = searchParams.get('sort') ?? '';
  const rawOffset = Number(searchParams.get('offset'));

  return {
    // machineId 없음 = '전체' 탭
    machineId: int('machineId'),
    category: searchParams.get('category')?.trim() || null,
    sort: isPostSort(rawSort) ? rawSort : ('recent' as const),
    playerId: int('playerId'),
    q: searchTerm(searchParams),
    limit: Math.min(int('limit') ?? POSTS_PAGE_SIZE, 100),
    offset: Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0,
  };
}

/** 제보 피드 쿼리스트링 → listReports 파라미터 */
export function parseReportQuery(searchParams: URLSearchParams) {
  const int = (key: string): number | null => {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const KINDS = ['presence', 'absence', 'queue', 'condition'] as const;
  const kinds = (searchParams.get('kind') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(s));

  return {
    arcadeId: int('arcadeId'),
    machineId: int('machineId'),
    kinds: kinds.length ? kinds : null,
    sinceHours: int('sinceHours'),
    q: searchTerm(searchParams),
    limit: Math.min(int('limit') ?? 50, 200),
  };
}

// ─── 챗봇 ────────────────────────────────────────────────────
/**
 * 대화 기록. **길이를 여기서 막습니다** — 클라이언트가 보내는 그대로 모델에
 * 실리므로, 상한이 없으면 남의 브라우저에서 수십만 자를 보내 토큰을 태울 수
 * 있습니다. 오래된 턴은 클라이언트가 잘라서 보냅니다.
 */
export const chatInputSchema = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1, '보낼 메시지가 없습니다')
    .max(24, '대화가 너무 깁니다')
    // 대화는 사용자 말로 끝나야 합니다. 조수 말로 끝나면 모델이 답할 차례가
    // 아니라서 빈 응답이 돌아옵니다.
    .refine((t) => t[t.length - 1]?.role === 'user', {
      message: '마지막 메시지는 사용자 차례여야 합니다',
    }),
});

/** zod 이슈를 "필드: 메시지" 문자열 배열로 평탄화 */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.join('.');
    return path ? `${path}: ${i.message}` : i.message;
  });
}

/** 쿼리스트링 → listArcades 파라미터 */
export function parseListQuery(searchParams: URLSearchParams) {
  const num = (key: string): number | null => {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const machineIds = (searchParams.get('machines') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  return {
    q: searchParams.get('q'),
    machineIds: machineIds.length ? machineIds : null,
    lat: num('lat'),
    lng: num('lng'),
    radiusKm: num('radius'),
  };
}
