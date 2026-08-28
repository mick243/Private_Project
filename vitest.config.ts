import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // tsconfig 의 "@/*" 별칭과 같아야 한다.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['lib/**/*.ts'],
      exclude: [
        // 타입만 있는 모듈 — 실행되는 코드가 없어 분모만 부풀린다.
        // (board-types / community-types / tier-types 는 함수가 있으므로 포함한다)
        'lib/types.ts',
        // 브라우저 전용 — 노드 환경에서 실행할 수 없다.
        // 화면 테스트를 붙이면 jsdom 환경으로 따로 잡는다.
        'lib/use-*.ts',
        'lib/naver-loader.ts',
      ],
    },
  },
});
