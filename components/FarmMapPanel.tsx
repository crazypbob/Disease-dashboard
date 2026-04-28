'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FARMS } from '@/lib/farms';
import type { FarmLocationRecord, FarmLocationsFile } from '@/lib/farm-location-types';
import type { NationalPigFarmRecord, NationalPigFarmsFile } from '@/lib/national-pig-farm-types';
import {
  addressMatchesChungcheong,
  addressMatchesGyeonggi,
  nationalSidoMatchesChungcheong,
  nationalSidoMatchesGyeonggi,
} from '@/lib/map-region';
import {
  generateMockPositives,
  generateNationalAsfMockSites,
  haversineKm,
  type MockPositive,
} from '@/lib/map-mock-nearby';
import { nearbyToCsv, rowsWithinRadius, type NearbyRow } from '@/lib/map-nearby';
import {
  ASF_CONCENTRIC_CIRCLES,
  buildAsfCumulativeFarmBuckets,
  KOREA_JEJU_FIT_POINT,
} from '@/lib/map-asf-rings';
import { DEFAULT_VET_ASSIGNED_NAME } from '@/lib/viewer-constants';

const PROBE_RADIUS_KM_STEPS = [0.5, 1, 2, 3, 5] as const;

/** JSON에 없는 다비 시설 (데모 기준점용) */
const EXTRA_LOCATIONS: FarmLocationRecord[] = [
  {
    farm_code: 'DB9001',
    name: '다비연구소',
    vet: '-',
    address: '경기 이천시 마장면 (대표)',
    lat: 37.28,
    lng: 127.65,
    approximate: true,
  },
];

const DISEASE_OPTIONS = ['PRRS', 'PED', 'FMD', 'ASF'] as const;
const PERIOD_OPTIONS = [
  { key: '3m', label: '3개월 내', months: 3 },
  { key: '6m', label: '6개월 내', months: 6 },
  { key: '1y', label: '1년 내', months: 12 },
] as const;

export type MapRole = 'government' | 'vet' | 'publicVet' | 'farmer';

/** 한반도+제주까지 팬 가능 (남쪽·서쪽 여유) */
const KOREA_VIEW_BOUNDS: L.LatLngBoundsExpression = [
  [30.8, 123.5],
  [39.25, 132.8],
];

function farmLocationKey(f: FarmLocationRecord & { lat: number; lng: number }) {
  return `${f.farm_code}|${f.lat}|${f.lng}`;
}

function dedupeFarmsByGeoKey(list: Array<FarmLocationRecord & { lat: number; lng: number }>) {
  const seen = new Set<string>();
  const out: Array<FarmLocationRecord & { lat: number; lng: number }> = [];
  for (const f of list) {
    const k = farmLocationKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function fixLeafletIcons() {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

/** 역할·권역·데이터 로드 시에만 맞춤(반경·질병·기간·가상 양성 변경 시 줌 유지) */
function FitBounds({
  points,
  boundsKey,
}: {
  points: Array<{ lat: number; lng: number }>;
  boundsKey: string;
}) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;
  useEffect(() => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 10);
      return;
    }
    const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 11 });
  }, [map, boundsKey]);
  return null;
}

/** 가상 ASF 지점 선택 시 10km 반경이 보이도록 맞춤 (전역 FitBounds와 배타) */
function FitToAsfRings({
  lat,
  lng,
  ringKey,
}: {
  lat: number;
  lng: number;
  ringKey: string;
}) {
  const map = useMap();
  useEffect(() => {
    const cos = Math.cos((lat * Math.PI) / 180);
    const dLat = 10.8 / 111;
    const dLng = 10.8 / (111 * Math.max(0.35, cos));
    map.fitBounds(
      [
        [lat - dLat, lng - dLng],
        [lat + dLat, lng + dLng],
      ],
      { padding: [32, 32], maxZoom: 11, animate: true }
    );
  }, [map, lat, lng, ringKey]);
  return null;
}

/** 사용자 지정 지점 기준 5km 반경이 보이도록 맞춤 */
function FitToProbeRings({
  lat,
  lng,
  ringKey,
  maxKm = 5,
}: {
  lat: number;
  lng: number;
  ringKey: string;
  maxKm?: number;
}) {
  const map = useMap();
  useEffect(() => {
    const cos = Math.cos((lat * Math.PI) / 180);
    const pad = Math.max(1.3, maxKm * 1.12);
    const dLat = pad / 111;
    const dLng = pad / (111 * Math.max(0.35, cos));
    map.fitBounds(
      [
        [lat - dLat, lng - dLng],
        [lat + dLat, lng + dLng],
      ],
      { padding: [32, 32], maxZoom: 12, animate: true }
    );
  }, [map, lat, lng, ringKey, maxKm]);
  return null;
}

