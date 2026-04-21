'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PendingGroup } from '@/app/api/titers/pending/route';

type EditState = {
  mode: 'days' | 'range';
  days: string;
  range: string;
  parity: string;
  saving: boolean;
  ok: boolean;
  err: string;
};

const RANGE_PRESETS = ['육성돈', '비육돈', '모돈', '후보돈', '자돈'];
const PARITY_PRESETS = ['후보돈', '1산', '2산', '3산', '4산이상'] as const;

export function PendingTitersPanel() {
  const searchParams = useSearchParams();
  const farmParam = (searchParams?.get('farm') ?? '').trim();

  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, any[]>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, Set<number>>>({});

  function groupKey(g: PendingGroup) {
    return `${g.farm_code}|${g.test_date}|${g.disease}`;
  }

  function loadPending() {
    if (!farmParam) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams();
    q.set('farms', farmParam);
    q.set('excludeNegative', '1');
    fetch(`/api/titers/pending?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPending();
  }, [farmParam]);

  function editFor(g: PendingGroup): EditState {
    return edits[groupKey(g)] ?? { mode: 'days', days: '', range: '', parity: '', saving: false, ok: false, err: '' };
  }

  function setEdit(g: PendingGroup, patch: Partial<EditState>) {
    setEdits(prev => ({ ...prev, [groupKey(g)]: { ...editFor(g), ...patch } }));
  }

  async function applyAge(g: PendingGroup) {
    const e = editFor(g);
    const age_days = e.mode === 'days' && e.days.trim() ? parseInt(e.days, 10) : null;
    const age_range = e.mode === 'range' && e.range.trim() ? e.range.trim() : null;

    if (age_days == null && !age_range) {
      setEdit(g, { err: '일령 또는 구간을 입력해주세요.' });
      return;
    }

    setEdit(g, { saving: true, err: '' });
    try {
      const key = groupKey(g);
      const ids = Array.from(selectedIds[key] ?? new Set<number>());
      const payload =
        ids.length > 0
          ? { ids, age_days, age_range, parity_group: e.parity.trim() || null, needs_review: false }
          : { farm_code: g.farm_code, test_date: g.test_date, disease: g.disease, age_days, age_range };

      const res = await fetch(ids.length > 0 ? '/api/titers/batch-samples' : '/api/titers/batch-age', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setEdit(g, { saving: false, ok: true });
      // 완료된 항목 제거
      setTimeout(() => {
        setGroups((prev) => prev.filter((x) => groupKey(x) !== groupKey(g)));
        window.dispatchEvent(new Event('pendingTitersUpdated'));
      }, 800);
    } catch (err) {
      setEdit(g, { saving: false, err: (err as Error).message });
    }
  }

  async function openGroup(g: PendingGroup) {
    const key = groupKey(g);
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setSelectedIds((prev) => ({ ...prev, [key]: prev[key] ?? new Set<number>() }));
    if (openRows[key]) return;
    try {
      const params = new URLSearchParams();
      params.set('farm_code', g.farm_code);
      params.set('disease', g.disease);
      params.set('from', g.test_date);
      params.set('to', g.test_date);
      // 관리자 화면이므로 scope 강제는 생략(서버에서 admin 체크)
      const res = await fetch(`/api/titers?${params.toString()}`);
      const data = await res.json();
      setOpenRows((prev) => ({ ...prev, [key]: data.records ?? [] }));
    } catch {
      setOpenRows((prev) => ({ ...prev, [key]: [] }));
    }
  }

  function toggleId(groupK: string, id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev[groupK] ?? new Set<number>());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [groupK]: next };
    });
  }

  if (!farmParam) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
        왼쪽 <span className="font-medium text-zinc-800">농장 선택</span>에서 하나 이상 선택하면, 그 농장의 일령 미입력 항체만 표시됩니다.
      </div>
    );
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
        선택한 농장 기준으로 일령 미입력 항체가 없습니다. (PRRS/MH는 표본 S/P가 모두 0.3 미만인 그룹은 제외)
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-amber-800">
          일령 미입력 항체가 검사 — 선택 농장만 ({loading ? '…' : groups.length}건)
        </span>
        <button
          type="button"
          onClick={loadPending}
          className="text-xs text-amber-600 hover:underline"
        >
          새로고침
        </button>
      </div>

      {groups.map(g => {
        const e = editFor(g);
        const key = groupKey(g);
        const rows = openRows[key] ?? [];
        const sel = selectedIds[key] ?? new Set<number>();
        const pdfRef = String(g.pdf_file_id ?? '').trim();
        return (
          <div key={key} className="rounded-md border border-amber-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="font-medium text-zinc-800">농장코드 {g.farm_code}</span>
              <span>{g.test_date}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium">{g.disease}</span>
              <span className="text-zinc-400">{g.count}마리</span>
              {g.sample_values.length > 0 && (
                <span className="text-zinc-400">
                  S/P: {g.sample_values.map(v => v?.toFixed(2)).join(', ')}
                  {g.count > 5 ? '…' : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => openGroup(g)}
                className="ml-auto rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                {openKey === key ? '개체 닫기' : '개체 선택'}
              </button>
              {pdfRef && (
                <a
                  href={`/api/pdf-ref?ref=${encodeURIComponent(pdfRef)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                  title="원본 PDF 열기"
                >
                  원본 PDF
                </a>
              )}
            </div>

            {openKey === key && (
              <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                  개체 다중 선택 후 일령/산차를 한 번에 입력할 수 있습니다. (개체번호는 중요하지 않아 UI에서 최소 표기)
                </div>
                {rows.length === 0 ? (
                  <div className="text-[11px] text-zinc-400">불러오는 중이거나 데이터가 없습니다.</div>
                ) : (
                  <div className="max-h-44 overflow-auto rounded border border-zinc-200 bg-white">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-zinc-100 text-zinc-600">
                        <tr>
                          <th className="w-10 px-2 py-1">선택</th>
                          <th className="px-2 py-1 text-left">S/P</th>
                          <th className="px-2 py-1 text-left">현재 일령</th>
                          <th className="px-2 py-1 text-left">현재 산차</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r: any) => (
                          <tr key={r.id} className="border-t border-zinc-100">
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={sel.has(r.id)}
                                onChange={() => toggleId(key, r.id)}
                              />
                            </td>
                            <td className="px-2 py-1 font-mono">{r.sp_value == null ? '—' : Number(r.sp_value).toFixed(2)}</td>
                            <td className="px-2 py-1">{r.age_days == null ? '미입력' : `${r.age_days}`}</td>
                            <td className="px-2 py-1">{r.parity_group ?? '미입력'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-1 text-[11px] text-zinc-500">
                  선택됨: {sel.size}개 (선택이 0이면 “그룹 전체 일괄”로 적용됩니다)
                </div>
              </div>
            )}

            {/* 입력 모드 전환 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEdit(g, { mode: 'days' })}
                className={`rounded px-2 py-0.5 text-xs font-medium border ${
                  e.mode === 'days' ? 'border-zinc-400 bg-zinc-100' : 'border-zinc-200 text-zinc-400'
                }`}
              >
                일령 (일)
              </button>
              <button
                type="button"
                onClick={() => setEdit(g, { mode: 'range' })}
                className={`rounded px-2 py-0.5 text-xs font-medium border ${
                  e.mode === 'range' ? 'border-zinc-400 bg-zinc-100' : 'border-zinc-200 text-zinc-400'
                }`}
              >
                구간 입력
              </button>
            </div>

            {e.mode === 'days' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={999}
                  placeholder="예: 40"
                  value={e.days}
                  onChange={ev => setEdit(g, { days: ev.target.value })}
                  className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-zinc-400">일령</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="예: 40-60 또는 육성돈"
                  value={e.range}
                  onChange={ev => setEdit(g, { range: ev.target.value })}
                  className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {RANGE_PRESETS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEdit(g, { range: p })}
                      className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">산차</span>
              <select
                value={e.parity}
                onChange={(ev) => setEdit(g, { parity: ev.target.value })}
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">(선택) 미입력</option>
                {PARITY_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyAge(g)}
                disabled={e.saving || e.ok}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {e.saving ? '저장 중…' : e.ok ? '완료 ✓' : '적용'}
              </button>
              {e.err && <span className="text-xs text-red-500">{e.err}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
