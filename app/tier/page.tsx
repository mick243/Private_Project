import TierBoardView from '@/components/TierBoardView';

export const metadata = {
  title: '체감 난이도 서열표',
  description: '같은 레벨 안에서의 체감 난이도를 클리어한 플레이어들의 투표로 배치합니다',
};

export default function Page() {
  return <TierBoardView />;
}
