/** public/data/farm-locations.json 스키마 (지도 탭) */
export type FarmLocationRecord = {
  farm_code: string;
  name: string;
  vet: string;
  address: string;
  lat: number | null;
  lng: number | null;
  geocodeError?: string;
  /** Nominatim 실패 시 주소 시도 기준 대략 좌표 */
  approximate?: boolean;
};

export type FarmLocationsFile = {
  generatedAt: string;
  sourceFile: string;
  sheet: string;
  farms: FarmLocationRecord[];
};
