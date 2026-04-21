'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RecordsMatrix, type RecordsMatrixViewerProps } from '@/components/RecordsMatrix';
import { RecordsSummaryPanel } from '@/components/RecordsSummaryPanel';
import { TiterTrendPanel } from '@/components/TiterTrendPanel';
import { PendingTitersPanel } from '@/components/PendingTitersPanel';
import { MapViewTabHint } from '@/lib/map-view-tab-hint';
import type { MatrixScope, PublicVetDemoRegion } from '@/lib/matrix-region-filters';
import { fetchDistinctSidoLabelsForMatrix } from '@/lib/matrix-sido-options-client';

const FarmMapPanel = dynamic(
  () => import('@/components/FarmMapPanel').then((m) => m.FarmMapPanel),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">지도 로딩 중…</p> }
);

type FarmTab = 'registered' | 'customer';
type ViewMode = 'matrix' | 'summary' | 'map' | 'titer';

type Props = {
  farm: string | null;
  isAdmin?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onMatrixFarmSidebarVisibilityChange?: (visible: boolean) => void;
};

const MATRIX_AUDIENCE_OPTIONS: { value: MatrixScope; label: string }[] = [
  { value: 'default', label: '농장주' },
  { value: 'dabi', label: '다비' },
  { value: 'gov_central', label: '정부(중앙)' },
  { value: 'gov_local', label: '정부(지방)' },
  { value: 'public_vet', label: '공수의' },
  { value: 'vet_assigned', label: '담당 수의사' },
  { value: 'vet_union', label: '수의+공수의' },
];

