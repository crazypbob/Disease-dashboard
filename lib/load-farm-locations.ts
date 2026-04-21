import { readFile } from 'fs/promises';
import path from 'path';
import type { FarmLocationsFile } from '@/lib/farm-location-types';
import { parseSidoLabelFromAddress } from '@/lib/farm-sido';
import type { FarmCodeLocationMeta } from '@/lib/farm-location-meta-types';

export type { FarmCodeLocationMeta } from '@/lib/farm-location-meta-types';

let cache: Map<string, FarmCodeLocationMeta> | null = null;

export async function loadFarmCodeLocationMap(): Promise<Map<string, FarmCodeLocationMeta>> {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), 'public', 'data', 'farm-locations.json');
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as FarmLocationsFile;
  const map = new Map<string, FarmCodeLocationMeta>();
  for (const f of data.farms ?? []) {
    const address = f.address?.trim() ?? '';
    map.set(f.farm_code, {
      address,
      vet: f.vet?.trim() ?? '',
      sidoLabel: parseSidoLabelFromAddress(address),
    });
  }
  cache = map;
  return map;
}

export function clearFarmLocationCacheForTests() {
  cache = null;
}
