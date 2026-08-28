import type { Metadata } from 'next';
import TopNav from '@/components/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: '오락실 파인더',
  description: '내 주변 오락실 위치 · 보유 기종 · 영업시간을 모으는 크라우드소싱 지도',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
