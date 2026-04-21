'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Props = {
  className?: string;
};

export function DashboardHomeLink({ className }: Props) {
  const sp = useSearchParams();
  const aud = (sp?.get('aud') ?? 'dabi').trim() || 'dabi';

  // 홈은 "농장 전체 + 질병필터 전체" 리셋을 의미한다.
  // 질병필터는 URL에 저장되지 않으므로 reset 토큰으로 클라이언트 상태를 초기화한다.
  // reset 토큰은 렌더링 중 생성하지 않고, 클릭 시에만 만들도록 query를 비워둔다.
  const href = `/dashboard?aud=${encodeURIComponent(aud)}&view=matrix`;

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // 클릭 시점에만 reset 토큰 생성 (렌더 순수성 유지)
        e.preventDefault();
        const reset = Date.now();
        window.location.href = `${href}&reset=${reset}`;
      }}
    >
      질병메일링 대시보드
    </Link>
  );
}