export function DashboardContent({
  farm,
  isAdmin,
  viewMode,
  onViewModeChange,
  onMatrixFarmSidebarVisibilityChange,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const farmQuery = (searchParams?.get('farm') ?? '').trim();
  const resetKey = (searchParams?.get('reset') ?? '').trim();
  const [farmTab, setFarmTab] = useState<FarmTab>('registered');
  const [matrixAudience, setMatrixAudience] = useState<MatrixScope>('default');
  const [govCentralView, setGovCentralView] = useState<'aggregate' | 'farms'>('aggregate');
  const [publicVetRegion, setPublicVetRegion] = useState<PublicVetDemoRegion | null>('gyeonggi');
  const [localSido, setLocalSido] = useState('');
  const [sidoOptions, setSidoOptions] = useState<string[]>([]);

  useEffect(() => {
    fetchDistinctSidoLabelsForMatrix().then(setSidoOptions);
  }, []);

  // URL(쿼리) → 상태 복원: 뒤로가기/앞으로가기 시 view/audience를 따라가도록 한다.
  useEffect(() => {
    const aud = (searchParams?.get('aud') ?? '').trim() as MatrixScope;
    const view = (searchParams?.get('view') ?? '').trim() as ViewMode;
    const pv = (searchParams?.get('pv') ?? '').trim() as PublicVetDemoRegion;
    const nextAud: MatrixScope =
      MATRIX_AUDIENCE_OPTIONS.some((o) => o.value === aud) ? aud : 'default';
    const nextView: ViewMode =
      view === 'map' || view === 'titer' || view === 'matrix' || view === 'summary' ? view : 'matrix';

    if (nextAud !== matrixAudience) {
      setMatrixAudience(nextAud);
    }
    if ((nextAud === 'public_vet' || nextAud === 'vet_union') && (pv === 'gyeonggi' || pv === 'chungcheong')) {
      setPublicVetRegion(pv);
    }
    if (nextView !== viewMode) {
      onViewModeChange(nextView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pushDashboardState(next: { aud?: MatrixScope; view?: ViewMode }) {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next.aud) sp.set('aud', next.aud);
    if (next.view) sp.set('view', next.view);
    const url = `/dashboard?${sp.toString()}`;
    router.push(url);
  }

  useEffect(() => {
    const show =
      (viewMode === 'matrix' || viewMode === 'summary' || viewMode === 'titer') &&
      (matrixAudience === 'dabi' || matrixAudience === 'default' || matrixAudience === 'vet_assigned' || matrixAudience === 'vet_union');
    onMatrixFarmSidebarVisibilityChange?.(show);
  }, [viewMode, matrixAudience, onMatrixFarmSidebarVisibilityChange]);

  useEffect(() => {
    // 고객농장 탭은 농장주(default) + 다비(dabi)에서만 노출
    if (matrixAudience !== 'default' && matrixAudience !== 'dabi' && farmTab === 'customer') {
      setFarmTab('registered');
    }
  }, [matrixAudience, farmTab]);

  useEffect(() => {
    if (!resetKey) return;
    // 홈 리셋 시 고객농장 탭이 남아있으면 기본(등록농장)으로 복귀
    setFarmTab('registered');
  }, [resetKey]);

  // 농장 선택은 기본적으로 "전체(미지정)" 상태로 두고, 사용자가 필요 시 필터링한다.

  const matrixViewer = useMemo((): RecordsMatrixViewerProps | null => {
    if (matrixAudience === 'default') return null;
    const v: RecordsMatrixViewerProps = {
      matrixScope: matrixAudience as RecordsMatrixViewerProps['matrixScope'],
    };
    if (matrixAudience === 'gov_central') {
      v.govCentralView = govCentralView;
      v.forceFarmAnonymize = govCentralView === 'farms';
    }
    if (matrixAudience === 'gov_local') {
      v.localSido = localSido.trim() || null;
    }
    if (matrixAudience === 'public_vet' || matrixAudience === 'vet_union') {
      v.publicVetRegion = publicVetRegion;
    }
    return v;
  }, [matrixAudience, govCentralView, localSido, publicVetRegion]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [issuesText, setIssuesText] = useState<string>('');
  const [readingHistoryText, setReadingHistoryText] = useState<string>('');
  const [pendingTitersCount, setPendingTitersCount] = useState<number>(0);
  const [showPendingTiters, setShowPendingTiters] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    function onImportDone() {
      setRefreshKey((k) => k + 1);
    }
    function onIssuesLoaded(e: Event) {
      const ce = e as CustomEvent<{ issuesText?: string }>;
      setIssuesText(ce.detail?.issuesText ?? '');
    }
    function onReadingHistoryLoaded(e: Event) {
      const ce = e as CustomEvent<{ text?: string }>;
      setReadingHistoryText(ce.detail?.text ?? '');
    }
    window.addEventListener('admin:importOcrDone', onImportDone as EventListener);
    window.addEventListener('admin:parseIssuesLoaded', onIssuesLoaded as EventListener);
    window.addEventListener('admin:readingHistoryLoaded', onReadingHistoryLoaded as EventListener);
    function onPendingTitersUpdated() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener('pendingTitersUpdated', onPendingTitersUpdated);
    return () => {
      window.removeEventListener('admin:importOcrDone', onImportDone as EventListener);
      window.removeEventListener('admin:parseIssuesLoaded', onIssuesLoaded as EventListener);
      window.removeEventListener('admin:readingHistoryLoaded', onReadingHistoryLoaded as EventListener);
      window.removeEventListener('pendingTitersUpdated', onPendingTitersUpdated);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!farmQuery) {
      setPendingTitersCount(0);
      return;
    }
    const q = new URLSearchParams();
    q.set('farms', farmQuery);
    q.set('excludeNegative', '1');
    fetch(`/api/titers/pending?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => setPendingTitersCount(Array.isArray(d.groups) ? d.groups.length : 0))
      .catch(() => setPendingTitersCount(0));
  }, [isAdmin, refreshKey, farmQuery]);

  return (
    <div className="space-y-3">
      {isAdmin && !farmQuery && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          일령 미입력 항체가 입력은 <span className="font-medium text-zinc-800">왼쪽에서 농장을 선택한 뒤</span> 해당 농장만 표시됩니다. (전체 보기에서는 목록을 두지 않습니다.)
        </div>
      )}
      {isAdmin && farmQuery && pendingTitersCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-amber-900">
              선택 농장 기준 일령 미입력 항체가 {pendingTitersCount}건 있습니다.
            </div>
            <button
              type="button"
              onClick={() => setShowPendingTiters((v) => !v)}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              {showPendingTiters ? '닫기' : '확인하기'}
            </button>
          </div>
          {showPendingTiters && <div className="mt-3"><PendingTitersPanel /></div>}
        </div>
      )}
      {isAdmin && readingHistoryText && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="mb-2 text-sm font-medium text-zinc-800">리딩 내역 (최근)</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">
            {readingHistoryText}
          </pre>
        </div>
      )}
      {isAdmin && issuesText && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="mb-2 text-sm font-medium text-zinc-800">판정 미해독(폴백) 목록 (최근 200)</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">
            {issuesText}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">

          {/* 진료수의사(vet_assigned): [담당농장 매트릭스][항체가 추세] */}
          {matrixAudience === 'vet_assigned' && (
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'matrix' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'matrix' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                담당농장 매트릭스
              </button>
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'summary' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'summary' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                요약
              </button>
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'titer' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'titer' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                항체가 추세
              </button>
            </div>
          )}

          {/* 그 외 / 농장주 내 농장: [매트릭스][지도] + default는 [항체가 추세] 추가 */}
          {matrixAudience !== 'vet_assigned' && (
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'matrix' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'matrix' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                매트릭스
              </button>
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'summary' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'summary' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                요약
              </button>
              <button
                type="button"
                onClick={() => pushDashboardState({ aud: matrixAudience, view: 'map' })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'map' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                지도
              </button>
              {matrixAudience === 'default' && (
                <button
                  type="button"
                  onClick={() => pushDashboardState({ aud: matrixAudience, view: 'titer' })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'titer' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  항체가 추세
                </button>
              )}
              {matrixAudience === 'dabi' && (
                <button
                  type="button"
                  onClick={() => pushDashboardState({ aud: matrixAudience, view: 'titer' })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'titer' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  항체가 추세
                </button>
              )}
            </div>
          )}

          {/* 등록농장 / 고객농장 (농장주/다비 + matrix 일 때만) */}
          {viewMode === 'matrix' && (matrixAudience === 'default' || matrixAudience === 'dabi') && (
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => setFarmTab('registered')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  farmTab === 'registered' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                등록농장
              </button>
              <button
                type="button"
                onClick={() => setFarmTab('customer')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  farmTab === 'customer' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
                }`}
              >
                고객농장
              </button>
            </div>
          )}
        </div>
        {viewMode === 'map' && <MapViewTabHint />}
      </div>

      {/* 로그인 주최(상단)에서 관점/권역을 제어합니다. */}

      {viewMode === 'titer' ? (
        <TiterTrendPanel farmCode={farm} matrixAudience={matrixAudience} />
      ) : viewMode === 'summary' ? (
        <RecordsSummaryPanel />
      ) : viewMode === 'matrix' ? (
        <RecordsMatrix
          key={refreshKey}
          farm={farmTab === 'customer' ? null : farm}
          customerOnly={farmTab === 'customer'}
          matrixViewer={matrixViewer}
        />
      ) : (
        <FarmMapPanel
          matrixAudience={matrixAudience}
          publicVetRegion={matrixAudience === 'public_vet' || matrixAudience === 'vet_union' ? publicVetRegion : null}
        />
      )}
    </div>
  );
}
