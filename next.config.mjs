/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships WASM + native-ish assets; keep it out of the bundler.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],

  // 개발 모드 전용 Next.js 표시(next-logo 버튼)는 Shadow DOM 안에 있어서
  // globals.css 의 display:none 이 먹지 않는다 — 아예 꺼야 한다.
  // (예전엔 기본 위치(좌하단)가 사이드바 등록/취소 버튼을 덮어서 위치만
  // 옮겼었는데, 이제 통째로 숨긴다.)
  devIndicators: false,
};

export default nextConfig;
