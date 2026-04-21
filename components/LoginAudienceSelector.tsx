'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MatrixScope } from '@/lib/matrix-region-filters';

type ViewMode = 'matrix' | 'map' | 'titer';

const OPTIONS: Array<{ value: MatrixScope; label: string }> = [
  { value: 'dabi', label: '다비' },
  { value: 'default', label: '농장주' },
  { value: 'gov_central', label: '정부(중앙)' },
  { value: 'gov_local', label: '정부(지방)' },
  { value: 'public_vet', label: '공수의' },
  { value: 'vet_assigned', label: '담당 수의사' },
  { value: 'vet_union', label: '수의+공수의' },
];

export function LoginAudienceSelector() {
  const router = useRouter();
  const sp = useSearchParams();

  const currentAud = (sp?.get('aud') ?? 'default') as MatrixScope;
  const currentView = (sp?.get('view') ?? 'matrix') as ViewMode;
  const currentPv = (sp?.get('pv') ?? '').trim();

  const normalizedAud: MatrixScope = useMemo(() => {
    if (OPTIONS.some((o) => o.value === currentAud)) return currentAud;
    return 'default';
  }, [currentAud]);

  function push(nextAud: MatrixScope) {
    const next = new URLSearchParams(sp?.toString() ?? '');
    next.set('aud', nextAud);
    // 로그인 주최 변경은 기본적으로 매트릭스(설명/접근성)로 보내는 편이 안전
    next.set('view', 'matrix');

    // aud 전환 시 이전 선택이 섞이지 않도록 초기화
    next.delete('farm');
    next.delete('vet');

    if (nextAud === 'public_vet' || nextAud === 'vet_union') {
      next.set('pv', currentPv === 'chungcheong' ? 'chungcheong' : 'gyeonggi'); // pv 필수
    } else {
      next.delete('pv');
    }
    router.push(`/dashboard?${next.toString()}`);
  }

  function pushPv(pv: 'gyeonggi' | 'chungcheong') {
    const next = new URLSearchParams(sp?.toString() ?? '');
    next.set('pv', pv);
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-600">로그인 주최</span>
      <div className="flex flex-wrap gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => push(o.value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              normalizedAud === o.value
                ? 'bg-zinc-800 text-white'
                : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {(normalizedAud === 'public_vet' || normalizedAud === 'vet_union') && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-500">시연 권역</span>
          <button
            type="button"
            onClick={() => pushPv('gyeonggi')}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              (currentPv || 'gyeonggi') === 'gyeonggi'
                ? 'bg-emerald-700 text-white'
                : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            경기
          </button>
          <button
            type="button"
            onClick={() => pushPv('chungcheong')}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              currentPv === 'chungcheong'
                ? 'bg-emerald-700 text-white'
                : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            충청
          </button>
        </div>
      )}
    </div>
  );
}

