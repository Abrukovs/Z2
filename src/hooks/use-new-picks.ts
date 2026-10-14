'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'stavka-dnya-last-seen';

// Храним timestamp последнего просмотра пиков пользователем
// Сравниваем с generatedAt самого свежего пика — если новее, показываем badge

function readLastSeen(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

let cacheSnapshot: string | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): string {
  if (cacheSnapshot === null) {
    cacheSnapshot = readLastSeen();
  }
  return cacheSnapshot;
}

const EMPTY = '';
function getServerSnapshot(): string {
  return EMPTY;
}

function notifyAll() {
  cacheSnapshot = readLastSeen();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function writeLastSeen(ts: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, ts);
    notifyAll();
  } catch {
    // ignore
  }
}

export interface NewPicksInfo {
  hasNew: boolean;
  count: number;
  lastSeen: string;
  markSeen: (generatedAt: string) => void;
  reset: () => void;
}

export function useNewPicks(latestGeneratedAt: string | null): NewPicksInfo {
  const lastSeen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const hasNew = Boolean(
    latestGeneratedAt &&
      (!lastSeen || new Date(latestGeneratedAt).getTime() > new Date(lastSeen).getTime()),
  );

  const markSeen = useCallback(
    (generatedAt: string) => {
      if (!generatedAt) return;
      // Сохраняем только если новее текущего lastSeen
      const current = getSnapshot();
      if (!current || new Date(generatedAt).getTime() > new Date(current).getTime()) {
        writeLastSeen(generatedAt);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    writeLastSeen(new Date().toISOString());
  }, []);

  // Простой подсчёт: 1 если есть новые, 0 если нет
  // (точное количество неизвестно без сравнения всех пиков с lastSeen)
  const count = hasNew ? 1 : 0;

  return { hasNew, count, lastSeen, markSeen, reset };
}
