'use client';

import type { FarmLocationsFile } from '@/lib/farm-location-types';
import type { FarmCodeLocationMeta } from '@/lib/farm-location-meta-types';
import { parseSidoLabelFromAddress } from '@/lib/farm-sido';
import { collectDistinctSidoOptions } from '@/lib/matrix-region-filters';

export async function fetchDistinctSidoLabelsForMatrix(): Promise<string[]> {
  const res = await fetch('/data/farm-locations.json');
  if (!res.ok) return [];
  const j = (await res.json()) as FarmLocationsFile;
  const locMap = new Map<string, FarmCodeLocationMeta>();
  for (const f of j.farms ?? []) {
    const address = f.address?.trim() ?? '';
    locMap.set(f.farm_code, {
      address,
      vet: f.vet?.trim() ?? '',
      sidoLabel: parseSidoLabelFromAddress(address),
    });
  }
  return collectDistinctSidoOptions(locMap);
}
