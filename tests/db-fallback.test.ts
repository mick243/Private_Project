import { describe, expect, it } from 'vitest';
import { isConnectionLostError } from '@/lib/db';

/**
 * 폴백 판정 — "DB 에 못 닿았다" 와 "쿼리가 틀렸다" 를 가르는 자리입니다.
 *
 * 이걸 넓게 잡으면 제약 위반이나 문법 오류까지 로컬 사본에서 다시 실행되면서
 * 버그가 조용히 묻힙니다. 좁게 잡으면 PostgreSQL 이 멈춰도 화면이 죽습니다.
 * 어느 쪽으로 새도 겉으로는 잘 도는 것처럼 보이므로 경계를 고정해 둡니다.
 */
describe('isConnectionLostError', () => {
  it('소켓이 거절·리셋되면 폴백한다', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE']) {
      expect(isConnectionLostError(Object.assign(new Error('socket'), { code }))).toBe(true);
    }
  });

  it('서버가 내려가거나 아직 못 받는 상태면 폴백한다', () => {
    // 57P01 = 서비스 정지·재시작, 57P03 = 부팅 중, 08006 = 연결 실패
    for (const code of ['57P01', '57P02', '57P03', '08006', '08003', '08001', '08004', '08000']) {
      expect(isConnectionLostError(Object.assign(new Error('down'), { code }))).toBe(true);
    }
  });

  it('코드가 없어도 커넥션이 끊긴 메시지면 폴백한다', () => {
    // node-postgres 가 코드 없이 메시지만 주는 경우들
    for (const message of [
      'Connection terminated unexpectedly',
      'Client has encountered a connection error and is not queryable',
      'timeout exceeded when trying to connect',
      'Cannot use a pool after calling end on the pool',
    ]) {
      expect(isConnectionLostError(new Error(message))).toBe(true);
    }
  });

  it('쿼리가 틀린 것은 폴백하지 않는다 — 사본에서 다시 해도 똑같이 틀린다', () => {
    // 23505 중복 키, 23503 FK 위반, 42601 문법 오류, 42P01 없는 테이블
    for (const code of ['23505', '23503', '42601', '42P01', '22P02']) {
      expect(isConnectionLostError(Object.assign(new Error('bad query'), { code }))).toBe(false);
    }
  });

  it('커넥션이 많다(53300)는 폴백하지 않는다 — DB 는 살아 있다', () => {
    // 부하가 몰린 순간에 앱 전체가 사본으로 굴러떨어지면 훨씬 나쁘다
    const err = Object.assign(new Error('too many clients already'), { code: '53300' });
    expect(isConnectionLostError(err)).toBe(false);
  });

  it('에러가 아닌 값에도 죽지 않는다', () => {
    for (const value of [null, undefined, 'ECONNREFUSED', 0, {}]) {
      expect(isConnectionLostError(value)).toBe(false);
    }
  });
});
