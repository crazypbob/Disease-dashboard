import type { FarmCode } from '@/lib/farms';
import { FARMS } from '@/lib/farms';

/** 농장주소록·규모 엑셀과 동일한 DB 코드 체계는 `lib/farms.ts`의 `DB####` 키를 따름 */

export const FARM_ANONYMIZE_STORAGE_KEY = 'disease-dashboard-farm-anonymize';

export function readFarmAnonymizeFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FARM_ANONYMIZE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeFarmAnonymizeToStorage(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FARM_ANONYMIZE_STORAGE_KEY, v ? '1' : '0');
    window.dispatchEvent(new Event('farm-anonymize-change'));
  } catch {
    /* ignore */
  }
}

/** `DB1001` → `1001`. 비 DB 형식 코드는 동일 문자열에 대해 고정된 4자리 숫자(1000–9999) */
export function farmCodeToAnonymizedLabel(dbCode: string): string {
  const t = dbCode.trim();
  const m = /^DB(\d+)$/i.exec(t);
  if (m) return m[1];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return String(1000 + (h % 9000));
}

export function farmDisplayLabel(dbCode: string, anonymized: boolean): string {
  if (!anonymized) {
    return FARMS[dbCode as FarmCode]?.name ?? dbCode;
  }
  return farmCodeToAnonymizedLabel(dbCode);
}
