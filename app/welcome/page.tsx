import { Suspense } from 'react';
import NicknameForm from '@/components/NicknameForm';

export const metadata = {
  title: '닉네임 정하기 — 오락실 파인더',
  description: '소셜 로그인으로 처음 들어온 계정의 활동 이름을 정합니다',
};

export default function Page() {
  // NicknameForm 이 ?next=… (이름을 정하고 돌아갈 곳) 를 읽으므로
  // useSearchParams 경계가 필요하다 (로그인·가입 페이지와 같은 이유).
  return (
    <Suspense fallback={<p className="muted pad">불러오는 중…</p>}>
      <NicknameForm />
    </Suspense>
  );
}
