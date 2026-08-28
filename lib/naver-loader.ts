'use client';

/**
 * 네이버 지도 JS SDK 로더.
 *
 * NCP 콘솔 마이그레이션 이후 인증 파라미터 이름이 ncpClientId → ncpKeyId 로
 * 바뀌었습니다. 발급 시점에 따라 둘 중 하나만 동작하므로 env 로 고를 수 있게 둡니다.
 *   NEXT_PUBLIC_NAVER_MAP_AUTH_PARAM=legacy  → 구버전(ncpClientId)
 */
const KEY_ID = process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID ?? '';
const IS_LEGACY = process.env.NEXT_PUBLIC_NAVER_MAP_AUTH_PARAM === 'legacy';

export const hasNaverKey = KEY_ID.trim().length > 0;

export function naverScriptUrl(): string {
  return IS_LEGACY
    ? `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${encodeURIComponent(KEY_ID)}`
    : `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(KEY_ID)}`;
}

let loadPromise: Promise<typeof naver> | null = null;

/** SDK 를 한 번만 주입하고, 로드가 끝나면 naver 네임스페이스를 돌려준다. */
export function loadNaverMaps(): Promise<typeof naver> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저에서만 로드할 수 있습니다'));
  }
  if (window.naver?.maps) return Promise.resolve(window.naver);
  if (!hasNaverKey) {
    return Promise.reject(new Error('NEXT_PUBLIC_NAVER_MAP_KEY_ID 가 설정되지 않았습니다'));
  }

  loadPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = naverScriptUrl();
    script.async = true;
    script.onload = () => {
      if (window.naver?.maps) resolve(window.naver);
      else reject(new Error('SDK 는 로드됐지만 naver.maps 를 찾을 수 없습니다'));
    };
    script.onerror = () =>
      reject(
        new Error(
          '네이버 지도 SDK 로드 실패 — 키가 유효한지, NCP 콘솔에 현재 도메인이 등록됐는지 확인하세요',
        ),
      );
    document.head.appendChild(script);
  });

  return loadPromise;
}
