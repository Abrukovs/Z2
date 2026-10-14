'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Sparkles,
  CalendarDays,
  Target,
  Flame,
  Trophy,
  Inbox,
  AlertCircle,
  Activity,
  Search,
  Brain,
  Database,
  BarChart3,
  ListChecks,
  History,
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  Settings,
  Bell,
  Keyboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { StatsPanel } from './stats-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { PickDetailDialog, type PickDetail } from './pick-detail-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PickCard } from './pick-card';
import type { Pick, Confidence } from '@/lib/picks-service';
import { useFavorites } from '@/hooks/use-favorites';
import { useSettings } from '@/hooks/use-settings';
import { useNewPicks } from '@/hooks/use-new-picks';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { SettingsDrawer } from '@/components/settings-drawer';
import { ExportArchiveButton } from './export-archive-button';
import { toast } from 'sonner';

interface UsageStats {
  webSearchCalls: number;
  llmCalls: number;
  totalCalls: number;
  cacheHits: number;
  generations: number;
  sessionStart: string;
  lastCallAt: string | null;
}

interface ApiResponse {
  success: boolean;
  date?: string;
  cached?: boolean;
  count: number;
  total: number;
  generatedAt?: string | null;
  picks: Pick[];
  error?: string;
  usage?: UsageStats;
  activeLeagues?: {
    football: string[];
    basketball: string[];
    tennis: string[];
    hockey: string[];
    esports: string[];
  };
  sportsSearched?: number;
  filteredOut?: number;
}

const SPORT_FILTERS: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'Все', icon: '🏆' },
  { key: 'football', label: 'Футбол', icon: '⚽' },
  { key: 'basketball', label: 'Баскетбол', icon: '🏀' },
  { key: 'tennis', label: 'Теннис', icon: '🎾' },
  { key: 'hockey', label: 'Хоккей', icon: '🏒' },
  { key: 'esports', label: 'Киберспорт', icon: '🎮' },
  { key: 'volleyball', label: 'Волейбол', icon: '🏐' },
];

const CONF_FILTERS: { key: Confidence | 'all'; label: string }[] = [
  { key: 'all', label: 'Любая' },
  { key: 'high', label: 'Высокая' },
  { key: 'medium', label: 'Средняя' },
  { key: 'low', label: 'Низкая' },
];

function formatToday(): { pretty: string; weekday: string } {
  const now = new Date();
  return {
    pretty: now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Moscow',
    }),
    weekday: now.toLocaleDateString('ru-RU', {
      weekday: 'long',
      timeZone: 'Europe/Moscow',
    }),
  };
}

