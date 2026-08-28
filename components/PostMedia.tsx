'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 본문 첨부(사진·동영상)의 공용 렌더러 — 평문 경로(PostBody)와 서식 경로(RichText)가
 * 같은 것을 쓴다. 두 곳이 따로 그리면 지연 로딩 규칙이 조용히 갈라진다.
 *
 * 왜 지연 로딩인가: 첨부는 원본 그대로 저장되고(썸네일이 없다) 서식 본문에는
 * 개수 제한도 없다. 사진 열 장 · 동영상 몇 개짜리 글을 열면 화면 밖 것까지
 * 전부 즉시 받아와서, 첫 화면이 뜨기 전에 수십 MB 가 내려오는 글이 생긴다.
 */

/**
 * 원본 크기를 저장하지 않아 width/height 를 줄 수 없고, 그 상태의 `loading="lazy"`
 * 는 로드 전 <img> 가 2x2 상자로 찌그러져 크롬의 지연 로딩 판단이 깨진다
 * (화면 안에 있어도 로드되지 않는 것을 실제로 겪었다 — 옛 PostBody 주석).
 *
 * 그래서 **로드 전에만** 자리 상자 클래스를 붙인다 (app/globals.css
 * .post-media-loading — 폭 100% · 16/10 비율). 상자가 실제 크기를 가지므로
 * 지연 로딩 판단이 정상 동작하고, 로드가 끝나면 클래스를 떼서 원본 비율로
 * 돌아간다. SSR 마크업에도 클래스가 실려 있어 JS 가 늦어도 상자는 있다.
 */
export function PostImage({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // 캐시에서 즉시 로드되면 onLoad 가 hydration 전에 지나가 버린다 — 놓친 것을 줍는다.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt="첨부 사진"
      loading="lazy"
      decoding="async"
      className={loaded ? undefined : 'post-media-loading'}
      onLoad={() => setLoaded(true)}
      // 깨진 첨부가 16/10 짜리 빈 상자로 남으면 안 된다 — 브라우저 기본(깨짐 아이콘)에 맡긴다
      onError={() => setLoaded(true)}
    />
  );
}

/**
 * 동영상은 <video> 에 지연 로딩 속성이 없어서 IntersectionObserver 로 직접 한다.
 * 화면 근처(ROOT_MARGIN)에 올 때까지는 같은 크기의 빈 상자만 두고, 가까워지면
 * 그때 <video preload="metadata"> 를 붙인다 — metadata 도 파일마다 수백 KB 를
 * 받으므로, 스크롤이 닿지도 않을 아래쪽 영상의 것까지 미리 받을 이유가 없다.
 */
const VIDEO_ROOT_MARGIN = '400px';

export function PostVideo({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // IO 가 없는 옛 브라우저는 그냥 바로 붙인다 — 지연은 최적화지 기능이 아니다.
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: VIDEO_ROOT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (near) return <video className="post-video" src={src} controls preload="metadata" />;
  // 실제 비율은 metadata 가 와야 아는데 그걸 안 받는 게 목적이므로 16/9 로 잡아 둔다.
  // 스크롤이 닿기 400px 전에 진짜 영상으로 바뀌니 어긋남이 눈에 띄는 일은 드물다.
  return <div ref={ref} className="post-video post-media-loading" aria-label="동영상 불러오는 중" />;
}
