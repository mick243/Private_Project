import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, type SessionUser } from './auth-types';
import { getDb } from './db';
import { isUniqueViolation } from './pg-errors';

/**
 * 인증.
 *
 * 둘러보기와 제보는 로그인 없이도 됩니다. **이름이 붙는 일**(리뷰·글·댓글·채보
 * 평가)은 로그인이 있어야 합니다 — 그 이름의 근거가 세션뿐이기 때문입니다
 * (lib/use-player.ts). 관리자만 되는 건 오락실 정보 수정과 제보 삭제입니다.
 *
 * 계정은 세 갈래로 들어옵니다. 셋 다 마지막에는 players 한 줄이 됩니다 —
 * 관리자도, 소셜로 들어온 사람도 제보·리뷰를 남기는 한 명의 플레이어입니다.
 *   1. 관리자 : 근거가 DB 가 아니라 **환경변수**입니다 (ADMIN_NICKNAME /
 *      ADMIN_PASSWORD). 해시를 시드에 박으면 비밀번호가 저장소에 남고, 바꾸려면
 *      DB 를 손대야 합니다. 로그인할 때마다 env 와 DB 를 맞춰 둡니다.
 *   2. 아이디/비밀번호 가입 : createAccount() — players.password_hash 에 scrypt.
 *   3. 소셜 로그인 : linkOAuthAccount() — 비밀번호 없이 player_identities 로
 *      묶습니다 (lib/oauth.ts 가 "무엇으로 본인을 증명했는가"를 맡습니다).
 *
 * 세션은 셋 모두 같습니다 — 서명한 쿠키 한 장(sealPayload). 세션 테이블을 두면
 * 만료·정리가 따라오는데, 지금 담을 게 "누구인가 · 관리자인가" 두 줄뿐이라
 * 값을 그대로 서명해 들려보냅니다.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** 쿠키 수명. 관리 작업은 뜸하게 하므로 짧으면 매번 다시 로그인하게 됩니다 */
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

const DEFAULT_ADMIN_NICKNAME = '관리자';
/** ADMIN_PASSWORD 가 없을 때 **개발 환경에서만** 쓰는 값 */
const DEV_ADMIN_PASSWORD = 'admin1234';

// ─── 비밀번호 ────────────────────────────────────────────────
// scrypt 는 node 기본 제공이라 의존성이 늘지 않고, bcrypt 와 달리 72바이트
// 절단이 없습니다. 형식은 'scrypt$<salt hex>$<key hex>' — 나중에 파라미터를
// 올리더라도 앞의 알고리즘 이름으로 옛 해시를 구분할 수 있습니다.

const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;
  const [algo, saltHex, keyHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  // 길이가 다르면 timingSafeEqual 이 던집니다 — 먼저 거릅니다.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ─── 세션 쿠키 ───────────────────────────────────────────────

interface TokenPayload {
  pid: number;
  nick: string;
  adm: boolean;
  /** epoch 초 */
  exp: number;
}

let warnedAboutSecret = false;

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    // 운영에서 고정 문자열로 서명하면 누구나 관리자 쿠키를 만들 수 있습니다.
    throw new Error('AUTH_SECRET 이 설정되지 않았습니다 (16자 이상 필요)');
  }
  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[auth] AUTH_SECRET 미설정 — 개발용 고정 키로 서명합니다');
  }
  return 'arcade-finder-dev-secret-do-not-use-in-production';
}

function sign(body: string): string {
  return createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}

/**
 * 값을 그대로 들려보내되 **고쳐 쓰지는 못하게** 봉합니다 — `<본문>.<서명>`.
 *
 * 세션 쿠키가 이 모양이고, OAuth 의 state 쿠키도 같은 걸 씁니다
 * (lib/oauth.ts). 저장소가 필요 없는 대신 값이 밖으로 나가므로, 비밀이 아닌
 * 것만 담습니다. `ttlSeconds` 는 본문 안에 `exp` 로 함께 봉해집니다 — 쿠키
 * 만료는 브라우저가 지우는 시늉일 뿐이라 서버가 따로 봐야 합니다.
 */
