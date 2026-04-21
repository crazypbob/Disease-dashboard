import { FARMS } from '@/lib/farms';
import { addressMatchesChungcheong, addressMatchesGyeonggi } from '@/lib/map-region';
import { DEFAULT_VET_ASSIGNED_NAME } from '@/lib/viewer-constants';
import type { FarmCodeLocationMeta } from '@/lib/farm-location-meta-types';
import { parseSidoLabelFromAddress, sidoMatchesFilter } from '@/lib/farm-sido';

export type PublicVetDemoRegion = 'gyeonggi' | 'chungcheong';

export type MatrixScope =
  | 'default'
  | 'dabi'
  | 'gov_central'
  | 'gov_local'
  | 'public_vet'
  | 'vet_assigned'
  | 'vet_union';

/** 지도 탭 `publicVet`와 동일한 주소 규칙으로 농장코드 필터 */
export function farmCodeInPublicVetDemoRegion(
  farmCode: string,
  region: PublicVetDemoRegion,
  locMap: Map<string, FarmCodeLocationMeta>
): boolean {
  const meta = locMap.get(farmCode);
  const address = meta?.address ?? '';
  if (!address) return false;
  if (region === 'gyeonggi') {
    return addressMatchesGyeonggi(address) && !addressMatchesChungcheong(address);
  }
  return addressMatchesChungcheong(address) && !addressMatchesGyeonggi(address);
}

export function farmCodesForPublicVetRegion(
  region: PublicVetDemoRegion,
  locMap: Map<string, FarmCodeLocationMeta>
): Set<string> {
  const out = new Set<string>();
  for (const code of locMap.keys()) {
    if (farmCodeInPublicVetDemoRegion(code, region, locMap)) out.add(code);
  }
  return out;
}

function vetNameForFarm(farmCode: string, locMap: Map<string, FarmCodeLocationMeta>): string {
  const fromLoc = locMap.get(farmCode)?.vet?.trim();
  if (fromLoc && fromLoc !== '-') return fromLoc;
  const k = farmCode as keyof typeof FARMS;
  if (k in FARMS) return FARMS[k].vet?.trim() ?? '';
  return '';
}

export function farmCodesForAssignedVet(
  vetName: string,
  locMap: Map<string, FarmCodeLocationMeta>
): Set<string> {
  const target = vetName.trim() || DEFAULT_VET_ASSIGNED_NAME;
  const out = new Set<string>();
  for (const code of new Set([...locMap.keys(), ...Object.keys(FARMS)])) {
    if (vetNameForFarm(code, locMap) === target) out.add(code);
  }
  return out;
}

export function farmCodesForLocalSido(
  sidoFilter: string,
  locMap: Map<string, FarmCodeLocationMeta>
): Set<string> {
  const f = sidoFilter.trim();
  if (!f) return new Set();
  const out = new Set<string>();
  const allCodes = new Set([...locMap.keys(), ...Object.keys(FARMS)]);
  for (const code of allCodes) {
    const meta = locMap.get(code);
    const address = meta?.address ?? '';
    const label = meta?.sidoLabel ?? parseSidoLabelFromAddress(address);
    if (sidoMatchesFilter(f, label, address)) out.add(code);
  }
  return out;
}

export function collectDistinctSidoOptions(locMap: Map<string, FarmCodeLocationMeta>): string[] {
  const s = new Set<string>();
  for (const meta of locMap.values()) {
    const label = meta.sidoLabel ?? parseSidoLabelFromAddress(meta.address);
    if (label) s.add(label);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function resolveMatrixScopeFarmCodes(
  scope: MatrixScope,
  opts: {
    publicVetRegion?: PublicVetDemoRegion | null;
    localSido?: string | null;
    vetAssignedName?: string | null;
  },
  locMap: Map<string, FarmCodeLocationMeta>
): Set<string> | null {
  switch (scope) {
    case 'default':
      return null;
    case 'dabi':
      return null;
    case 'gov_central':
      return null;
    case 'gov_local': {
      const set = farmCodesForLocalSido(opts.localSido ?? '', locMap);
      return set;
    }
    case 'public_vet': {
      const r = opts.publicVetRegion;
      if (!r) return new Set();
      return farmCodesForPublicVetRegion(r, locMap);
    }
    case 'vet_assigned':
      return farmCodesForAssignedVet(opts.vetAssignedName ?? DEFAULT_VET_ASSIGNED_NAME, locMap);
    case 'vet_union': {
      const pub = opts.publicVetRegion
        ? farmCodesForPublicVetRegion(opts.publicVetRegion, locMap)
        : new Set<string>();
      const assigned = farmCodesForAssignedVet(
        opts.vetAssignedName ?? DEFAULT_VET_ASSIGNED_NAME,
        locMap
      );
      return new Set([...pub, ...assigned]);
    }
    default:
      return null;
  }
}
