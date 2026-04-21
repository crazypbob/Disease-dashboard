'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useState } from 'react';
import { FARMS, FARM_GROUPS } from '@/lib/farms';
import { farmDisplayLabel } from '@/lib/farm-display';
import { useFarmAnonymize } from '@/hooks/useFarmAnonymize';

type FarmSidebarProps = {
  /** 표시 가능한 농장코드 제한(없으면 전체) */
  allowedFarmCodes?: string[] | null;
  /** "전체" 버튼을 숨기고 최소 선택만 강제 */
  hideAllOption?: boolean;
  /** 농장주 등: 그룹/선택 버튼 없이 단순 리스트만 */
  simpleListOnly?: boolean;
  /** 담당 수의사 이름 선택(데모) */
  vetSelector?: {
    label: string;
    value: string;
    options: string[];
    onChange: (name: string) => void;
  } | null;
};

function parseFarmParam(param: string | null): Set<string> {
  if (!param?.trim()) return new Set();
  return new Set(param.split(',').map((s) => s.trim()).filter(Boolean));
}

export function FarmSidebar(_props: FarmSidebarProps) {
  const { allowedFarmCodes, hideAllOption, vetSelector, simpleListOnly } = _props;
  const { anonymized, toggle } = useFarmAnonymize();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const farmParam = searchParams.get('farm');
  const selectedFarms = parseFarmParam(farmParam);
  const isAll = selectedFarms.size === 0;

  const allowedSet = allowedFarmCodes?.length ? new Set(allowedFarmCodes) : null;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(FARM_GROUPS));

  const updateFarmParam = useCallback(
    (farms: string[]) => {
      const params = new URLSearchParams(searchParams);
      if (farms.length === 0) {
        params.delete('farm');
      } else {
        params.set('farm', farms.join(','));
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleFarm = (code: string) => {
    const next = new Set(selectedFarms);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    updateFarmParam([...next]);
  };

  const selectGroup = (group: string) => {
    const codes = Object.entries(FARMS)
      .filter(([, f]) => f.group === group)
      .map(([c]) => c);
    updateFarmParam(codes);
  };

  const simpleCodes = allowedFarmCodes?.length ? allowedFarmCodes : Object.keys(FARMS);
  const visibleCodes = simpleCodes.filter((c) => !allowedSet || allowedSet.has(c));

  const farmsByGroup = FARM_GROUPS.reduce(
    (acc, group) => {
      acc[group] = Object.entries(FARMS).filter(([code, f]) => {
        if (f.group !== group) return false;
        if (allowedSet && !allowedSet.has(code)) return false;
        return true;
      });
      return acc;
    },
    {} as Record<string, [string, (typeof FARMS)[keyof typeof FARMS]][]>
  );

  return (
    <div className="flex flex-col p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-zinc-700">농장 선택</span>
        <button
          type="button"
          onClick={toggle}
          title="특허·자료 공개용: 농장명 대신 DB 번호(예: 1001)만 표시. 매트릭스 행과 동일하게 적용됩니다."
          aria-pressed={anonymized}
          className={`shrink-0 rounded border px-2 py-1 text-[11px] font-medium leading-tight ${
            anonymized
              ? 'border-blue-600 bg-blue-50 text-blue-900'
              : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {anonymized ? '코드 표시 중' : '코드로 표시'}
        </button>
      </div>
      {vetSelector && (
        <div className="mb-2 rounded border border-zinc-200 bg-white p-2">
          <div className="mb-1 text-xs font-medium text-zinc-600">{vetSelector.label}</div>
          <select
            value={vetSelector.value}
            onChange={(e) => vetSelector.onChange(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800"
          >
            {vetSelector.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )}
      {!hideAllOption && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateFarmParam([])}
            className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
              isAll
                ? 'bg-emerald-700 text-white'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
            }`}
            title="전체 보기(모든 농장)"
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => updateFarmParam([])}
            className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
              isAll ? 'bg-zinc-100 text-zinc-500' : 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
            title="선택 해제(전체 보기)"
          >
            선택해제
          </button>
        </div>
      )}
      {simpleListOnly ? (
        <div className="flex flex-wrap gap-1">
          {visibleCodes
            .map((code) => {
              const sel = isAll || selectedFarms.has(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleFarm(code)}
                  className={`rounded px-2 py-1 text-sm ${
                    sel ? 'bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {farmDisplayLabel(code, anonymized)}
                </button>
              );
            })}
        </div>
      ) : (
        <>
          {FARM_GROUPS.map((group) => (
            <div key={group} className="mb-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm font-medium hover:bg-zinc-100"
                >
                  <span>{expandedGroups.has(group) ? '−' : '+'}</span>
                  {group}
                </button>
                <button
                  type="button"
                  onClick={() => selectGroup(group)}
                  className="rounded px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  title={`${group}만 보기`}
                >
                  선택
                </button>
              </div>
              {expandedGroups.has(group) && (
                <div className="ml-3 mt-0.5 flex flex-wrap gap-1">
                  {farmsByGroup[group]?.map(([code]) => {
                    const sel = isAll || selectedFarms.has(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleFarm(code)}
                        className={`rounded px-2 py-1 text-sm ${
                          sel ? 'bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                        {farmDisplayLabel(code, anonymized)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
