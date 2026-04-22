'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  readFarmAnonymizeFromStorage,
  writeFarmAnonymizeToStorage,
} from '@/lib/farm-display';

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onStoreChange();
  window.addEventListener('farm-anonymize-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('farm-anonymize-change', handler);
    window.removeEventListener('storage', handler);
  };
}

function getSnapshot() {
  return readFarmAnonymizeFromStorage();
}

function getServerSnapshot() {
  return false;
}

export function useFarmAnonymize() {
  const anonymized = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    writeFarmAnonymizeToStorage(!readFarmAnonymizeFromStorage());
  }, []);
  const setAnonymized = useCallback((v: boolean) => {
    writeFarmAnonymizeToStorage(v);
  }, []);
  return { anonymized, toggle, setAnonymized };
}
