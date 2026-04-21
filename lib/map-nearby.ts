import { haversineKm } from '@/lib/map-mock-nearby';

export type NearbyDabiRow = {
  kind: 'dabi';
  code: string;
  lat: number;
  lng: number;
  distanceKm: number;
};

export type NearbyNationalRow = {
  kind: 'national';
  livestockSeq: string;
  lat: number;
  lng: number;
  distanceKm: number;
};

export type NearbyRow = NearbyDabiRow | NearbyNationalRow;

export function rowsWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  dabi: Array<{ farm_code: string; lat: number; lng: number }>,
  national: Array<{ livestockSeq: string; lat: number; lng: number }>
): NearbyRow[] {
  const rows: NearbyRow[] = [];
  for (const f of dabi) {
    const d = haversineKm(centerLat, centerLng, f.lat, f.lng);
    if (d <= radiusKm) {
      rows.push({ kind: 'dabi', code: f.farm_code, lat: f.lat, lng: f.lng, distanceKm: Math.round(d * 1000) / 1000 });
    }
  }
  for (const n of national) {
    const d = haversineKm(centerLat, centerLng, n.lat, n.lng);
    if (d <= radiusKm) {
      rows.push({
        kind: 'national',
        livestockSeq: n.livestockSeq,
        lat: n.lat,
        lng: n.lng,
        distanceKm: Math.round(d * 1000) / 1000,
      });
    }
  }
  rows.sort((a, b) => a.distanceKm - b.distanceKm);
  return rows;
}

export function nearbyToCsv(rows: NearbyRow[]): string {
  const header = 'kind,code_or_seq,distance_km,lat,lng';
  const lines = rows.map((r) =>
    r.kind === 'dabi'
      ? `dabi,${r.code},${r.distanceKm},${r.lat},${r.lng}`
      : `national,${r.livestockSeq},${r.distanceKm},${r.lat},${r.lng}`
  );
  return [header, ...lines].join('\n');
}
