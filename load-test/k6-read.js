/**
 * k6 부하테스트 — 조회(read) 엔드포인트
 *
 * 실행 (반드시 프로덕션 빌드 서버 기준):
 *   npm run build && npm run start        # 터미널 1
 *   k6 run load-test/k6-read.js           # 터미널 2 (스모크: 기본)
 *   k6 run -e SCENARIO=load load-test/k6-read.js    # 본 부하
 *   k6 run -e SCENARIO=stress load-test/k6-read.js  # 한계 탐색
 *
 * BASE_URL 바꾸려면: -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

const SCENARIOS = {
  // 스모크: 스크립트/서버가 멀쩡한지 1분 확인
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '1m',
  },
  // 본 부하: 점진 증가 → 유지 → 감소
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '3m', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },
  // 스트레스: 어디서 무너지는지 탐색
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '1m', target: 0 },
    ],
  },
};

const which = __ENV.SCENARIO || 'smoke';

export const options = {
  scenarios: { [which]: SCENARIOS[which] },
  thresholds: {
    http_req_failed: ['rate<0.01'],          // 실패율 1% 미만
    http_req_duration: ['p(95)<500'],        // 95% 요청 500ms 미만
    'http_req_duration{name:arcades-radius}': ['p(95)<800'], // 반경 검색은 무거우니 별도 기준
  },
};

// 시작 시 한 번: 실제 존재하는 오락실 ID 목록을 확보
export function setup() {
  const res = http.get(`${BASE}/api/arcades`);
  const arcades = res.json('arcades') || [];
  const ids = arcades.slice(0, 200).map((a) => a.id);
  if (ids.length === 0) throw new Error('오락실 데이터가 없습니다 — DB 확인');
  return { ids };
}

export default function (data) {
  // 실제 사용 패턴 흉내: 목록 → 검색/반경 → 상세 → 커뮤니티/서열표
  const id = data.ids[Math.floor(Math.random() * data.ids.length)];

  const responses = http.batch([
    ['GET', `${BASE}/api/arcades?q=${encodeURIComponent('게임')}`, null, { tags: { name: 'arcades-search' } }],
    ['GET', `${BASE}/api/arcades?lat=37.5665&lng=126.9780&radius=5`, null, { tags: { name: 'arcades-radius' } }],
    ['GET', `${BASE}/api/arcades/${id}`, null, { tags: { name: 'arcade-detail' } }],
    ['GET', `${BASE}/api/posts?limit=20`, null, { tags: { name: 'posts-list' } }],
    ['GET', `${BASE}/api/tier`, null, { tags: { name: 'tier' } }],
    ['GET', `${BASE}/api/machines`, null, { tags: { name: 'machines' } }],
  ]);

  for (const res of responses) {
    check(res, {
      'status 200': (r) => r.status === 200,
      'JSON 응답': (r) => String(r.headers['Content-Type'] || '').includes('application/json'),
    });
  }

  sleep(1); // 사용자 think time
}
