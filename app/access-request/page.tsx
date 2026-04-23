import Link from 'next/link';
import { AccessRequestForm } from '@/components/AccessRequestForm';

export default function AccessRequestPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">회원가입 (사내 접근 신청)</h1>
        <p className="mt-2 text-sm text-zinc-600">
          <strong>실명</strong>과 Google 로그인에 쓸 <strong>동일한 이메일</strong>을 적어 주세요. 관리자가
          승인하면 같은 Google 계정으로 로그인할 수 있습니다.
        </p>
      </div>
      <AccessRequestForm />
      <p className="text-center text-sm">
        <Link href="/" className="text-zinc-600 underline hover:text-zinc-900">
          로그인 화면으로
        </Link>
      </p>
    </div>
  );
}
