import { Suspense } from 'react';
import ArcadeFinder from '@/components/ArcadeFinder';

export default function Page() {
  // ArcadeFinder 가 ?arcade=3 (실시간 피드에서 넘어온 링크) 를 읽으므로
  // useSearchParams 경계가 필요하다.
  return (
    <Suspense fallback={<p className="muted pad">불러오는 중…</p>}>
      <ArcadeFinder />
    </Suspense>
  );
}