export function sealPayload(payload: object, ttlSeconds: number): string {
  const withExp = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(withExp)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** sealPayload 의 짝. 서명이 다르거나 기한이 지났으면 null */
export function openPayload<T>(token: string | null | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    return payload as T;
  } catch {
    return null;
  }
}

export function createSessionToken(user: SessionUser): string {
  const payload: Omit<TokenPayload, 'exp'> = {
    pid: user.playerId,
    nick: user.nickname,
    adm: user.isAdmin,
  };
  return sealPayload(payload, SESSION_MAX_AGE_S);
}

export function readSessionToken(token: string | null | undefined): SessionUser | null {
  const payload = openPayload<TokenPayload>(token);
  if (!payload) return null;
  if (!Number.isInteger(payload.pid) || payload.pid <= 0) return null;
  return { playerId: payload.pid, nickname: String(payload.nick), isAdmin: !!payload.adm };
}

/**
 * 쿠키 헤더에서 값 하나를 꺼냅니다.
 *
 * next/headers 의 cookies() 를 쓰지 않는 이유: 라우트 핸들러가 이미 Request 를
 * 들고 있어 추가 async 동적 API 없이 읽을 수 있고, requireAdmin(request) 한
 * 시그니처로 모든 경로에서 같게 동작합니다.
 */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** 쿠키만 보고 판단합니다 — 권한이 필요한 곳에서는 requireAdmin 을 쓰세요 */
export function getSession(request: Request): SessionUser | null {
  return readSessionToken(readCookie(request, SESSION_COOKIE));
}

export function setSessionCookie(res: NextResponse, user: SessionUser): NextResponse {
  res.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

// ─── 권한 ────────────────────────────────────────────────────

export type AdminGuard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * 쿠키의 adm 만 믿지 않고 DB 를 한 번 더 봅니다 — 권한을 뗀 계정의 쿠키가
 * 만료까지 남은 기간 동안 계속 통하면 "권한 회수"가 회수가 아닙니다.
 */
async function adminRow(playerId: number): Promise<{ nickname: string } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ is_admin: boolean; nickname: string }>(
    `SELECT is_admin, nickname FROM players WHERE id = $1`,
    [playerId],
  );
  return rows[0]?.is_admin ? { nickname: rows[0].nickname } : null;
}

/**
 * 관리자 전용 라우트의 첫 줄.
 *
 *   const guard = await requireAdmin(request);
 *   if (!guard.ok) return guard.response;
 */
export async function requireAdmin(request: Request): Promise<AdminGuard> {
  const user = getSession(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: '관리자 로그인이 필요합니다' }, { status: 401 }),
    };
  }

  const row = await adminRow(user.playerId);
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: '관리자 권한이 없습니다' }, { status: 403 }),
    };
  }

  return { ok: true, user: { ...user, nickname: row.nickname, isAdmin: true } };
}

/**
 * "관리자면 무엇이든, 아니면 본인 것만" 인 경로에서 씁니다 (게시판 글·댓글 삭제).
 *
 * requireAdmin 과 달리 권한이 없어도 응답을 만들지 않습니다 — 여기서 401 을
 * 돌려주면 자기 글을 지우려던 일반 사용자까지 막힙니다.
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const user = getSession(request);
  return user !== null && (await adminRow(user.playerId)) !== null;
}

// ─── 관리자 계정 ─────────────────────────────────────────────

/** 설정된 관리자 비밀번호. 운영에서 미설정이면 null — 로그인 자체를 막습니다 */
export function configuredAdminPassword(): string | null {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return process.env.NODE_ENV === 'production' ? null : DEV_ADMIN_PASSWORD;
}

export function configuredAdminNickname(): string {
  return process.env.ADMIN_NICKNAME?.trim() || DEFAULT_ADMIN_NICKNAME;
}

/**
 * 관리자 닉네임과 겉보기로 같은 이름인가.
 *
 * DB 의 닉네임 중복 차단이 lower() 기준이라(migrate-027), 예약어 검사만 바이트
 * 일치로 두면 'Admin' 예약에 'admin' 이 통과한 뒤 관리자 첫 로그인
 * (ensureAdminAccount)이 UNIQUE 에 막히는 어긋남이 생깁니다.
 */
