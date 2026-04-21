import type { FarmLocationRecord } from '@/lib/farm-location-types';
import type { NationalPigFarmRecord } from '@/lib/national-pig-farm-types';
import { haversineKm } from '@/lib/map-mock-nearby';

/** 큰 원부터 그려 작은 원이 위에 오도록 정렬 */
export const ASF_CONCENTRIC_CIRCLES: {
  radiusKm: number;
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
}[] = [
  { radiusKm: 10, color: '#5b21b6', fillColor: '#7c3aed', fillOpacity: 0.06, weight: 2 },
  { radiusKm: 5, color: '#0369a1', fillColor: '#0ea5e9', fillOpacity: 0.08, weight: 2 },
  { radiusKm: 3, color: '#047857', fillColor: '#14b8a6', fillOpacity: 0.1, weight: 2 },
  { radiusKm: 1, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.12, weight: 2 },
  { radiusKm: 0.5, color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.14, weight: 3 },
];

export type AsfRingBucket = {
  label: string;
  minKm: number;
  maxKm: number;
  items: { code: string; km: number; typeLabel: string }[];
};

/** 제주 포함 전국 맞춤용 고정 점 */
export const KOREA_JEJU_FIT_POINT = { lat: 33.42, lng: 126.53 };

/**
 * ASF 가상 지점 기준 10km 이내 다비·행안부 시설을 거리 구간별로 분류 (코드만 표시용)
 */
export function buildAsfRingFarmBuckets(
  centerLat: number,
  centerLng: number,
  dabiFarms: Array<FarmLocationRecord & { lat: number; lng: number }>,
  nationalFarms: NationalPigFarmRecord[] | undefined
): AsfRingBucket[] {
  type Row = { code: string; km: number; typeLabel: string };
  const rows: Row[] = [];
  for (const f of dabiFarms) {
    const km = haversineKm(centerLat, centerLng, f.lat, f.lng);
    if (km <= 10) rows.push({ code: f.farm_code, km, typeLabel: '다비' });
  }
  for (const n of nationalFarms ?? []) {
    const km = haversineKm(centerLat, centerLng, n.lat, n.lng);
    if (km <= 10) rows.push({ code: n.livestockSeq, km, typeLabel: '행안부' });
  }

  const ringDefs: { min: number; max: number; label: string }[] = [
    { min: 0, max: 0.5, label: '500m 이내' },
    { min: 0.5, max: 1, label: '500m ~ 1km' },
    { min: 1, max: 3, label: '1 ~ 3km' },
    { min: 3, max: 5, label: '3 ~ 5km' },
    { min: 5, max: 10, label: '5 ~ 10km' },
  ];

  return ringDefs.map(({ min, max, label }) => ({
    label,
    minKm: min,
    maxKm: max,
    items: rows
      .filter((r) => (min === 0 ? r.km >= 0 : r.km > min) && r.km <= max)
      .sort((a, b) => a.km - b.km),
  }));
}

/** 누적: 각 임계값 이내의 모든 농장(거리 오름차순) — "500m까지", "1km까지" … */
export const ASF_CUMULATIVE_THRESHOLDS_KM = [0.5, 1, 3, 5, 10] as const;

export type AsfCumulativeBucket = {
  label: string;
  maxKm: number;
  items: { code: string; km: number; typeLabel: string }[];
};

export function buildAsfCumulativeFarmBuckets(
  centerLat: number,
  centerLng: number,
  dabiFarms: Array<FarmLocationRecord & { lat: number; lng: number }>,
  nationalFarms: NationalPigFarmRecord[] | undefined
): AsfCumulativeBucket[] {
  type Row = { code: string; km: number; typeLabel: string };
  const rows: Row[] = [];
  for (const f of dabiFarms) {
    const km = haversineKm(centerLat, centerLng, f.lat, f.lng);
    if (km <= 10) rows.push({ code: f.farm_code, km, typeLabel: '다비' });
  }
  for (const n of nationalFarms ?? []) {
    const km = haversineKm(centerLat, centerLng, n.lat, n.lng);
    if (km <= 10) rows.push({ code: n.livestockSeq, km, typeLabel: '행안부' });
  }

  const labels: Record<number, string> = {
    0.5: '500m 이내 농장 (누적)',
    1: '1km 이내 농장 (누적)',
    3: '3km 이내 농장 (누적)',
    5: '5km 이내 농장 (누적)',
    10: '10km 이내 농장 (누적)',
  };

  return ASF_CUMULATIVE_THRESHOLDS_KM.map((maxKm) => ({
    label: labels[maxKm] ?? `${maxKm}km 이내`,
    maxKm,
    items: rows.filter((r) => r.km <= maxKm + 1e-9).sort((a, b) => a.km - b.km),
  }));
}