export function PicksApp() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [activeLeagues, setActiveLeagues] = useState<ApiResponse['activeLeagues'] | null>(null);
  const [sportsSearched, setSportsSearched] = useState<number | null>(null);
  const [filteredOut, setFilteredOut] = useState<number | null>(null);

  const [sportFilter, setSportFilter] = useState<string>('all');
  const [confFilter, setConfFilter] = useState<Confidence | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'picks' | 'stats'>('picks');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Архив: просмотр пиков за прошлые даты
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveDate, setArchiveDate] = useState<string>(''); // YYYY-MM-DD
  const [archiveDates, setArchiveDates] = useState<string[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Детальная модалка пика
  const [detailPick, setDetailPick] = useState<PickDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { pretty, weekday } = useMemo(formatToday, []);

  // Загрузка архива дат (один раз при включении режима архива)
  useEffect(() => {
    if (!archiveMode || archiveDates.length > 0) return;
    fetch('/api/picks?dates=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.dates)) {
          setArchiveDates(d.dates);
          // По умолчанию — последняя доступная дата (если не сегодня)
          const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
          const firstNonToday = d.dates.find((dt: string) => dt !== today);
          if (firstNonToday && !archiveDate) {
            setArchiveDate(firstNonToday);
          }
        }
      })
      .catch(() => {});
  }, [archiveMode, archiveDates, archiveDate]);

  // Загрузка архивных пиков при смене даты
  useEffect(() => {
    if (!archiveMode || !archiveDate) return;
    setArchiveLoading(true);
    setError(null);
    fetch(`/api/picks?date=${encodeURIComponent(archiveDate)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPicks(d.picks);
          setCached(false);
          setGeneratedAt(d.generatedAt ?? null);
          setUsage(null);
          setActiveLeagues(null);
          setSportsSearched(null);
          setFilteredOut(null);
        } else {
          setError(d.error || 'Ошибка загрузки архива');
          setPicks([]);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setPicks([]);
      })
      .finally(() => {
        setArchiveLoading(false);
        setLoading(false);
      });
  }, [archiveMode, archiveDate]);

  const fetchPicks = useCallback(async (force: boolean) => {
    if (archiveMode) return; // в режиме архива не обновляем принудительно
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = `/api/picks?force=${force ? 1 : 0}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось загрузить пики');
      }
      setPicks(data.picks);
      setCached(Boolean(data.cached));
      setGeneratedAt(data.generatedAt ?? null);
      if (data.usage) setUsage(data.usage);
      if (data.activeLeagues) setActiveLeagues(data.activeLeagues);
      setSportsSearched(data.sportsSearched ?? null);
      setFilteredOut(data.filteredOut ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setPicks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [archiveMode]);

  useEffect(() => {
    if (!archiveMode) fetchPicks(false);
  }, [fetchPicks, archiveMode]);

  // Клиентская фильтрация: спорт + уверенность + текстовый поиск + избранные + настройки
  const { isFavorite, count: favoritesCount } = useFavorites();
  const { settings } = useSettings();
  const { hasNew: hasNewPicks, markSeen: markPicksSeen } = useNewPicks(generatedAt);

  const visiblePicks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return picks.filter((p) => {
      // Фильтр из UI (Select)
      if (sportFilter !== 'all' && p.sportKey !== sportFilter) return false;
      if (confFilter !== 'all' && p.confidence !== confFilter) return false;
      // Фильтр избранного
      if (showFavoritesOnly && !isFavorite(p.id)) return false;
      // Фильтр из настроек (localStorage)
      if (settings.preferredSports.length > 0 && !settings.preferredSports.includes(p.sportKey)) return false;
      if (settings.minConfidence > 0 && p.confidenceScore < settings.minConfidence) return false;
      if (settings.hideLowConfidence && p.confidenceScore < 40) return false;
      if (!settings.showEspnPicks && p.dataSource === 'ESPN API') return false;
      // Текстовый поиск
      if (q) {
        const hay = `${p.team1} ${p.team2} ${p.league} ${p.sport} ${p.market} ${p.selection}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [picks, sportFilter, confFilter, searchQuery, showFavoritesOnly, isFavorite, settings]);

  // Отмечаем пики как просмотренные при первой загрузке (не в архиве)
  useEffect(() => {
    if (!loading && !error && !archiveMode && generatedAt) {
      const timer = setTimeout(() => markPicksSeen(generatedAt), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, error, archiveMode, generatedAt, markPicksSeen]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: '/',
      handler: () => {
        const input = document.querySelector<HTMLInputElement>('input[type="text"]');
        input?.focus();
      },
      description: 'Фокус на поиск',
    },
    {
      key: 's',
      handler: () => setSettingsOpen(true),
      description: 'Открыть настройки',
    },
    {
      key: 'f',
      handler: () => setShowFavoritesOnly((v) => !v),
      description: 'Только избранные',
    },
    {
      key: 't',
      handler: () => setActiveTab((t) => (t === 'picks' ? 'stats' : 'picks')),
      description: 'Переключить вкладку',
    },
    {
      key: 'r',
      handler: () => !archiveMode && fetchPicks(true),
      description: 'Обновить пики',
    },
    {
      key: '?',
      shift: true,
      handler: () => setShortcutsOpen(true),
      description: 'Показать горячие клавиши',
    },
    {
      key: 'Escape',
      handler: () => {
        if (searchQuery) setSearchQuery('');
        else if (showFavoritesOnly) setShowFavoritesOnly(false);
      },
      ignoreInputs: true,
      description: 'Очистить фильтры',
    },
  ]);

  const stats = useMemo(() => {
    const total = picks.length;
    const high = picks.filter((p) => p.confidence === 'high').length;
    const sports = new Set(picks.map((p) => p.sportKey)).size;
    const avg =
      total > 0
        ? Math.round(
            picks.reduce((s, p) => s + p.confidenceScore, 0) / total,
          )
        : 0;
    return { total, high, sports, avg };
  }, [picks]);

  const generatedAtText = useMemo(() => {
    if (!generatedAt) return '';
    try {
      return new Date(generatedAt).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      });
    } catch {
      return '';
    }
  }, [generatedAt]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
                <Target className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-lg">
                  Ставка Дня
                </h1>
                <p className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
                  {archiveMode ? 'Архив пиков за прошедшие дни' : 'Ежедневные спортивные пики на основе ИИ'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Кнопка архива */}
              <Button
                onClick={() => setArchiveMode((v) => !v)}
                variant={archiveMode ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'shrink-0 gap-1.5',
                  archiveMode
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border-slate-200 dark:border-slate-700',
                )}
                title={archiveMode ? 'Вернуться к сегодняшним пикам' : 'Открыть архив пиков'}
              >
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">{archiveMode ? 'Сегодня' : 'Архив'}</span>
              </Button>
              {/* Счётчик API-запросов */}
              {usage && usage.totalCalls > 0 && !archiveMode && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-700"
                      aria-label="Расход API-запросов"
                    >
                      <Activity className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="tabular-nums">{usage.totalCalls}</span>
                      <span className="hidden sm:inline text-slate-400 font-normal">
                        запр.
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4" align="end">
                    <UsagePanel
                      usage={usage}
                      activeLeagues={activeLeagues}
                      sportsSearched={sportsSearched}
                      filteredOut={filteredOut}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {!archiveMode && (
                <Button
                  onClick={() => fetchPicks(true)}
                  disabled={refreshing}
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 border-slate-200 dark:border-slate-700"
                >
                  <RefreshCw
                    className={cn('h-4 w-4', refreshing && 'animate-spin')}
                  />
                  <span className="hidden sm:inline">
                    {refreshing ? 'Обновление…' : 'Обновить'}
                  </span>
                </Button>
              )}
              {/* Колокольчик новых пиков */}
              {!archiveMode && hasNewPicks && (
                <button
                  type="button"
                  onClick={() => {
                    toast.info('Новые пики доступны!', {
                      description: 'Обновите страницу, чтобы увидеть свежие прогнозы ИИ.',
                      duration: 3500,
                    });
                    markPicksSeen(generatedAt || new Date().toISOString());
                  }}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-700"
                  aria-label="Новые пики"
                  title="Новые пики с последнего визита"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                </button>
              )}
              {/* Keyboard shortcuts help */}
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-700 sm:inline-flex"
                aria-label="Горячие клавиши"
                title="Горячие клавиши (Shift+?)"
              >
                <Keyboard className="h-4 w-4" />
              </button>
              {/* Настройки */}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-700"
                aria-label="Настройки"
                title="Настройки (S)"
              >
                <Settings className="h-4 w-4" />
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Переключатель вкладок */}
          <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setActiveTab('picks')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                activeTab === 'picks'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <ListChecks className="h-4 w-4" />
              {archiveMode ? 'Архив пиков' : 'Пики на сегодня'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                activeTab === 'stats'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Статистика
            </button>
          </div>

          {activeTab === 'stats' ? (
            <StatsPanel />
          ) : (
            <>
          {/* Лента архива — навигация по датам */}
          {archiveMode && (
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-6"
            >
              <Card className="overflow-hidden p-0 shadow-sm dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const idx = archiveDates.indexOf(archiveDate);
                        if (idx >= 0 && idx < archiveDates.length - 1) {
                          setArchiveDate(archiveDates[idx + 1]);
                        }
                      }}
                      disabled={!archiveDate || archiveDates.indexOf(archiveDate) >= archiveDates.length - 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label="Следующая дата"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="min-w-[180px] text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Дата архива
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {archiveDate
                          ? new Date(archiveDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
                          : '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const idx = archiveDates.indexOf(archiveDate);
                        if (idx > 0) {
                          setArchiveDate(archiveDates[idx - 1]);
                        }
                      }}
                      disabled={!archiveDate || archiveDates.indexOf(archiveDate) <= 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label="Предыдущая дата"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <Select value={archiveDate} onValueChange={setArchiveDate}>
                    <SelectTrigger className="min-w-[180px] bg-white text-xs dark:bg-slate-900 dark:text-slate-200">
                      <SelectValue placeholder="Выбрать дату">
                        {archiveDate
                          ? new Date(archiveDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Выбрать дату'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {archiveDates.map((d) => (
                        <SelectItem key={d} value={d}>
                          {new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Export архива в CSV */}
                  {archiveDate && (
                    <ExportArchiveButton date={archiveDate} disabled={archiveLoading} />
                  )}
                </div>
                {archiveDates.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-t border-slate-100 p-2 dark:border-slate-800">
                    {archiveDates.slice(0, 10).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setArchiveDate(d)}
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors',
                          d === archiveDate
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                        )}
                      >
                        {new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </motion.section>
          )}

          {/* Hero-баннер: дата + краткая сводка + призыв к действию */}
          {!loading && !error && !archiveLoading && picks.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-md sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-emerald-100" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
                      {archiveMode ? 'Архив за' : weekday}
                    </span>
                  </div>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {archiveMode && archiveDate
                      ? new Date(archiveDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                      : pretty}
                  </h2>
                  <p className="mt-1.5 text-sm text-emerald-50/90">
                    ИИ отобрал {picks.length} {picks.length === 1 ? 'пик' : picks.length < 5 ? 'пика' : 'пиков'} ·{' '}
                    {stats.high} с высокой уверенностью ·{' '}
                    {stats.sports} {stats.sports === 1 ? 'вид спорта' : stats.sports < 5 ? 'вида спорта' : 'видов спорта'}
                  </p>
                </div>
                {/* Mini-stats в hero */}
                <div className="flex gap-3">
                  <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">
                      Ср. ув.
                    </p>
                    <p className="text-xl font-extrabold tabular-nums">{stats.avg}%</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">
                      Пиков
                    </p>
                    <p className="text-xl font-extrabold tabular-nums">{stats.total}</p>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* Пики (2 колонки, слева) + Фильтры+Метрики (справа) — в один flex-row,
              чтобы верх пиков был на одной линии с верхом Select-ов */}
          <section className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Пики — 2 колонки, слева */}
              <div className="min-w-0 flex-1">
                {/* Поиск по команде/лиге */}
                {!loading && !error && picks.length > 0 && (
                  <div className="relative mb-4">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск по команде, лиге, рынку..."
                      className="h-9 pl-9 pr-9 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                        aria-label="Очистить поиск"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                {loading || archiveLoading ? (
                  <PicksSkeleton />
                ) : error ? (
                  <ErrorState error={error} onRetry={() => fetchPicks(false)} />
                ) : visiblePicks.length === 0 ? (
                  <EmptyState hasSearch={Boolean(searchQuery)} />
                ) : (
                  <motion.div
                    layout
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                  >
                    {visiblePicks.map((pick, i) => (
                      <motion.div
                        key={pick.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
                      >
                        <PickCard
                          pick={pick}
                          onOpenDetail={() => {
                            setDetailPick(pick as PickDetail);
                            setDetailOpen(true);
                          }}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Правый блок: фильтры (без лейблов, чтобы верх = верх пиков) + метрики */}
              <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[260px]">
                {/* Фильтры — 2 компактных dropdown в ряд, БЕЗ лейблов сверху.
                    В trigger показываем название фильтра ('Вид спорта' / 'Надёжность'),
                    когда выбрано 'all'. Иначе — выбранное значение.
                    suppressHydrationWarning — подавляет ошибку гидратации Radix Select
                    (генерит случайные ID на сервере и клиенте). */}
                <div className="flex gap-2" suppressHydrationWarning>
                  <div className="min-w-[120px] flex-1">
                    <Select value={sportFilter} onValueChange={setSportFilter}>
                      <SelectTrigger className="w-full bg-white text-xs dark:bg-slate-900 dark:text-slate-200">
                        <SelectValue placeholder="Вид спорта">
                          {sportFilter === 'all'
                            ? 'Вид спорта'
                            : (() => {
                                const f = SPORT_FILTERS.find((s) => s.key === sportFilter);
                                return f ? `${f.icon} ${f.label}` : 'Вид спорта';
                              })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SPORT_FILTERS.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            <span className="mr-1.5">{s.icon}</span>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[110px] flex-1">
                    <Select value={confFilter} onValueChange={(v) => setConfFilter(v as Confidence | 'all')}>
                      <SelectTrigger className="w-full bg-white text-xs dark:bg-slate-900 dark:text-slate-200">
                        <SelectValue placeholder="Надёжность">
                          {confFilter === 'all'
                            ? 'Надёжность'
                            : (() => {
                                const c = CONF_FILTERS.find((c) => c.key === confFilter);
                                return c ? c.label : 'Надёжность';
                              })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CONF_FILTERS.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Кнопка «Только избранные» */}
                {!loading && !error && !archiveLoading && picks.length > 0 && favoritesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFavoritesOnly((v) => !v)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                      showFavoritesOnly
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-800',
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Heart className={cn('h-3.5 w-3.5', showFavoritesOnly && 'fill-current')} />
                      Избранные
                    </span>
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                      {favoritesCount}
                    </span>
                  </button>
                )}

                {/* Метрики — компактный прямоугольник 2x2, ширина = фильтры */}
                {!loading && !error && !archiveLoading && picks.length > 0 && (
                  <Card className="overflow-hidden p-0 shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900">
                    <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800">
                      <MetricItem
                        icon={<Inbox className="h-3.5 w-3.5" />}
                        label="Всего"
                        value={String(stats.total)}
                        accent="emerald"
                      />
                      <MetricItem
                        icon={<Flame className="h-3.5 w-3.5" />}
                        label="Выс.ув."
                        value={String(stats.high)}
                        accent="rose"
                      />
                      <MetricItem
                        icon={<Trophy className="h-3.5 w-3.5" />}
                        label="Видов"
                        value={String(stats.sports)}
                        accent="amber"
                      />
                      <MetricItem
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        label="Ср.ув."
                        value={`${stats.avg}%`}
                        accent="slate"
                      />
                    </div>
                  </Card>
                )}

                {/* Блок «лучший спорт сегодня» — заполняет пустоту под метриками
                    на десктопе, когда пиков мало и правая колонка пуста */}
                {!loading && !error && !archiveLoading && picks.length > 0 && (
                  <Card className="hidden p-4 shadow-sm dark:bg-slate-900 lg:block">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Топ спорта {archiveMode ? 'в архиве' : 'сегодня'}
                      </p>
                    </div>
                    {(() => {
                      // Считаем какой вид спорта имеет наивысший средний confidenceScore
                      const bySport = new Map<string, { count: number; sum: number; icon: string; label: string }>();
                      for (const p of picks) {
                        const e = bySport.get(p.sportKey) || { count: 0, sum: 0, icon: p.sportIcon, label: p.sport };
                        e.count += 1;
                        e.sum += p.confidenceScore;
                        bySport.set(p.sportKey, e);
                      }
                      const arr = Array.from(bySport.entries())
                        .map(([k, v]) => ({ key: k, avg: v.sum / v.count, ...v }))
                        .sort((a, b) => b.avg - a.avg);
                      if (arr.length === 0) return null;
                      const top = arr[0];
                      return (
                        <div className="mt-2">
                          <p className="text-lg font-extrabold text-slate-900">
                            <span className="mr-1.5">{top.icon}</span>
                            {top.label}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Средняя уверенность{' '}
                            <span className="font-semibold text-emerald-600">
                              {Math.round(top.avg)}%
                            </span>{' '}
                            · {top.count} {top.count === 1 ? 'пик' : top.count < 5 ? 'пика' : 'пиков'}
                          </p>
                        </div>
                      );
                    })()}
                  </Card>
                )}
              </div>
            </div>
          </section>

            {/* Описание внизу — дата, источник, время обновления */}
            {!loading && !error && !archiveLoading && (
              <section className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
                {archiveMode ? (
                  <span className="font-medium text-emerald-600">
                    Архив пиков за {archiveDate}
                  </span>
                ) : (
                  <span className="capitalize font-medium text-emerald-600">
                    {weekday}, {pretty}
                  </span>
                )}
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span>
                  Отобранные ИИ спортивные события с рекомендациями для ставок
                </span>
                {generatedAtText && !archiveMode && (
                  <>
                    <span className="text-slate-400 dark:text-slate-500">·</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      обновлено в {generatedAtText}
                      {cached ? ' (из кэша)' : ''}
                    </span>
                  </>
                )}
              </section>
            )}
            </>
          )}
        </div>
      </main>

      {/* Детальная модалка пика */}
      <PickDetailDialog
        pick={detailPick}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Drawer настроек */}
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Модалка горячих клавиш */}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

// ===== Диалог горячих клавиш =====
function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const shortcuts = [
    { keys: '/', desc: 'Фокус на поле поиска' },
    { keys: 'S', desc: 'Открыть настройки' },
    { keys: 'F', desc: 'Переключить фильтр избранных' },
    { keys: 'T', desc: 'Переключить вкладку Пики / Статистика' },
    { keys: 'R', desc: 'Обновить пики (только не в архиве)' },
    { keys: 'Esc', desc: 'Очистить поиск / фильтр избранных' },
    { keys: 'Shift + ?', desc: 'Показать это окно' },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 p-5 pb-4 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
            <Keyboard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Горячие клавиши
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Используйте клавиатуру для быстрой навигации. Не работает в полях ввода (кроме Esc).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 p-5">
          {shortcuts.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="text-sm text-slate-600 dark:text-slate-300">{s.desc}</span>
              <kbd className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Компактная метрика 2x2 в правом блоке (фильтры+метрики).
// Очень мелкий шрифт, метрики близко друг к другу, небольшой отступ от границ.
function MetricItem({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'emerald' | 'rose' | 'amber' | 'slate';
}) {
  const accents: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="px-2.5 py-2">
      <div className="flex items-center gap-1">
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded',
            accents[accent],
          )}
        >
          {icon}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-1 text-base font-extrabold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function PicksSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card
          key={i}
          className="relative overflow-hidden p-5 dark:bg-slate-900"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {/* Shimmer overlay */}
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-slate-700/20" />
          <div className="relative flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="ml-auto h-4 w-12" />
          </div>
          <div className="relative mt-3 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="relative mt-4 h-20 w-full rounded-xl" />
          <div className="relative mt-4 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch?: boolean }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center dark:bg-slate-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {hasSearch ? (
          <Search className="h-7 w-7 text-slate-400" />
        ) : (
          <Inbox className="h-7 w-7 text-slate-400" />
        )}
      </div>
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">
          {hasSearch ? 'Ничего не найдено' : 'Пиков не найдено'}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {hasSearch
            ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.'
            : 'Попробуйте изменить фильтры или обновить подборку.'}
        </p>
      </div>
    </Card>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <AlertCircle className="h-7 w-7 text-rose-500" />
      </div>
      <div>
        <p className="font-semibold text-slate-700">Не удалось загрузить пики</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">{error}</p>
      </div>
      <Button onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-4 w-4" />
        Повторить
      </Button>
    </Card>
  );
}

function UsagePanel({
  usage,
  activeLeagues,
  sportsSearched,
  filteredOut,
}: {
  usage: UsageStats;
  activeLeagues?: ApiResponse['activeLeagues'] | null;
  sportsSearched: number | null;
  filteredOut: number | null;
}) {
  const sessionDuration = useMemo(() => {
    try {
      const ms = Date.now() - new Date(usage.sessionStart).getTime();
      const min = Math.floor(ms / 60000);
      if (min < 1) return 'меньше минуты';
      if (min < 60) return `${min} мин`;
      const h = Math.floor(min / 60);
      return `${h} ч ${min % 60} мин`;
    } catch {
      return '—';
    }
  }, [usage.sessionStart]);

  const rows: { icon: React.ReactNode; label: string; value: string; color: string }[] = [
    {
      icon: <Search className="h-4 w-4" />,
      label: 'Веб-поиск',
      value: String(usage.webSearchCalls),
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      icon: <Brain className="h-4 w-4" />,
      label: 'LLM-анализ',
      value: String(usage.llmCalls),
      color: 'text-violet-600 bg-violet-50',
    },
    {
      icon: <Database className="h-4 w-4" />,
      label: 'Из кэша',
      value: String(usage.cacheHits),
      color: 'text-slate-600 bg-slate-100',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-bold text-slate-900">Расход API</p>
        </div>
        <span className="text-[11px] text-slate-400">сессия: {sessionDuration}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-slate-100 bg-white p-2">
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md',
                r.color,
              )}
            >
              {r.icon}
            </span>
            <p className="mt-1.5 text-lg font-extrabold tabular-nums text-slate-900">
              {r.value}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {r.label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Всего запросов</span>
        <span className="text-sm font-extrabold tabular-nums text-slate-900">
          {usage.totalCalls}
        </span>
      </div>

      {activeLeagues && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Активные турниры (по сезону)
          </p>
          <div className="space-y-1 text-xs">
            {(
              [
                ['⚽ Футбол', activeLeagues.football],
                ['🏀 Баскетбол', activeLeagues.basketball],
                ['🎾 Теннис', activeLeagues.tennis],
                ['🏒 Хоккей', activeLeagues.hockey],
                ['🎮 Киберспорт', activeLeagues.esports],
              ] as [string, string[]][]
            ).map(([label, list]) => (
              <div key={label} className="flex items-start gap-2">
                <span className="shrink-0 font-medium text-slate-600">{label}</span>
                <span className="text-slate-500">
                  {list.length ? list.join(', ') : '— межсезонье'}
                </span>
              </div>
            ))}
          </div>
          {sportsSearched !== null && (
            <p className="text-[11px] text-slate-400">
              Поисковых запросов сегодня: {sportsSearched}
              {filteredOut !== null && filteredOut > 0 && (
                <span className="text-amber-600">
                  {' '}
                  · отсеяно не в сезоне: {filteredOut}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Счётчик накапливается за время работы сервера. Кэш (24 часа) и запросы
        из кэша не тарифицируются как новые вызовы веб-поиска и LLM.
      </p>
    </div>
  );
}