export function isReservedNickname(name: string): boolean {
  return name.toLowerCase() === configuredAdminNickname().toLowerCase();
}

/**
 * env 의 관리자 계정을 players 에 맞춰 둡니다 (없으면 만들고, 다르면 고칩니다).
 *
 * 로그인 시도마다 부릅니다. 덕분에 .env 의 ADMIN_PASSWORD 만 바꾸면 다음
 * 로그인부터 새 비밀번호가 통하고, DB 를 직접 손댈 일이 없습니다. 비용은
 * 실패한 로그인 1회당 scrypt 한 번 더 — 초당 수천 번 들어오는 경로가 아닙니다.
 */
export async function ensureAdminAccount(): Promise<{ id: number; nickname: string } | null> {
  const password = configuredAdminPassword();
  if (!password) return null;

  const nickname = configuredAdminNickname();
  const db = await getDb();

  const { rows } = await db.query<{ id: number; is_admin: boolean; password_hash: string | null }>(
    `SELECT id, is_admin, password_hash FROM players WHERE nickname = $1`,
    [nickname],
  );

  const existing = rows[0];
  if (!existing) {
    const { rows: created } = await db.query<{ id: number }>(
      `INSERT INTO players (nickname, is_admin, password_hash) VALUES ($1, TRUE, $2)
       RETURNING id`,
      [nickname, await hashPassword(password)],
    );
    console.log(`[auth] 관리자 계정 생성 — ${nickname}`);
    return { id: Number(created[0].id), nickname };
  }

  const id = Number(existing.id);
  if (!existing.is_admin || !(await verifyPassword(password, existing.password_hash))) {
    await db.query(`UPDATE players SET is_admin = TRUE, password_hash = $2 WHERE id = $1`, [
      id,
      await hashPassword(password),
    ]);
  }
  return { id, nickname };
}

/** 닉네임+비밀번호로 로그인. 실패 이유는 밖에 알리지 않습니다 */
export async function authenticate(
  nickname: string,
  password: string,
): Promise<SessionUser | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: number;
    nickname: string;
    is_admin: boolean;
    password_hash: string | null;
  }>(`SELECT id, nickname, is_admin, password_hash FROM players WHERE nickname = $1`, [
    nickname.trim(),
  ]);

  const row = rows[0];
  // 비밀번호가 없는 계정(= 일반 플레이어)은 로그인 대상이 아닙니다.
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;

  return { playerId: Number(row.id), nickname: row.nickname, isAdmin: !!row.is_admin };
}

// ─── 일반 계정 가입 ──────────────────────────────────────────

export type SignupResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'taken' | 'reserved' };

/**
 * 아이디/비밀번호로 계정을 만듭니다.
 *
 * 닉네임은 players 에서 이미 UNIQUE 라서 중복은 DB 가 막습니다. 그런데 여기서
 * 미리 한 번 더 보는 이유는 **관리자 닉네임** 때문입니다 — 관리자 계정은 첫
 * 로그인 전까지 players 에 없으므로(ensureAdminAccount), 그 전에 같은 이름으로
 * 가입하면 UNIQUE 에 걸리지 않고 자리를 먼저 차지합니다. 그 뒤 관리자가
 * 로그인하면 ensureAdminAccount 가 그 줄에 is_admin 을 켜 버립니다.
 *
 * 미리 본 뒤에도 INSERT 가 23505 로 떨어질 수 있습니다(같은 순간에 두 명이
 * 같은 이름으로 가입). 그건 호출부에서 잡습니다.
 */
