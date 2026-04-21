'use client';

import { useState } from 'react';
import { FarmSidebar } from '@/components/FarmSidebar';
import { DashboardContent } from '@/components/DashboardContent';
import { useSearchParams } from 'next/navigation';
import { FARMS } from '@/lib/farms';
import { useRouter } from 'next/navigation';

type Props = {
  farm: string | null;
  isAdmin: boolean;
};

export function DashboardPageClient({ farm, isAdmin }: Props) {
  const [viewMode, setViewMode] = useState<'matrix' | 'summary' | 'map' | 'titer'>('matrix');
  const [showMatrixFarmSidebar, setShowMatrixFarmSidebar] = useState(true);
  const sp = useSearchParams();
  const router = useRouter();
  const aud = (sp?.get('aud') ?? 'dabi').trim();
  const vetName = (sp?.get('vet') ?? '').trim();

  const farmerOwned = ['DB1001', 'DB1002'];
  const vetOptions = [...new Set(Object.values(FARMS).map((f) => (f.vet ?? '').trim()).filter((v) => v && v !== '-'))].sort(
    (a, b) => a.localeCompare(b, 'ko')
  );
  const effectiveVet = vetOptions.includes(vetName) ? vetName : vetOptions[0] ?? '';
  const vetAllowed = Object.entries(FARMS)
    .filter(([, f]) => (f.vet ?? '').trim() === effectiveVet)
    .map(([c]) => c);

  return (
    <div className="flex flex-1">
      {(viewMode === 'matrix' || viewMode === 'summary' || viewMode === 'titer') && showMatrixFarmSidebar && (
        <aside className="w-56 shrink-0 border-r border-zinc-200">
          <FarmSidebar
            allowedFarmCodes={
              aud === 'default'
                ? farmerOwned
                : aud === 'vet_assigned'
                  ? vetAllowed
                  : aud === 'vet_union'
                    ? null
                    : aud === 'dabi'
                      ? null
                      : null
            }
            hideAllOption={aud === 'default' || aud === 'vet_assigned'}
            simpleListOnly={aud === 'default'}
            vetSelector={
              aud === 'vet_assigned'
                ? {
                    label: '담당 수의사',
                    value: effectiveVet,
                    options: vetOptions,
                    onChange: (name) => {
                      const params = new URLSearchParams(sp?.toString() ?? '');
                      // 담당 수의사를 바꾸면 "담당농장 매트릭스"로 자연스럽게 돌아가도록 view도 함께 전환
                      params.set('aud', 'vet_assigned');
                      params.set('view', 'matrix');
                      params.set('vet', name);
                      params.delete('farm');
                      router.push(`/dashboard?${params.toString()}`);
                    },
                  }
                : null
            }
          />
        </aside>
      )}
      <main className="flex-1 overflow-auto p-4">
        <DashboardContent
          farm={farm}
          isAdmin={isAdmin}
          viewMode={viewMode}
          onViewModeChange={(m) => {
            setViewMode(m);
          }}
          onMatrixFarmSidebarVisibilityChange={setShowMatrixFarmSidebar}
        />
      </main>
    </div>
  );
}
