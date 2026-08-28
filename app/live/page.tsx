import LiveFeed from '@/components/LiveFeed';

export const metadata = {
  title: '실시간 제보 — 오락실 파인더',
  description: '기종별 대기 인원, 기체 컨디션, 기종 변동 제보를 한 화면에서 봅니다',
};

export default function Page() {
  return <LiveFeed />;
}
