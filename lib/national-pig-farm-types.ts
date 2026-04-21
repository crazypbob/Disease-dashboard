/** public/data/national-pig-farms.json — 클라이언트에 주소·농장명 없음 */
export type NationalPigFarmRecord = {
  livestockSeq: string;
  lat: number;
  lng: number;
  /** 시도 1단어 (필터용, 예: 경기도, 충청북도) */
  sido?: string;
};

export type NationalPigFarmsFile = {
  generatedAt: string;
  sourceFile: string;
  sheet: string;
  /** 원본 좌표계(Korea 2000 / Central Belt EPSG:5179 등)에서 WGS84로 변환 */
  crsNote: string;
  rowCount: number;
  farms: NationalPigFarmRecord[];
};
