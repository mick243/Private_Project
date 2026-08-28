import { Suspense } from 'react';
import AccountForm from '@/components/AccountForm';

export const metadata = {
  title: '개인정보 수정 — 오락실 파인더',
  description: '닉네임과 비밀번호를 확인하고 바꿉니다',
};

export default function Page() {
  // AccountForm 이 ?next=… 를 읽으므로 useSearchParams 경계가 필요하다
  // (/welcome 과 같은 이유).
  return (
    <Suspense fallback={<p className="muted pad">불러오는 중…</p>}>
      <AccountForm />
    </Suspense>
  );
}
