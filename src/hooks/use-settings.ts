'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'stavka-dnya-settings';

export interface UserSettings {
  // Виды спорта, которые пользователь хочет видеть (пустой массив = все)
  preferredSports: string[];
  // Минимальный порог уверенности (0-100, 0 = любой)
  minConfidence: number;
  // Скрыть пики с низкой уверенностью (ниже 40%)
  hideLowConfidence: boolean;
  // Часовой пояс отображения (по умолчанию Europe/Moscow)
  timezone: string;
  // Показывать ли пики из ESPN (true) или только веб-поиск (false)
  showEspnPicks: boolean;
  // Тема: 'light' | 'dark' | 'system' (управляется next-themes, но синхронизируем)
  theme: 'light' | 'dark' | 'system';
}

const DEFAULT_SETTINGS: UserSettings = {
  preferredSports: [],
  minConfidence: 0,
  hideLowConfidence: false,
  timezone: 'Europe/Moscow',
  showEspnPicks: true,
  theme: 'system',
};

function readSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Merge с defaults для устойчивости к старым версиям
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// External store
let cacheSnapshot: UserSettings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): UserSettings {
  if (cacheSnapshot === null) {
    cacheSnapshot = readSettings();
  }
  return cacheSnapshot;
}

// Стабильный снапшот для SSR
const serverSnapshot: UserSettings = DEFAULT_SETTINGS;

function getServerSnapshot(): UserSettings {
  return serverSnapshot;
}

function notifyAll() {
  cacheSnapshot = readSettings();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notifyAll();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function writeSettings(next: UserSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyAll();
  } catch {
    // quota exceeded / private mode
  }
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    const next = { ...getSnapshot(), ...patch };
    writeSettings(next);
  }, []);

  const toggleSport = useCallback((sportKey: string) => {
    const current = getSnapshot();
    const preferredSports = current.preferredSports.includes(sportKey)
      ? current.preferredSports.filter((s) => s !== sportKey)
      : [...current.preferredSports, sportKey];
    writeSettings({ ...current, preferredSports });
  }, []);

  const resetSettings = useCallback(() => {
    writeSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSettings, toggleSport, resetSettings };
}
