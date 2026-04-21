/**
 * 농장주 모드: 인근 양성 농장 가상 표시 (실제 DB와 무관)
 */
export type MockPositive = {
  id: string;
  lat: number;
  lng: number;
  distanceKm: number;
  disease: string;
};

function seededRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** 대략적인 destination (km, 방위 라디안) */
function offsetKm(lat: number, lng: number, distKm: number, bearingRad: number): { lat: number; lng: number } {
  const R = 6371;
  const d = distKm / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function generateMockPositives(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  diseases: string[],
  periodKey: string,
  count = 6
): MockPositive[] {
  if (!diseases.length || radiusKm <= 0) return [];
  const seed = `${centerLat.toFixed(5)}_${centerLng.toFixed(5)}_${radiusKm}_${diseases.sort().join(',')}_${periodKey}`;
  const rnd = seededRand(seed);
  const out: MockPositive[] = [];
  for (let i = 0; i < count; i++) {
    const dist = 0.3 * radiusKm + rnd() * 0.65 * radiusKm;
    const bearing = rnd() * Math.PI * 2;
    const { lat, lng } = offsetKm(centerLat, centerLng, dist, bearing);
    const disease = diseases[i % diseases.length];
    const d = haversineKm(centerLat, centerLng, lat, lng);
    out.push({
      id: `mock-${seed}-${i}`,
      lat,
      lng,
      distanceKm: Math.round(d * 10) / 10,
      disease,
    });
  }
  return out;
}

/** 대한민국 육지 대략 범위 — 전국 질병 레이어 데모용 */
const KOREA_LAT_MIN = 33.15;
const KOREA_LAT_MAX = 38.55;
const KOREA_LNG_MIN = 124.85;
const KOREA_LNG_MAX = 129.55;

/**
 * 정부·전국 뷰용 가상 ASF 발생 지점 (실제 DB·신고와 무관, 시드 고정으로 재현 가능)
 */
export function generateNationalAsfMockSites(count = 30, periodKey: string): MockPositive[] {
  const seed = `ASF_NATIONAL_${count}_${periodKey}`;
  const rnd = seededRand(seed);
  const out: MockPositive[] = [];
  for (let i = 0; i < count; i++) {
    const lat = KOREA_LAT_MIN + rnd() * (KOREA_LAT_MAX - KOREA_LAT_MIN);
    const lng = KOREA_LNG_MIN + rnd() * (KOREA_LNG_MAX - KOREA_LNG_MIN);
    out.push({
      id: `asf-nat-${i}-${seed.slice(0, 12)}`,
      lat,
      lng,
      distanceKm: 0,
      disease: 'ASF',
    });
  }
  return out;
}