export async function createAccount(
  nickname: string,
  password: string,
): Promise<SignupResult> {
  const name = nickname.trim();
  if (isReservedNickname(name)) return { ok: false, reason: 'reserved' };

  const db = await getDb();
  // 대소문자만 다른 이름도 같은 이름으로 봅니다 (migrate-027 의 lower() 인덱스와
  // 같은 기준 — 여기만 바이트 일치로 보면 안내 없이 23505 로 떨어집니다).
  const { rows: dup } = await db.query(
    `SELECT 1 FROM players WHERE lower(nickname) = lower($1)`,
    [name],
  );
  if (dup[0]) return { ok: false, reason: 'taken' };

  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO players (nickname, password_hash) VALUES ($1, $2) RETURNING id`,
    [name, await hashPassword(password)],
  );
  // 가입으로 관리자가 되지는 않습니다. is_admin 은 DB 기본값 FALSE 그대로 둡니다.
  return { ok: true, user: { playerId: Number(rows[0].id), nickname: name, isAdmin: false } };
}

// ─── 소셜 계정 연결 ──────────────────────────────────────────

/** 닉네임을 players 에 넣을 수 있는 모양으로 다듬습니다 (빈 값 → 제공자 이름) */
function normalizeNickname(raw: string | null, fallback: string): string {
  // NFC 통일은 lib/validation.ts nicknameField 와 같은 이유 — 이 경로(소셜 첫
  // 가입)는 그 스키마를 거치지 않고 제공자가 준 이름이 바로 들어옵니다.
  const name = (raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 100);
  return name || fallback;
}

/**
 * 소셜 신원(provider + uid)을 players 한 줄에 묶고 그 사람을 돌려줍니다.
 *
 *   - 이미 연결돼 있으면 그 계정으로 로그인합니다.
 *   - 처음이면 players 를 새로 만들고 연결합니다.
 *
 * **이메일로 기존 계정을 찾지 않습니다.** 제공자마다 이메일 검증 여부가 다르고,
 * 검증하지 않은 이메일로 계정을 합치면 남의 계정을 가져가는 길이 열립니다.
 * 같은 사람이 카카오와 구글로 각각 들어오면 지금은 서로 다른 계정입니다 —
 * 계정 연결은 "로그인한 상태에서 추가 연결" 로 따로 붙일 자리입니다.
 *
 * 닉네임이 겹치면(플레이어 목록에 이미 같은 이름이 있으면) 뒤에 숫자를 붙입니다.
 * 가입을 실패시키는 대신 이름을 양보하는 쪽인데, 소셜 로그인은 제공자 화면에서
 * 곧장 돌아오는 흐름이라 그 자리에서 실패시키면 되돌릴 방법이 없기 때문입니다.
 *
 * 다만 그렇게 붙인 이름은 **본인이 고른 적이 없습니다.** 그래서 새로 만든 줄에는
 * nickname_pending 을 켜 두고(db/migrate-026-oauth-nickname.sql), 콜백이 곧바로
 * `/welcome` 로 보내 한 번 물어봅니다 (claimNickname 이 그 답을 받습니다).
 * `needsNickname` 이 그 신호입니다 — 이미 연결된 계정도 지난번에 답하지 않고
 * 나갔으면 켜진 채로 남아 있어, 값을 만들지 않고 DB 에 있는 것을 그대로 읽습니다.
 */
export async function linkOAuthAccount(params: {
  provider: string;
  providerUid: string;
  nickname: string | null;
  email: string | null;
}): Promise<{ user: SessionUser; needsNickname: boolean }> {
  const db = await getDb();

  const { rows: linked } = await db.query<{
    id: number;
    nickname: string;
    is_admin: boolean;
    nickname_pending: boolean;
  }>(
    `SELECT p.id, p.nickname, p.is_admin, p.nickname_pending
       FROM player_identities i
       JOIN players p ON p.id = i.player_id
      WHERE i.provider = $1 AND i.provider_uid = $2`,
    [params.provider, params.providerUid],
  );
  if (linked[0]) {
    return {
      user: {
        playerId: Number(linked[0].id),
        nickname: linked[0].nickname,
        isAdmin: !!linked[0].is_admin,
      },
      needsNickname: !!linked[0].nickname_pending,
    };
  }

  const base = normalizeNickname(params.nickname, params.provider);
  let playerId: number | null = null;
  let nickname = base;

  // 이름을 양보하는 루프. 관리자 닉네임도 여기서 함께 비켜 갑니다.
  for (let attempt = 0; attempt < 20 && playerId === null; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 94)}${attempt + 1}`;
    if (isReservedNickname(candidate)) continue;
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO players (nickname, nickname_pending) VALUES ($1, TRUE) RETURNING id`,
        [candidate],
      );
      playerId = Number(rows[0].id);
      nickname = candidate;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (playerId === null) throw new Error('닉네임을 정할 수 없습니다');

  await db.query(
    `INSERT INTO player_identities (provider, provider_uid, player_id, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_uid) DO NOTHING`,
    [params.provider, params.providerUid, playerId, params.email],
  );

  return { user: { playerId, nickname, isAdmin: false }, needsNickname: true };
}

// ─── 소셜로 들어온 사람이 이름을 정하는 자리 ─────────────────

export type NicknameClaim =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'taken' | 'reserved' | 'settled' | 'gone' };

/**
 * `/welcome` 이 받아 온 이름을 players 에 적고 표시를 끕니다.
 *
 * **이미 정한 계정은 여기서 이름을 바꾸지 못합니다**(reason: 'settled').
 * 조건을 빼면 이 라우트가 곧 "언제든 개명" 이 되는데, 그건 다른 기능입니다 —
 * 남이 알던 이름이 예고 없이 바뀌고, 비운 이름을 곧바로 다른 사람이 차지할 수
 * 있어 예전 글의 작성자를 사칭할 길이 열립니다. 지금 필요한 건 "처음 한 번" 뿐입니다.
 *
 * 이름을 그대로 두고 확인만 눌러도 성공입니다 — "이대로 쓰겠다" 도 본인이 고른
 * 것이고, 그러면 다음 로그인에 또 묻지 않습니다.
 *
 * 중복은 미리 보지 않고 UNIQUE 에 맡깁니다. 확인과 UPDATE 사이에 남이 같은
 * 이름을 가져갈 수 있어서 어차피 23505 를 받아야 하고, 그러면 검사가 두 벌이
 * 됩니다 (createAccount 가 선검사를 두는 건 관리자 닉네임 때문인데, 그건 아래에서
 * 따로 봅니다).
 */
export async function claimNickname(
  playerId: number,
  rawNickname: string,
): Promise<NicknameClaim> {
  const name = rawNickname.trim();
  // 관리자 계정은 첫 로그인 전까지 players 에 없으므로 UNIQUE 로는 막히지 않습니다
  // (createAccount 주석과 같은 이유).
  if (isReservedNickname(name)) return { ok: false, reason: 'reserved' };

  const db = await getDb();
  const { rows } = await db.query<{
    nickname: string;
    is_admin: boolean;
    nickname_pending: boolean;
  }>(`SELECT nickname, is_admin, nickname_pending FROM players WHERE id = $1`, [playerId]);

  const row = rows[0];
  if (!row) return { ok: false, reason: 'gone' };
  if (!row.nickname_pending) return { ok: false, reason: 'settled' };

  const user: SessionUser = { playerId, nickname: name, isAdmin: !!row.is_admin };

  if (name === row.nickname) {
    await db.query(`UPDATE players SET nickname_pending = FALSE WHERE id = $1`, [playerId]);
    return { ok: true, user };
  }

  try {
    await db.query(
      `UPDATE players SET nickname = $2, nickname_pending = FALSE WHERE id = $1`,
      [playerId, name],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'taken' };
    throw err;
  }
  return { ok: true, user };
}

// ─── 개인정보 수정 (/account) ────────────────────────────────
/*
 * claimNickname 이 "처음 한 번" 만 허용하는 것과 달리, 여기는 **언제든 개명**입니다.
 * 대신 아무 세션이나 통과시키지 않고 **비밀번호를 다시 물어** 본인임을 확인합니다
 * (app/api/account) — 세션 쿠키는 훔치거나 열어 둔 자리에서 집을 수 있지만
 * 비밀번호는 본인 머릿속에만 있습니다.
 *
 * 소셜로만 가입해 비밀번호가 없는 계정(password_hash IS NULL)은 확인할 대상이
 * 없으므로, 로그인 세션만으로 **첫 비밀번호 설정**을 허용합니다. 설정한 뒤부터는
 * 같은 화면이 비밀번호를 요구합니다.
 */

/** /account 가 화면을 그리기 전에 묻는 것 — 지금 이름과 "비밀번호가 있는가" */
export async function accountStatus(
  playerId: number,
): Promise<{ nickname: string; hasPassword: boolean; isAdmin: boolean } | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    nickname: string;
    password_hash: string | null;
    is_admin: boolean;
  }>(`SELECT nickname, password_hash, is_admin FROM players WHERE id = $1`, [playerId]);
  if (!rows[0]) return null;
  return {
    nickname: rows[0].nickname,
    hasPassword: rows[0].password_hash !== null,
    isAdmin: !!rows[0].is_admin,
  };
}

/** 저장된 해시와 대조합니다. 계정이 없거나 비밀번호가 없으면 false */
export async function verifyPlayerPassword(
  playerId: number,
  password: string,
): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ password_hash: string | null }>(
    `SELECT password_hash FROM players WHERE id = $1`,
    [playerId],
  );
  if (!rows[0]) return false;
  return verifyPassword(password, rows[0].password_hash);
}

/** 비밀번호를 설정/변경합니다. 이후 아이디/비밀번호 로그인(authenticate)도 열립니다 */
export async function setPlayerPassword(playerId: number, password: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE players SET password_hash = $2 WHERE id = $1`, [
    playerId,
    await hashPassword(password),
  ]);
}

