import { Suspense } from 'react';
import SignupForm from '@/components/SignupForm';

export const metadata = {
  title: '회원가입 — 오락실 파인더',
  description: '아이디·비밀번호 또는 소셜 계정으로 가입',
};

export default function Page() {
  // SignupForm 이 ?next=… (가입 뒤 돌아갈 곳) 를 읽으므로
  // useSearchParams 경계가 필요하다 (로그인 페이지와 같은 이유).
  return (
    <Suspense fallback={<p className="muted pad">불러오는 중…</p>}>
      <SignupForm />
    </Suspense>
  );
}
