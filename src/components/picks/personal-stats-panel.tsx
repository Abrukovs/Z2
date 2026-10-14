'use client';

import { useEffect, useReducer } from 'react';
import { motion } from 'framer-motion';
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Sparkles,
  Loader2,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/hooks/use-favorites';

interface FavoritePickInfo {
  id: string;
  team1: string;
  team2: string;
  sport: string;
  sportKey: string;
  sportIcon: string;
  league: string;
  market: string;
  selection: string;
  odds: string;
  confidence: string;
  confidenceScore: number;
  result: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
  pickDate: string;
}

interface UserStats {
  total: number;
  settled: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  profit: number;
  roi: number;
  picks: FavoritePickInfo[];
}

interface ApiResponse {
  success: boolean;
  stats: UserStats | null;
  error?: string;
}

interface State {
  loading: boolean;
  stats: UserStats | null;
  error: string | null;
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; stats: UserStats | null }
  | { type: 'error'; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { loading: true, stats: null, error: null };
    case 'loaded':
      return { loading: false, stats: action.stats, error: null };
    case 'error':
      return { loading: false, stats: null, error: action.error };
  }
}

export function PersonalStatsPanel({
  globalWinRate,
  globalProfit,
  globalRoi,
}: {
  globalWinRate: number;
  globalProfit: number;
  globalRoi: number;
}) {
  const { favorites } = useFavorites();
  const [state, dispatch] = useReducer(reducer, {
    loading: false,
    stats: null,
    error: null,
  });

  // Загружаем статистику по избранным пикам
  useEffect(() => {
    if (favorites.size === 0) {
      dispatch({ type: 'loaded', stats: null });
      return;
    }

    let cancelled = false;
    dispatch({ type: 'loading' });

    const ids = Array.from(favorites);
    fetch('/api/user-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (cancelled) return;
        if (d.success) {
          dispatch({ type: 'loaded', stats: d.stats });
        } else {
          dispatch({ type: 'error', error: d.error || 'Ошибка загрузки' });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          dispatch({ type: 'error', error: e instanceof Error ? e.message : 'Ошибка' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [favorites]);

  if (favorites.size === 0) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Личная статистика
          </h3>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Добавьте пики в избранное (❤️ на карточке), чтобы видеть персональную статистику —
          ваш винрейт, ROI и сравнение с общими показателями ИИ.
        </p>
      </Card>
    );
  }

  if (state.loading) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Личная статистика
          </h3>
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
        </div>
        <div className="mt-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </Card>
    );
  }

  if (state.error || !state.stats) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Личная статистика
          </h3>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {state.error || 'Нет данных по избранным пикам'}
        </p>
      </Card>
    );
  }

  const s = state.stats;
  const userWinRate = s.winRate;
  const userRoi = s.roi;
  const userProfit = s.profit;

  // Сравнения
  const winRateDiff = userWinRate - globalWinRate;
  const roiDiff = userRoi - globalRoi;
  const profitDiff = userProfit - globalProfit;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden p-0 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <h3 className="text-sm font-bold">Личная статистика</h3>
            </div>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm">
              {s.total} {s.total === 1 ? 'пик' : s.total < 5 ? 'пика' : 'пиков'}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-amber-50/90">
            Анализ пиков, которые вы отметили как избранные
          </p>
        </div>

        <div className="space-y-3 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCell
              icon={<Trophy className="h-3 w-3" />}
              label="Всего"
              value={String(s.total)}
              sub={`${s.settled} рассч.`}
            />
            <KpiCell
              icon={<Target className="h-3 w-3" />}
              label="Винрейт"
              value={`${userWinRate.toFixed(0)}%`}
              sub={`${s.won}В/${s.lost}П`}
              diff={winRateDiff}
            />
            <KpiCell
              icon={userProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              label="Прибыль"
              value={`${userProfit >= 0 ? '+' : ''}${userProfit.toFixed(2)}`}
              sub="ед."
              diff={profitDiff}
            />
            <KpiCell
              icon={userRoi >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              label="ROI"
              value={`${userRoi >= 0 ? '+' : ''}${userRoi.toFixed(1)}%`}
              sub={`ставок: ${s.settled}`}
              diff={roiDiff}
            />
          </div>

          {/* Сравнение с ИИ */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <Sparkles className="h-3 w-3 text-emerald-500" />
              Сравнение с общими пиками ИИ
            </p>
            <div className="space-y-1.5 text-xs">
              <CompareRow
                label="Винрейт"
                user={userWinRate}
                global={globalWinRate}
                suffix="%"
                higherBetter
              />
              <CompareRow
                label="ROI"
                user={userRoi}
                global={globalRoi}
                suffix="%"
                higherBetter
              />
              <CompareRow
                label="Прибыль"
                user={userProfit}
                global={globalProfit}
                suffix=" ед."
                higherBetter
              />
            </div>
          </div>

          {/* Последние избранные пики */}
          {s.picks.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Ваши избранные пики
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {s.picks.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="text-sm">{p.sportIcon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                        {p.team1} <span className="text-slate-400">vs</span> {p.team2}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {p.pickDate} · {p.market} · {p.odds}
                      </p>
                    </div>
                    <ResultChip result={p.result} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function KpiCell({
  icon,
  label,
  value,
  sub,
  diff,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  diff?: number;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">{sub}</p>
      {diff !== undefined && Math.abs(diff) > 0.1 && (
        <p
          className={cn(
            'mt-0.5 text-[10px] font-semibold tabular-nums',
            diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(1)} vs ИИ
        </p>
      )}
    </div>
  );
}

function CompareRow({
  label,
  user,
  global,
  suffix,
  higherBetter,
}: {
  label: string;
  user: number;
  global: number;
  suffix: string;
  higherBetter: boolean;
}) {
  const diff = user - global;
  const isBetter = higherBetter ? diff > 0 : diff < 0;
  const isWorse = higherBetter ? diff < 0 : diff > 0;
  const colorClass = isBetter
    ? 'text-emerald-600 dark:text-emerald-400'
    : isWorse
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="font-bold text-slate-700 dark:text-slate-200">
          {user >= 0 ? '+' : ''}{user.toFixed(1)}{suffix}
        </span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-slate-400 dark:text-slate-500">
          {global >= 0 ? '+' : ''}{global.toFixed(1)}{suffix}
        </span>
        <span className={cn('min-w-[40px] text-right text-[10px] font-bold', colorClass)}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function ResultChip({ result }: { result: FavoritePickInfo['result'] }) {
  if (result === 'won') {
    return (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        ВЫИГР
      </span>
    );
  }
  if (result === 'lost') {
    return (
      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        ПРОИГР
      </span>
    );
  }
  if (result === 'push') {
    return (
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        ВОЗВР
      </span>
    );
  }
  if (result === 'pending') {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        ОЖИД
      </span>
    );
  }
  return null;
}