/**
 * 닉네임 변경 — claimNickname 에서 nickname_pending 조건만 뺀 것.
 *
 * 그 조건이 막던 사칭 위험(비운 이름을 남이 차지)은 여전히 있지만, 여기는
 * 비밀번호 확인을 통과한 뒤에만 도달하고 본인이 바꾸겠다고 한 것입니다.
 * pending 표시는 함께 끕니다 — 본인이 고른 이름이 생겼으므로 /welcome 이
 * 다시 물을 이유가 없습니다.
 */
export async function changeNickname(
  playerId: number,
  rawNickname: string,
): Promise<NicknameClaim> {
  const name = rawNickname.trim();
  if (isReservedNickname(name)) return { ok: false, reason: 'reserved' };

  const db = await getDb();
  const { rows } = await db.query<{ nickname: string; is_admin: boolean }>(
    `SELECT nickname, is_admin FROM players WHERE id = $1`,
    [playerId],
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'gone' };

  const user: SessionUser = { playerId, nickname: name, isAdmin: !!row.is_admin };

  if (name === row.nickname) {
    await db.query(`UPDATE players SET nickname_pending = FALSE WHERE id = $1`, [playerId]);
    return { ok: true, user };
  }

  try {
    await db.query(
      `UPDATE players SET nickname = $2, nickname_pending = FALSE WHERE id = $1`,
      [playerId, name],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'taken' };
    throw err;
  }
  return { ok: true, user };
}