function MapClickProbe({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (!enabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function NationalFarmCircleMarker({
  n,
  role,
  onGovernmentSelectNational,
}: {
  n: NationalPigFarmRecord;
  role: MapRole;
  onGovernmentSelectNational?: (n: NationalPigFarmRecord) => void;
}) {
  const map = useMap();
  const eventHandlers =
    role === 'government' && onGovernmentSelectNational
      ? {
          click: () => {
            onGovernmentSelectNational(n);
            map.setView([n.lat, n.lng], map.getZoom(), { animate: true });
          },
        }
      : undefined;

  return (
    <CircleMarker
      center={[n.lat, n.lng]}
      radius={4}
      eventHandlers={eventHandlers}
      pathOptions={{
        color: '#475569',
        weight: 1,
        fillColor: '#94a3b8',
        fillOpacity: 0.45,
      }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold">축산일련번호 {n.livestockSeq}</div>
          {n.sido && <div className="text-zinc-600">{n.sido}</div>}
          <div className="text-xs text-zinc-500">
            {role === 'government'
              ? '클릭 시 이 지점 기준 반경·인근 목록·가상 양성'
              : '행안부 기준 전국 레이어'}
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function DabiFarmMarker({
  farm,
  role,
  onPublicVetSelect,
  onGovernmentSelect,
  onSelectAsBaseFarm,
}: {
  farm: FarmLocationRecord & { lat: number; lng: number };
  role: MapRole;
  onPublicVetSelect?: (farm: FarmLocationRecord & { lat: number; lng: number }) => void;
  onGovernmentSelect?: (farm: FarmLocationRecord & { lat: number; lng: number }) => void;
  /** 농장주·수의사: 클릭한 농장을 기준으로 상단 거리·반경 데모에 반영 */
  onSelectAsBaseFarm?: (farm: FarmLocationRecord & { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const eventHandlers =
    role === 'publicVet' && onPublicVetSelect
      ? {
          click: () => {
            onPublicVetSelect(farm);
            map.setView([farm.lat, farm.lng], map.getZoom(), { animate: true });
          },
        }
      : role === 'government' && onGovernmentSelect
        ? {
            click: () => {
              onGovernmentSelect(farm);
              map.setView([farm.lat, farm.lng], map.getZoom(), { animate: true });
            },
          }
        : (role === 'farmer' || role === 'vet') && onSelectAsBaseFarm
          ? {
              click: () => {
                onSelectAsBaseFarm(farm);
                map.setView([farm.lat, farm.lng], map.getZoom(), { animate: true });
              },
            }
          : undefined;

  return (
    <Marker position={[farm.lat, farm.lng]} eventHandlers={eventHandlers}>
      <Popup>
        <div className="text-sm">
          <div className="font-semibold">{farm.farm_code}</div>
          {role === 'vet' && farm.vet && <div className="text-zinc-700">{farm.vet}</div>}
          {farm.approximate && <div className="text-amber-700">대략 좌표</div>}
          {role === 'publicVet' && (
            <div className="text-xs text-zinc-500">클릭 시 이 농장 기준 반경·가상 양성</div>
          )}
          {role === 'government' && (
            <div className="text-xs text-zinc-500">클릭 시 기준·인근 목록·가상 양성</div>
          )}
          {(role === 'farmer' || role === 'vet') && (
            <div className="text-xs text-zinc-500">클릭 시 이 농장을 기준으로 표시</div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

const DEFAULT_RADIUS_STEPS = [1, 3, 5, 10] as const;

function CompactDemoFilters({
  farmRow,
  filtersDisabled,
  mockPositives,
  nationalAsfCount = 0,
  radiusKm,
  setRadiusKm,
  radiusSteps = DEFAULT_RADIUS_STEPS,
  diseases,
  toggleDisease,
  periodKey,
  setPeriodKey,
}: {
  farmRow: ReactNode;
  filtersDisabled: boolean;
  mockPositives: MockPositive[];
  /** 정부 전국 ASF 데모 레이어 개수 */
  nationalAsfCount?: number;
  radiusKm: number;
  setRadiusKm: (v: number) => void;
  radiusSteps?: readonly number[];
  diseases: Set<string>;
  toggleDisease: (d: string) => void;
  periodKey: (typeof PERIOD_OPTIONS)[number]['key'];
  setPeriodKey: (v: (typeof PERIOD_OPTIONS)[number]['key']) => void;
}) {
  const btnSm = 'rounded px-2 py-0.5 text-xs font-medium disabled:opacity-40';
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{farmRow}</div>
      <div className="mt-1.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">반경</span>
          {radiusSteps.map((km) => (
            <button
              key={km}
              type="button"
              disabled={filtersDisabled}
              onClick={() => setRadiusKm(km)}
              className={`${btnSm} ${
                radiusKm === km ? 'bg-blue-700 text-white' : 'border border-zinc-300 bg-white text-zinc-700'
              }`}
            >
              {km < 1 ? `${km * 1000} m` : `${km} km`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">질병</span>
          {DISEASE_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              disabled={filtersDisabled}
              onClick={() => toggleDisease(d)}
              className={`${btnSm} ${
                diseases.has(d) ? 'bg-rose-700 text-white' : 'border border-zinc-300 bg-white text-zinc-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">기간</span>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={filtersDisabled}
              onClick={() => setPeriodKey(p.key)}
              className={`${btnSm} ${
                periodKey === p.key ? 'bg-violet-700 text-white' : 'border border-zinc-300 bg-white text-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {(mockPositives.length > 0 || nationalAsfCount > 0) && (
          <div className="max-h-[2.75rem] min-h-[1.25rem] min-w-[10rem] max-w-md flex-1 overflow-y-auto border-l border-zinc-200 pl-2 text-[10px] leading-tight text-zinc-600">
            {nationalAsfCount > 0 && (
              <span className="mr-2 font-semibold text-red-800">
                전국 ASF(가상) {nationalAsfCount}곳
              </span>
            )}
            {mockPositives.length > 0 && (
              <>
                <span className="font-semibold text-zinc-500">반경 내 가상 양성 </span>
                {mockPositives.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 ? ' · ' : ''}
                    {m.disease} {m.distanceKm}km
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FarmMapPanel({
  matrixAudience,
  publicVetRegion: publicVetRegionProp,
}: {
  matrixAudience: import('@/lib/matrix-region-filters').MatrixScope;
  publicVetRegion: 'gyeonggi' | 'chungcheong' | null;
}) {
  const [data, setData] = useState<FarmLocationsFile | null>(null);
  const [national, setNational] = useState<NationalPigFarmsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mappedRole: MapRole =
    matrixAudience === 'gov_central' || matrixAudience === 'gov_local'
      ? 'government'
      : matrixAudience === 'dabi'
        ? 'government'
      : matrixAudience === 'public_vet'
        ? 'publicVet'
        : matrixAudience === 'vet_assigned'
          ? 'vet'
          : matrixAudience === 'vet_union'
            ? 'publicVet'
            : 'farmer';

  const [role, setRole] = useState<MapRole>(mappedRole);
  const [publicVetRegion, setPublicVetRegion] = useState<'gyeonggi' | 'chungcheong' | null>(publicVetRegionProp);
  const [baseFarmKey, setBaseFarmKey] = useState('DB9001|37.28|127.65');
  const [publicVetFocusKey, setPublicVetFocusKey] = useState<string | null>(null);
  const [govFocusKey, setGovFocusKey] = useState<string | null>(null);
  /** 행안부 점 클릭 시 기준(다비와 동일하게 반경·목록·가상 양성) */
  const [govNationalAnchor, setGovNationalAnchor] = useState<{
    lat: number;
    lng: number;
    livestockSeq: string;
  } | null>(null);
  const [govRadiusKm, setGovRadiusKm] = useState<0.5 | 1 | 3 | 5 | 10>(3);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [diseases, setDiseases] = useState<Set<string>>(new Set(['PRRS']));
  const [periodKey, setPeriodKey] = useState<(typeof PERIOD_OPTIONS)[number]['key']>('3m');
  /** 가상 ASF 빨간 점 클릭 시 동심원·우측 목록 */
  const [selectedAsfSite, setSelectedAsfSite] = useState<{
    id: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [probePoint, setProbePoint] = useState<{
    id: string;
    lat: number;
    lng: number;
    label: string;
    source: 'search' | 'click';
  } | null>(null);
  const [probeQuery, setProbeQuery] = useState('');
  const [probeSearching, setProbeSearching] = useState(false);
  const [probeSearchError, setProbeSearchError] = useState<string | null>(null);
  const [probeSearchNote, setProbeSearchNote] = useState<string | null>(null);
  const [probeSearchResults, setProbeSearchResults] = useState<
    Array<{ label: string; lat: number; lng: number; exact?: boolean; houseNumber?: string | null }>
  >([]);

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  useEffect(() => {
    setRole(mappedRole);
    setPublicVetFocusKey(null);
    setGovFocusKey(null);
    setGovNationalAnchor(null);
    setSelectedAsfSite(null);
    setProbePoint(null);
    setProbeSearchResults([]);
    setProbeSearchError(null);
    setProbeSearchNote(null);
    if (mappedRole === 'publicVet' && !publicVetRegionProp) setPublicVetRegion('gyeonggi');
    if (mappedRole !== 'publicVet') setPublicVetRegion(null);
  }, [mappedRole, publicVetRegionProp]);

  useEffect(() => {
    setPublicVetRegion(publicVetRegionProp);
  }, [publicVetRegionProp]);

  useEffect(() => {
    if (!diseases.has('ASF')) setSelectedAsfSite(null);
  }, [diseases]);

  useEffect(() => {
    fetch('/data/farm-locations.json')
      .then((r) => {
        if (!r.ok) throw new Error('farm-locations.json 로드 실패');
        return r.json();
      })
      .then((j: FarmLocationsFile) => setData(j))
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  useEffect(() => {
    fetch('/data/national-pig-farms.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: NationalPigFarmsFile | null) => (j?.farms ? setNational(j) : null))
      .catch(() => {});
  }, []);

  const allFarms = useMemo(() => {
    const base = data?.farms ?? [];
    const merged = [...base];
    for (const ex of EXTRA_LOCATIONS) {
      if (
        ex.lat != null &&
        ex.lng != null &&
        !merged.some((m) => m.farm_code === ex.farm_code && m.lat === ex.lat && m.lng === ex.lng)
      ) {
        merged.push(ex);
      }
    }
    return merged;
  }, [data]);

  useEffect(() => {
    setPublicVetFocusKey(null);
  }, [publicVetRegion]);

  const filtered = useMemo(() => {
    let list = allFarms.filter((f) => f.lat != null && f.lng != null) as Array<
      FarmLocationRecord & { lat: number; lng: number }
    >;

    if (role === 'government') {
      return list;
    }
    if (role === 'vet') {
      return list.filter((f) => {
        if (f.vet === DEFAULT_VET_ASSIGNED_NAME) return true;
        const k = f.farm_code as keyof typeof FARMS;
        return k in FARMS && FARMS[k].vet === DEFAULT_VET_ASSIGNED_NAME;
      });
    }
    if (role === 'publicVet') {
      if (publicVetRegion === 'gyeonggi') {
        return list.filter(
          (f) => addressMatchesGyeonggi(f.address) && !addressMatchesChungcheong(f.address)
        );
      }
      if (publicVetRegion === 'chungcheong') {
        return list.filter(
          (f) => addressMatchesChungcheong(f.address) && !addressMatchesGyeonggi(f.address)
        );
      }
      return [];
    }
    if (role === 'farmer') {
      return list;
    }
    return list;
  }, [allFarms, role, publicVetRegion]);

  const dabiDedupedForMap = useMemo(() => dedupeFarmsByGeoKey(filtered), [filtered]);

  const allFarmsWithCoordsDeduped = useMemo(
    () =>
      dedupeFarmsByGeoKey(
        allFarms.filter((f): f is FarmLocationRecord & { lat: number; lng: number } =>
          f.lat != null && f.lng != null
        )
      ),
    [allFarms]
  );

  const vetSelectOptions = useMemo(() => dedupeFarmsByGeoKey(filtered), [filtered]);

  useEffect(() => {
    if (allFarms.length === 0) return;
    const withCoords = allFarms.filter(
      (f): f is FarmLocationRecord & { lat: number; lng: number } =>
        f.lat != null && f.lng != null
    );
    if (role === 'vet') {
      if (filtered.length === 0) return;
      const ok = filtered.some((f) => farmLocationKey(f) === baseFarmKey);
      if (!ok) setBaseFarmKey(farmLocationKey(filtered[0]));
      return;
    }
    if (role === 'farmer') {
      const valid = withCoords.some((f) => farmLocationKey(f) === baseFarmKey);
      if (!valid && withCoords[0]) setBaseFarmKey(farmLocationKey(withCoords[0]));
    }
  }, [allFarms, baseFarmKey, role, filtered]);

  const showNationalLayer =
    role === 'government' || role === 'farmer' || (role === 'publicVet' && publicVetRegion != null);

  const baseFarm = useMemo(() => {
    const withCoords = allFarms.filter(
      (f): f is FarmLocationRecord & { lat: number; lng: number } =>
        f.lat != null && f.lng != null
    );
    const byKey = withCoords.find((f) => farmLocationKey(f) === baseFarmKey);
    if (byKey) return byKey;
    const code = baseFarmKey.split('|')[0];
    return withCoords.find((f) => f.farm_code === code) ?? null;
  }, [allFarms, baseFarmKey]);

  const dabiForMap = useMemo(() => {
    if (role !== 'farmer' || !baseFarm) return dabiDedupedForMap;
    const bk = farmLocationKey(baseFarm);
    return dabiDedupedForMap.filter((f) => {
      if (farmLocationKey(f) === bk) return true;
      return haversineKm(baseFarm.lat, baseFarm.lng, f.lat, f.lng) <= radiusKm;
    });
  }, [dabiDedupedForMap, role, baseFarm, radiusKm]);

  const nationalFarmsForMap = useMemo(() => {
    if (!national?.farms?.length || !showNationalLayer) return [];
    if (role === 'government') return national.farms;
    if (role === 'farmer' && baseFarm) {
      return national.farms.filter(
        (n) => haversineKm(baseFarm.lat, baseFarm.lng, n.lat, n.lng) <= radiusKm
      );
    }
    if (role === 'publicVet') {
      if (publicVetRegion === 'gyeonggi') {
        return national.farms.filter(
          (n) => nationalSidoMatchesGyeonggi(n.sido) && !nationalSidoMatchesChungcheong(n.sido)
        );
      }
      if (publicVetRegion === 'chungcheong') {
        return national.farms.filter(
          (n) => nationalSidoMatchesChungcheong(n.sido) && !nationalSidoMatchesGyeonggi(n.sido)
        );
      }
    }
    return [];
  }, [national, showNationalLayer, role, baseFarm, radiusKm, publicVetRegion]);

  const govFocusFarm = useMemo(() => {
    if (!govFocusKey) return null;
    return dabiDedupedForMap.find((f) => farmLocationKey(f) === govFocusKey) ?? null;
  }, [govFocusKey, dabiDedupedForMap]);

  const govAnchorCoords = useMemo(() => {
    if (govFocusFarm) return { lat: govFocusFarm.lat, lng: govFocusFarm.lng };
    if (govNationalAnchor) return { lat: govNationalAnchor.lat, lng: govNationalAnchor.lng };
    return null;
  }, [govFocusFarm, govNationalAnchor]);

  const govNearbyRows = useMemo((): NearbyRow[] => {
    if (role !== 'government' || !govAnchorCoords) return [];
    const nat = national?.farms ?? [];
    return rowsWithinRadius(
      govAnchorCoords.lat,
      govAnchorCoords.lng,
      govRadiusKm,
      dabiDedupedForMap.map((f) => ({ farm_code: f.farm_code, lat: f.lat, lng: f.lng })),
      nat.map((n) => ({ livestockSeq: n.livestockSeq, lat: n.lat, lng: n.lng }))
    );
  }, [role, govAnchorCoords, govRadiusKm, dabiDedupedForMap, national]);

  const probeNearbyRows = useMemo((): NearbyRow[] => {
    if (!probePoint) return [];
    return rowsWithinRadius(
      probePoint.lat,
      probePoint.lng,
      5,
      dabiForMap.map((f) => ({ farm_code: f.farm_code, lat: f.lat, lng: f.lng })),
      nationalFarmsForMap.map((n) => ({ livestockSeq: n.livestockSeq, lat: n.lat, lng: n.lng }))
    );
  }, [probePoint, dabiForMap, nationalFarmsForMap]);

  const probeCumulativeBuckets = useMemo(() => {
    if (!probePoint) return [];
    type Row = { code: string; km: number; typeLabel: string };
    const rows: Row[] = [];
    for (const f of dabiForMap) {
      const km = haversineKm(probePoint.lat, probePoint.lng, f.lat, f.lng);
      if (km <= 5) rows.push({ code: f.farm_code, km, typeLabel: '다비' });
    }
    for (const n of nationalFarmsForMap) {
      const km = haversineKm(probePoint.lat, probePoint.lng, n.lat, n.lng);
      if (km <= 5) rows.push({ code: n.livestockSeq, km, typeLabel: '행안부' });
    }
    rows.sort((a, b) => a.km - b.km);

    const labels: Record<number, string> = {
      0.5: '500m 이내 (누적)',
      1: '1km 이내 (누적)',
      2: '2km 이내 (누적)',
      3: '3km 이내 (누적)',
      5: '5km 이내 (누적)',
    };
    return PROBE_RADIUS_KM_STEPS.map((maxKm) => ({
      label: labels[maxKm] ?? `${maxKm}km 이내`,
      maxKm,
      items: rows.filter((r) => r.km <= maxKm + 1e-9),
    }));
  }, [probePoint, dabiForMap, nationalFarmsForMap]);

  const govMockAnchorFarm = useMemo((): (FarmLocationRecord & { lat: number; lng: number }) | null => {
    if (govFocusFarm) return govFocusFarm;
    if (govNationalAnchor) {
      return {
        farm_code: `HA${govNationalAnchor.livestockSeq}`,
        name: '',
        vet: '-',
        address: '',
        lat: govNationalAnchor.lat,
        lng: govNationalAnchor.lng,
        approximate: false,
      };
    }
    return null;
  }, [govFocusFarm, govNationalAnchor]);

  const publicVetFocusFarm = useMemo(() => {
    if (!publicVetFocusKey) return null;
    return (
      filtered.find((f) => farmLocationKey(f) === publicVetFocusKey) ??
      null
    );
  }, [filtered, publicVetFocusKey]);

  const mockAnchorFarm = useMemo(() => {
    if (role === 'farmer' || role === 'vet') return baseFarm;
    if (role === 'publicVet') return publicVetFocusFarm;
    if (role === 'government') return govMockAnchorFarm;
    return null;
  }, [role, baseFarm, publicVetFocusFarm, govMockAnchorFarm]);

  const showRadiusDemo =
    role === 'farmer' ||
    role === 'vet' ||
    (role === 'publicVet' && publicVetFocusKey != null) ||
    (role === 'government' && govAnchorCoords != null);

  const periodMonths = PERIOD_OPTIONS.find((p) => p.key === periodKey)?.months ?? 3;

  const diseaseKey = useMemo(() => [...diseases].sort().join(','), [diseases]);

  /** 반경 데모는 ASF 제외 — ASF는 전국 레이어로만 표시 */
  const diseasesForLocalMock = useMemo(
    () => [...diseases].filter((d) => d !== 'ASF'),
    [diseaseKey, diseases]
  );

  /** ASF 선택 시 전국 가상 발생 지점(시드 동일) — 정부·공수의 지도·전 탭 최근접 거리용 */
  const nationalAsfSites = useMemo(() => {
    if (!diseases.has('ASF')) return [];
    return generateNationalAsfMockSites(30, periodKey);
  }, [diseases, periodKey]);

  const mockPositives = useMemo(() => {
    if (!mockAnchorFarm || diseasesForLocalMock.length === 0) return [];
    if (!(role === 'farmer' || role === 'vet' || role === 'publicVet' || role === 'government')) return [];
    const fk = farmLocationKey(mockAnchorFarm);
    const r = role === 'government' ? govRadiusKm : radiusKm;
    return generateMockPositives(
      mockAnchorFarm.lat,
      mockAnchorFarm.lng,
      r,
      diseasesForLocalMock,
      `${role}_${fk}_${periodKey}_${periodMonths}m`,
      7
    );
  }, [mockAnchorFarm, radiusKm, govRadiusKm, diseasesForLocalMock, periodKey, periodMonths, role]);

  const centerDefault: [number, number] = [36.5, 127.9];
  const mapCenter: [number, number] =
    dabiForMap.length > 0
      ? [dabiForMap[0].lat!, dabiForMap[0].lng!]
      : baseFarm
        ? [baseFarm.lat!, baseFarm.lng!]
        : centerDefault;

  /** 가상 양성 좌표 제외 — 필터 버튼만으로는 줌·맞춤 범위 불변 */
  const fitPoints = useMemo(() => {
    const pts = dabiForMap.map((f) => ({ lat: f.lat!, lng: f.lng! }));
    nationalFarmsForMap.forEach((n) => pts.push({ lat: n.lat, lng: n.lng }));
    nationalAsfSites.forEach((m) => pts.push({ lat: m.lat, lng: m.lng }));
    if (diseases.has('ASF') && nationalAsfSites.length > 0) {
      pts.push(KOREA_JEJU_FIT_POINT);
    }
    return pts;
  }, [dabiForMap, nationalFarmsForMap, nationalAsfSites, diseases]);

  const fitBoundsKey = useMemo(
    () =>
      `${role}|${publicVetRegion ?? ''}|${data?.generatedAt ?? ''}|${national?.rowCount ?? 0}|${filtered.length}|${showNationalLayer}|${baseFarmKey}|${diseaseKey}|asf:${nationalAsfSites.length}`,
    [
      role,
      publicVetRegion,
      data?.generatedAt,
      national?.rowCount,
      filtered.length,
      showNationalLayer,
      baseFarmKey,
      diseaseKey,
      nationalAsfSites.length,
    ]
  );

  /** 우측 ASF 패널: 공수의는 권역 필터된 다비·행안부만 집계 */
  const nationalForAsfBuckets = useMemo((): NationalPigFarmRecord[] | undefined => {
    if (!national?.farms?.length) return undefined;
    if (role === 'publicVet') {
      return nationalFarmsForMap.length > 0 ? nationalFarmsForMap : undefined;
    }
    return national.farms;
  }, [role, national?.farms, nationalFarmsForMap]);

  const asfCumulativeBuckets = useMemo(() => {
    if (!selectedAsfSite) return [];
    return buildAsfCumulativeFarmBuckets(
      selectedAsfSite.lat,
      selectedAsfSite.lng,
      dabiDedupedForMap,
      nationalForAsfBuckets
    );
  }, [selectedAsfSite, dabiDedupedForMap, nationalForAsfBuckets]);

  const distanceRefFarm = useMemo((): (FarmLocationRecord & { lat: number; lng: number }) | null => {
    if (role === 'government') return govMockAnchorFarm;
    if (role === 'publicVet') return publicVetFocusFarm;
    if (role === 'farmer' || role === 'vet') return baseFarm;
    return null;
  }, [role, govMockAnchorFarm, publicVetFocusFarm, baseFarm]);

  const nearestOutbreakBanner = useMemo(() => {
    if (diseases.size === 0) {
      return { kind: 'empty' as const };
    }
    if (!distanceRefFarm) {
      if (role === 'government') {
        return {
          kind: 'hint' as const,
          text: '다비 또는 행안부 점을 선택하면, 가장 가까운 가상 발생 지점까지 거리가 여기에 표시됩니다.',
        };
      }
      if (role === 'publicVet') {
        return {
          kind: 'hint' as const,
          text: '권역을 고른 뒤 지도에서 다비 마커를 클릭해 기준을 잡으면, 가장 가까운 가상 발생 지점까지 거리가 표시됩니다.',
        };
      }
      return { kind: 'hint' as const, text: '기준 농장 좌표를 확인할 수 없습니다.' };
    }
    if (diseases.has('ASF') && nationalAsfSites.length > 0) {
      let minKm = Infinity;
      for (const s of nationalAsfSites) {
        const d = haversineKm(distanceRefFarm.lat, distanceRefFarm.lng, s.lat, s.lng);
        if (d < minKm) minKm = d;
      }
      return {
        kind: 'distance' as const,
        text: `가장 가까운 가상 ASF 발생점까지 약 ${minKm.toFixed(2)} km (데모 좌표)`,
      };
    }
    if (mockPositives.length > 0) {
      let minKm = Infinity;
      let dis = mockPositives[0]?.disease ?? '';
      for (const m of mockPositives) {
        const d = haversineKm(distanceRefFarm.lat, distanceRefFarm.lng, m.lat, m.lng);
        if (d < minKm) {
          minKm = d;
          dis = m.disease;
        }
      }
      return {
        kind: 'distance' as const,
        text: `가장 가까운 가상 양성(${dis})까지 약 ${minKm.toFixed(2)} km (데모)`,
      };
    }
    return {
      kind: 'hint' as const,
      text: '선택한 질병에 해당하는 가상 양성·ASF 레이어가 없습니다. 질병·반경·기준을 확인하세요.',
    };
  }, [
    diseases,
    distanceRefFarm,
    nationalAsfSites,
    mockPositives,
    role,
  ]);

  const toggleDisease = useCallback((d: string) => {
    setDiseases((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }, []);

  const downloadGovNearbyCsv = useCallback(() => {
    if (govNearbyRows.length === 0) return;
    const csv = nearbyToCsv(govNearbyRows);
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gov-nearby-${govFocusFarm?.farm_code ?? (govNationalAnchor ? `nat-${govNationalAnchor.livestockSeq}` : 'base')}-${govRadiusKm}km.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [govNearbyRows, govFocusFarm?.farm_code, govNationalAnchor, govRadiusKm]);

  if (loadError) {
    return <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>;
  }
  if (!data) {
    return <div className="text-sm text-zinc-500">지도 데이터를 불러오는 중…</div>;
  }

  const govSideListOpen = role === 'government' && govAnchorCoords != null;
  const asfInteractiveRole = role === 'government' || role === 'publicVet';
  const asfSideOpen = asfInteractiveRole && selectedAsfSite != null;
  const probeSideOpen = probePoint != null;
  const mapRowSplit = govSideListOpen || asfSideOpen || probeSideOpen;

  return (
    <div className="flex flex-col gap-2">
      {/* 지도 역할/권역 선택은 상단 "로그인 주최"에서만 제어 */}

      <div className="rounded-md border border-zinc-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-800">주소/지점 반경 조회</span>
          <span className="text-[11px] text-zinc-600">
            주소 검색 또는 지도 빈 곳 클릭 → 500m/1/2/3/5km 내 타농장(다비·행안부) 확인
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            value={probeQuery}
            onChange={(e) => setProbeQuery(e.target.value)}
            placeholder="예: 경기도 이천시 마장면…"
            className="w-[min(100%,22rem)] rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={!probeQuery.trim() || probeSearching}
            onClick={async () => {
              const q = probeQuery.trim();
              if (!q) return;
              setProbeSearching(true);
              setProbeSearchError(null);
              setProbeSearchNote(null);
              setProbeSearchResults([]);
              try {
                // 간단 파서: "도로명 12-34" 또는 "... 123" 형태면 번지를 추출해 정확 매칭 여부를 표시한다.
                const m = q.match(/^(.*?)(\d+(?:-\d+)?)\s*$/);
                const maybeRoad = (m?.[1] ?? '').trim();
                const maybeHouse = (m?.[2] ?? '').trim();
                const expectHouse = maybeRoad && maybeHouse ? maybeHouse : null;

                const url = new URL('https://nominatim.openstreetmap.org/search');
                url.searchParams.set('format', 'jsonv2');
                url.searchParams.set('q', q);
                url.searchParams.set('limit', '5');
                url.searchParams.set('countrycodes', 'kr');
                url.searchParams.set('accept-language', 'ko');
                url.searchParams.set('addressdetails', '1');
                // 한국 bbox로 한정(해외 유사 주소 억제)
                url.searchParams.set('viewbox', '123.5,39.25,132.8,30.8');
                url.searchParams.set('bounded', '1');
                const res = await fetch(url.toString(), {
                  headers: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
                });
                if (!res.ok) throw new Error('주소 검색 실패');
                const data = (await res.json()) as Array<{
                  display_name: string;
                  lat: string;
                  lon: string;
                  address?: { house_number?: string; road?: string };
                }>;
                const rowsRaw = (data ?? [])
                  .map((r) => ({
                    label: r.display_name,
                    lat: Number(r.lat),
                    lng: Number(r.lon),
                    houseNumber: r.address?.house_number ?? null,
                    exact: expectHouse ? String(r.address?.house_number ?? '').trim() === expectHouse : undefined,
                  }))
                  .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
                // exact 매칭이 있으면 위로 올리고, 없으면 “근사”임을 안내한다.
                const hasExact = expectHouse ? rowsRaw.some((r) => r.exact) : false;
                const rows = hasExact
                  ? [...rowsRaw].sort((a, b) => Number(Boolean(b.exact)) - Number(Boolean(a.exact)))
                  : rowsRaw;
                setProbeSearchResults(rows);
                if (rows.length === 0) {
                  setProbeSearchError('검색 결과가 없습니다.');
                } else if (expectHouse && !hasExact) {
                  setProbeSearchNote(
                    `입력한 번지(${expectHouse})가 OpenStreetMap 데이터에 정확히 없을 수 있어요. 아래 결과는 ‘같은 도로 주변’ 근사 결과일 수 있습니다.`
                  );
                }
              } catch (e) {
                setProbeSearchError((e as Error).message);
              } finally {
                setProbeSearching(false);
              }
            }}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-40"
          >
            {probeSearching ? '검색 중…' : '주소 검색'}
          </button>
          <button
            type="button"
            disabled={!probePoint}
            onClick={() => {
              setProbePoint(null);
              setProbeSearchResults([]);
              setProbeSearchError(null);
            }}
            className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            조회 해제
          </button>
          {probePoint && (
            <span className="rounded bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
              기준: {probePoint.label} ({probePoint.lat.toFixed(4)}, {probePoint.lng.toFixed(4)})
            </span>
          )}
        </div>
        {probeSearchError && <div className="mt-1 text-[11px] text-red-700">{probeSearchError}</div>}
        {probeSearchNote && !probeSearchError && (
          <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            {probeSearchNote}
          </div>
        )}
        {probeSearchResults.length > 0 && (
          <div className="mt-2 max-h-40 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2">
            <div className="mb-1 text-[11px] font-medium text-zinc-700">검색 결과</div>
            <ul className="space-y-1">
              {probeSearchResults.map((r, i) => (
                <li key={`${r.lat}-${r.lng}-${i}`} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-[11px] text-zinc-700" title={r.label}>
                    {r.exact ? (
                      <span className="mr-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                        정확
                      </span>
                    ) : (
                      <span className="mr-1 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                        근사
                      </span>
                    )}
                    {r.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGovFocusKey(null);
                      setGovNationalAnchor(null);
                      setSelectedAsfSite(null);
                      setProbePoint({
                        id: `probe-search-${Date.now()}`,
                        lat: r.lat,
                        lng: r.lng,
                        label: r.label,
                        source: 'search',
                      });
                    }}
                    className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    이 지점 조회
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {role === 'farmer' && (
        <CompactDemoFilters
          farmRow={
            <>
              <label className="text-xs font-medium text-zinc-700">기준 농장</label>
              <select
                value={baseFarmKey}
                onChange={(e) => setBaseFarmKey(e.target.value)}
                className="max-w-[min(100%,20rem)] rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs"
              >
                {allFarmsWithCoordsDeduped.map((f) => {
                  const k = farmLocationKey(f);
                  const approx = f.approximate ? ' · 대략' : '';
                  return (
                    <option key={k} value={k}>
                      {f.farm_code}
                      {approx}
                    </option>
                  );
                })}
              </select>
            </>
          }
          filtersDisabled={false}
          mockPositives={mockPositives}
          nationalAsfCount={nationalAsfSites.length}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          diseases={diseases}
          toggleDisease={toggleDisease}
          periodKey={periodKey}
          setPeriodKey={setPeriodKey}
        />
      )}

      {role === 'vet' && (
        <>
          <CompactDemoFilters
            farmRow={
              <>
                <label className="text-xs font-medium text-zinc-700">기준(담당)</label>
                <select
                  value={baseFarmKey}
                  onChange={(e) => setBaseFarmKey(e.target.value)}
                  disabled={filtered.length === 0}
                  className="max-w-[min(100%,20rem)] rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs disabled:opacity-50"
                >
                  {vetSelectOptions.map((f) => {
                    const k = farmLocationKey(f);
                    const approx = f.approximate ? ' · 대략' : '';
                    return (
                      <option key={k} value={k}>
                        {f.farm_code}
                        {approx}
                      </option>
                    );
                  })}
                </select>
              </>
            }
            filtersDisabled={filtered.length === 0}
            mockPositives={filtered.length === 0 ? [] : mockPositives}
            nationalAsfCount={nationalAsfSites.length}
            radiusKm={radiusKm}
            setRadiusKm={setRadiusKm}
            diseases={diseases}
            toggleDisease={toggleDisease}
            periodKey={periodKey}
            setPeriodKey={setPeriodKey}
          />
          {filtered.length === 0 && (
            <p className="text-[11px] text-zinc-500">담당 농장이 없거나 좌표가 없습니다.</p>
          )}
        </>
      )}

      {role === 'government' && (
        <>
          {!govAnchorCoords ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="shrink-0 text-[11px] font-medium text-zinc-500">반경(기준 선택 전)</span>
                {([0.5, 1, 3, 5, 10] as const).map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setGovRadiusKm(km)}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      govRadiusKm === km
                        ? 'bg-blue-700 text-white'
                        : 'border border-zinc-300 bg-white text-zinc-700'
                    }`}
                  >
                    {km < 1 ? `${km * 1000} m` : `${km} km`}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="shrink-0 text-[11px] font-medium text-zinc-500">질병</span>
                {DISEASE_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDisease(d)}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      diseases.has(d)
                        ? 'bg-rose-700 text-white'
                        : 'border border-zinc-300 bg-white text-zinc-700'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="shrink-0 text-[11px] font-medium text-zinc-500">기간</span>
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPeriodKey(p.key)}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      periodKey === p.key
                        ? 'bg-violet-700 text-white'
                        : 'border border-zinc-300 bg-white text-zinc-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {diseases.has('ASF') && (
                <p className="mt-1.5 rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[11px] font-medium text-red-900">
                  ASF: 빨간 점을 클릭하면 500m·1·3·5·10km 동심원(색 구분)과 우측 거리 구간별 농장 코드 목록이 열립니다. 지도는 제주까지 팬·줌 가능합니다. 데모용이며
                  실제 신고가 아닙니다.
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-zinc-600">
                지도에서 <strong>다비</strong> 또는 <strong>행안부(회색 점)</strong>를 클릭하면 기준이 잡히고, 반경 원·우측 인근 목록·가상 양성 데모가 켜집니다. 주소·농장명은 목록에 넣지 않습니다.
              </p>
            </div>
          ) : (
            <CompactDemoFilters
              farmRow={
                <>
                  <span className="text-xs font-medium text-zinc-700">기준</span>
                  {govFocusFarm ? (
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-zinc-200">
                      {govFocusFarm.farm_code}
                    </span>
                  ) : (
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-zinc-200">
                      행안부 {govNationalAnchor?.livestockSeq}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setGovFocusKey(null);
                      setGovNationalAnchor(null);
                    }}
                    className="rounded border border-zinc-400 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                  >
                    해제
                  </button>
                </>
              }
              filtersDisabled={false}
              mockPositives={mockPositives}
              nationalAsfCount={nationalAsfSites.length}
              radiusKm={govRadiusKm}
              setRadiusKm={(v) => setGovRadiusKm(v as 0.5 | 1 | 3 | 5 | 10)}
              radiusSteps={[0.5, 1, 3, 5, 10]}
              diseases={diseases}
              toggleDisease={toggleDisease}
              periodKey={periodKey}
              setPeriodKey={setPeriodKey}
            />
          )}
        </>
      )}

      {role === 'publicVet' && (
        <>
          <CompactDemoFilters
            farmRow={
              <>
                {!publicVetRegion && (
                  <span className="text-[11px] text-amber-800">권역(경기/충청)을 먼저 고르세요.</span>
                )}
                <span className="text-xs font-medium text-zinc-700">기준</span>
                {publicVetFocusKey && publicVetFocusFarm ? (
                  <>
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-zinc-200">
                      {publicVetFocusFarm.farm_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPublicVetFocusKey(null)}
                      className="rounded border border-zinc-400 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                    >
                      해제
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-zinc-600">지도 마커 클릭 → 기준 지정</span>
                )}
              </>
            }
            filtersDisabled={!publicVetFocusKey || !publicVetRegion}
            mockPositives={!publicVetFocusKey ? [] : mockPositives}
            nationalAsfCount={nationalAsfSites.length}
            radiusKm={radiusKm}
            setRadiusKm={setRadiusKm}
            diseases={diseases}
            toggleDisease={toggleDisease}
            periodKey={periodKey}
            setPeriodKey={setPeriodKey}
          />
          {diseases.has('ASF') && publicVetRegion && (
            <p className="rounded border border-red-200 bg-red-50/90 px-2 py-1.5 text-[11px] font-medium text-red-900">
              ASF: 정부 탭과 동일한 전국 가상 발생점(빨간 점)이 표시됩니다. 점을 클릭하면 동심원·우측 누적 거리별 농장 코드(권역 내 다비·행안부)·문자발송(데모)이
              열립니다. 실제 역학 정보가 아닙니다.
            </p>
          )}
        </>
      )}

      {nearestOutbreakBanner.kind !== 'empty' && (
        <div
          className={`rounded-md border px-2 py-1.5 text-xs leading-snug ${
            nearestOutbreakBanner.kind === 'distance'
              ? 'border-amber-300 bg-amber-50 text-amber-950'
              : 'border-zinc-200 bg-zinc-50 text-zinc-700'
          }`}
        >
          {nearestOutbreakBanner.text}
        </div>
      )}

      <div className={mapRowSplit ? 'flex min-h-0 flex-1 gap-2' : 'min-h-0 flex-1'}>
        <div
          className={
            mapRowSplit
              ? 'h-[min(76vh,680px)] min-h-0 min-w-0 flex-[4] overflow-hidden rounded-lg border border-zinc-200'
              : 'h-[min(76vh,680px)] w-full overflow-hidden rounded-lg border border-zinc-200'
          }
        >
          <MapContainer
            center={mapCenter}
            zoom={role === 'government' ? 7 : 9}
            className="h-full w-full"
            scrollWheelZoom
            preferCanvas
            minZoom={5}
            maxZoom={18}
            maxBounds={KOREA_VIEW_BOUNDS}
            maxBoundsViscosity={0.85}
          >
            <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickProbe
            enabled
            onPick={(lat, lng) => {
              setGovFocusKey(null);
              setGovNationalAnchor(null);
              setSelectedAsfSite(null);
              setProbePoint({
                id: `probe-click-${Date.now()}`,
                lat,
                lng,
                label: '지도 클릭',
                source: 'click',
              });
            }}
          />
          {probePoint ? (
            <FitToProbeRings lat={probePoint.lat} lng={probePoint.lng} ringKey={probePoint.id} maxKm={5} />
          ) : selectedAsfSite ? (
            <FitToAsfRings
              lat={selectedAsfSite.lat}
              lng={selectedAsfSite.lng}
              ringKey={selectedAsfSite.id}
            />
          ) : (
            <FitBounds points={fitPoints} boundsKey={fitBoundsKey} />
          )}

          {showNationalLayer &&
            nationalFarmsForMap.map((n, idx) => (
              <NationalFarmCircleMarker
                key={`nat-${n.livestockSeq}-${idx}`}
                n={n}
                role={role}
                onGovernmentSelectNational={
                  role === 'government'
                    ? (rec) => {
                        setGovFocusKey(null);
                        setGovNationalAnchor({
                          lat: rec.lat,
                          lng: rec.lng,
                          livestockSeq: rec.livestockSeq,
                        });
                      }
                    : undefined
                }
              />
            ))}

          {dabiForMap.map((f) => (
            <DabiFarmMarker
              key={farmLocationKey(f)}
              farm={f}
              role={role}
              onPublicVetSelect={
                role === 'publicVet'
                  ? (fm) => setPublicVetFocusKey(farmLocationKey(fm))
                  : undefined
              }
              onGovernmentSelect={
                role === 'government'
                  ? (fm) => {
                      setGovNationalAnchor(null);
                      setGovFocusKey(farmLocationKey(fm));
                    }
                  : undefined
              }
              onSelectAsBaseFarm={
                role === 'farmer' || role === 'vet'
                  ? (fm) => setBaseFarmKey(farmLocationKey(fm))
                  : undefined
              }
            />
          ))}

          {nationalAsfSites.map((m) => {
            const selected = selectedAsfSite?.id === m.id;
            return (
              <CircleMarker
                key={m.id}
                center={[m.lat, m.lng]}
                radius={selected ? 14 : 12}
                pathOptions={{
                  color: selected ? '#fbbf24' : '#450a0a',
                  weight: selected ? 4 : 3,
                  fillColor: '#dc2626',
                  fillOpacity: selected ? 1 : 0.92,
                }}
                eventHandlers={
                  asfInteractiveRole
                    ? {
                        click: (e) => {
                          e.originalEvent?.stopPropagation?.();
                          if (role === 'government') {
                            setGovFocusKey(null);
                            setGovNationalAnchor(null);
                          }
                          setSelectedAsfSite({ id: m.id, lat: m.lat, lng: m.lng });
                        },
                      }
                    : undefined
                }
              >
                <Popup>
                  <div className="max-w-[14rem] text-sm">
                    <div className="font-bold text-red-900">가상 ASF (데모)</div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      클릭 시 500m~10km 동심원·우측 거리별 농장 코드 목록.
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      실제 신고·역학 정보가 아닙니다.
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {asfSideOpen && selectedAsfSite &&
            ASF_CONCENTRIC_CIRCLES.map((ring) => (
              <Circle
                key={`asf-ring-${ring.radiusKm}`}
                center={[selectedAsfSite.lat, selectedAsfSite.lng]}
                radius={ring.radiusKm * 1000}
                pathOptions={{
                  color: ring.color,
                  weight: ring.weight,
                  opacity: 0.95,
                  fillColor: ring.fillColor,
                  fillOpacity: ring.fillOpacity,
                }}
              />
            ))}

          {probePoint &&
            PROBE_RADIUS_KM_STEPS.slice()
              .reverse()
              .map((km) => {
                // 큰 원 먼저 그려 작은 원이 위로
                const ring =
                  km === 5
                    ? { radiusKm: 5, color: '#0369a1', fillColor: '#0ea5e9', fillOpacity: 0.06, weight: 2 }
                    : km === 3
                      ? { radiusKm: 3, color: '#047857', fillColor: '#14b8a6', fillOpacity: 0.08, weight: 2 }
                      : km === 2
                        ? { radiusKm: 2, color: '#7c3aed', fillColor: '#a78bfa', fillOpacity: 0.09, weight: 2 }
                        : km === 1
                          ? { radiusKm: 1, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.1, weight: 2 }
                          : { radiusKm: 0.5, color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.12, weight: 3 };
                return (
                  <Circle
                    key={`probe-ring-${km}`}
                    center={[probePoint.lat, probePoint.lng]}
                    radius={km * 1000}
                    pathOptions={{
                      color: ring.color,
                      weight: ring.weight,
                      opacity: 0.95,
                      fillColor: ring.fillColor,
                      fillOpacity: ring.fillOpacity,
                    }}
                  />
                );
              })}

          {probePoint && (
            <Marker position={[probePoint.lat, probePoint.lng]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">기준점</div>
                  <div className="text-xs text-zinc-600">{probePoint.label}</div>
                  <div className="text-xs text-zinc-500">
                    500m·1·2·3·5km 반경 내 농장 여부를 우측 패널에서 확인
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {showRadiusDemo && mockAnchorFarm && (
            <>
              <Circle
                center={[mockAnchorFarm.lat, mockAnchorFarm.lng]}
                radius={(role === 'government' ? govRadiusKm : radiusKm) * 1000}
                pathOptions={{
                  color: '#1d4ed8',
                  weight: 3,
                  opacity: 1,
                  fillColor: '#3b82f6',
                  fillOpacity: 0.14,
                }}
              />
              <Marker position={[mockAnchorFarm.lat, mockAnchorFarm.lng]}>
                <Popup>
                  <div className="text-sm">
                    <strong>기준</strong> {mockAnchorFarm.farm_code}
                  </div>
                </Popup>
              </Marker>
              {mockPositives.map((m) => (
                <Marker
                  key={m.id}
                  position={[m.lat, m.lng]}
                  icon={L.divIcon({
                    className: 'mock-positive-marker',
                    html: `<div style="background:#ea580c;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px #0006"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                  })}
                >
                  <Popup>
                    가상 양성 ({m.disease}) · 약 {m.distanceKm} km
                  </Popup>
                </Marker>
              ))}
            </>
          )}
          </MapContainer>
        </div>

        {asfSideOpen && (
          <aside className="flex h-[min(76vh,680px)] w-[20%] min-w-[10.5rem] max-w-[19rem] shrink-0 flex-col overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-red-100 bg-red-50/80 p-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-red-950">ASF 반경·목록</span>
                <button
                  type="button"
                  onClick={() => setSelectedAsfSite(null)}
                  className="rounded border border-red-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-red-900 hover:bg-red-50"
                >
                  닫기
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-red-900/80">
                동심원: 보라 10km → 파랑 5km → 청록 3km → 주황 1km → 빨강 500m. 아래는 각 반경 이내 누적(거리순). 문자발송은 데모(UI만).
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {asfCumulativeBuckets.map((bucket) => {
                const smsRange =
                  bucket.maxKm < 1 ? `${bucket.maxKm * 1000}m 이내` : `${bucket.maxKm}km 이내`;
                return (
                  <div key={bucket.label} className="mb-3 border-b border-zinc-100 pb-2 last:mb-0 last:border-b-0">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                      <div className="text-[10px] font-bold text-zinc-800">{bucket.label}</div>
                      <button
                        type="button"
                        onClick={() => {
                          window.alert(`데모: ${smsRange} 대상 문자발송 — API 미연동`);
                        }}
                        className="shrink-0 rounded border border-red-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-red-900 hover:bg-red-50"
                      >
                        문자(데모)
                      </button>
                    </div>
                    {bucket.items.length === 0 ? (
                      <p className="text-[10px] text-zinc-400">해당 반경 내 없음</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {bucket.items.map((row, idx) => (
                          <li
                            key={`${bucket.label}-${row.code}-${idx}`}
                            className="flex justify-between gap-1 font-mono text-[10px] text-zinc-800"
                          >
                            <span className="min-w-0 truncate" title={row.typeLabel}>
                              {row.code}
                            </span>
                            <span className="shrink-0 text-zinc-500">{row.km.toFixed(2)}km</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {probeSideOpen && !asfSideOpen && !govSideListOpen && probePoint && (
          <aside className="flex h-[min(76vh,680px)] w-[20%] min-w-[10.5rem] max-w-[19rem] shrink-0 flex-col overflow-hidden rounded-lg border border-sky-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-sky-100 bg-sky-50/80 p-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-sky-950">반경 조회</span>
                <button
                  type="button"
                  onClick={() => setProbePoint(null)}
                  className="rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-sky-900 hover:bg-sky-50"
                >
                  닫기
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-sky-900/80">
                기준점 주변 500m·1·2·3·5km 이내 농장(다비/행안부) 누적 목록입니다.
              </p>
              <p className="mt-1 text-[10px] leading-tight text-zinc-600">
                총 {probeNearbyRows.length}건(5km 이내)
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {probeCumulativeBuckets.map((bucket) => (
                <div key={bucket.label} className="mb-3 border-b border-zinc-100 pb-2 last:mb-0 last:border-b-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-[10px] font-bold text-zinc-800">{bucket.label}</div>
                    <div className="text-[10px] text-zinc-600">{bucket.items.length}건</div>
                  </div>
                  {bucket.items.length === 0 ? (
                    <p className="text-[10px] text-zinc-400">해당 반경 내 없음</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {bucket.items.slice(0, 80).map((row, idx) => (
                        <li
                          key={`${bucket.label}-${row.typeLabel}-${row.code}-${idx}`}
                          className="flex justify-between gap-1 font-mono text-[10px] text-zinc-800"
                        >
                          <span className="min-w-0 truncate" title={row.typeLabel}>
                            {row.code}
                          </span>
                          <span className="shrink-0 text-zinc-500">{row.km.toFixed(2)}km</span>
                        </li>
                      ))}
                      {bucket.items.length > 80 && (
                        <li className="text-[10px] text-zinc-500">… {bucket.items.length - 80}건 더 있음</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}

        {govSideListOpen && !asfSideOpen && (
          <aside className="flex h-[min(76vh,680px)] w-[20%] min-w-[10.5rem] max-w-[19rem] shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-zinc-100 p-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-800">반경 내 목록</span>
                <span className="text-[11px] text-zinc-600">{govNearbyRows.length}건</span>
              </div>
              <button
                type="button"
                disabled={govNearbyRows.length === 0}
                onClick={downloadGovNearbyCsv}
                className="mt-1.5 w-full rounded border border-zinc-400 bg-zinc-50 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
              >
                CSV 저장
              </button>
              {!national?.farms?.length && (
                <p className="mt-1 text-[10px] leading-tight text-zinc-500">
                  행안부 레이어 미로드 — 다비만 집계됩니다.
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-zinc-100 text-zinc-600">
                  <tr>
                    <th className="px-1 py-0.5">유형</th>
                    <th className="px-1 py-0.5">코드/일련</th>
                    <th className="px-1 py-0.5">km</th>
                  </tr>
                </thead>
                <tbody>
                  {govNearbyRows.map((r, i) => (
                    <tr
                      key={`${r.kind}-${r.kind === 'dabi' ? r.code : r.livestockSeq}-${i}`}
                      className="border-t border-zinc-100"
                    >
                      <td className="px-1 py-0.5">{r.kind === 'dabi' ? '다비' : '행안부'}</td>
                      <td className="px-1 py-0.5 font-mono">{r.kind === 'dabi' ? r.code : r.livestockSeq}</td>
                      <td className="px-1 py-0.5">{r.distanceKm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {govNearbyRows.length === 0 && (
                <p className="p-2 text-[11px] text-zinc-500">이 반경 안에 항목이 없습니다.</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
