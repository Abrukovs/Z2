'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'stavka-dnya-favorites';

// ===== External store для избранных пиков (localStorage) =====
// Используем useSyncExternalStore — это правильный React-паттерн для
// синхронизации с внешним хранилищем без setState в effect.

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

// Кэш текущего снапшота (мутация только через subscribe-цикл)
let cacheSnapshot: Set<string> | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Set<string> {
  if (cacheSnapshot === null) {
    cacheSnapshot = readSet();
  }
  return cacheSnapshot;
}

function getServerSnapshot(): Set<string> {
  return emptyServerSet;
}

// Кешированный пустой Set для серверного снапшота — избегает infinite loop warning
const emptyServerSet = new Set<string>();

function notifyAll() {
  cacheSnapshot = readSet(); // обновляем кэш
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Подписываемся на storage-события (другие вкладки)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notifyAll();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function writeFavorites(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    notifyAll();
  } catch {
    // quota exceeded / private mode — игнорируем
  }
}

function toggle(id: string) {
  const next = new Set(getSnapshot());
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  writeFavorites(next);
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleFavorite = useCallback((id: string) => {
    toggle(id);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);
  const count = favorites.size;

  return { favorites, isFavorite, toggleFavorite, count };
}
