'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

// Безопасное определение монтирования без setState в effect.
// useSyncExternalStore: server snapshot = false, client snapshot = true.
// Это избегает hydration mismatch и не нарушает react-hooks/set-state-in-effect.
const emptySubscribe = () => () => {};

// Кешированные примитивы для снапшотов (избегают infinite loop warning)
const TRUE_CONST = true;
const FALSE_CONST = false;

function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => TRUE_CONST, // client snapshot
    () => FALSE_CONST, // server snapshot
  );
}

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    // Плейсхолдер для SSR — занимает то же место
    return (
      <button
        type="button"
        aria-label="Переключить тему"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 opacity-0 dark:border-slate-700 dark:bg-slate-900"
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const isDark = (resolvedTheme || theme) === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className={cn(
        'group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-all',
        'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400',
      )}
    >
      <Sun
        className={cn(
          'h-4 w-4 transition-all',
          isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute h-4 w-4 transition-all',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0',
        )}
      />
    </button>
  );
}