/** `/welcome` 이 화면을 그리기 전에 묻는 것 — "물어볼 상태인가, 지금 이름은 무엇인가" */
export async function nicknameStatus(
  playerId: number,
): Promise<{ nickname: string; pending: boolean } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ nickname: string; nickname_pending: boolean }>(
    `SELECT nickname, nickname_pending FROM players WHERE id = $1`,
    [playerId],
  );
  if (!rows[0]) return null;
  return { nickname: rows[0].nickname, pending: !!rows[0].nickname_pending };
}

// ─── 로그인 시도 제한 ────────────────────────────────────────
/**
 * 프로세스 메모리에만 남는 최소한의 제동장치입니다. 서버가 여러 대면 대수만큼
 * 여유가 생기고 재시작하면 풀립니다 — 그래도 "비밀번호 하나짜리 관리자 계정"에
 * 아무 제한이 없는 것보다는 낫습니다. 제대로 하려면 Redis 등으로 옮기세요.
 */
const MAX_FAILURES = 8;
const LOCK_MS = 10 * 60 * 1000;

const failures = new Map<string, { count: number; until: number }>();

export function loginLockRemainingMs(key: string): number {
  const hit = failures.get(key);
  if (!hit || hit.count < MAX_FAILURES) return 0;
  const left = hit.until - Date.now();
  if (left <= 0) {
    failures.delete(key);
    return 0;
  }
  return left;
}

export function noteLoginFailure(key: string): void {
  const hit = failures.get(key);
  const count = hit && hit.until > Date.now() ? hit.count + 1 : 1;
  failures.set(key, { count, until: Date.now() + LOCK_MS });
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

/** 시도 제한의 키. 프록시 뒤라면 X-Forwarded-For 의 첫 홉이 클라이언트입니다 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}
