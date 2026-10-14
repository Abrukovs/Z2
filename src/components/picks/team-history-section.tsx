'use client';

import { useReducer, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamStats, TeamMatch } from '@/lib/stats-service';

interface TeamHistorySectionProps {
  team1: string;
  team2: string;
}

interface TeamStatsResponse {
  success: boolean;
  stats: TeamStats | null;
  message?: string;
}

interface TeamState {
  stats1: TeamStats | null;
  stats2: TeamStats | null;
  loading1: boolean;
  loading2: boolean;
}

type TeamAction =
  | { type: 'reset' }
  | { type: 'loaded'; which: 1 | 2; stats: TeamStats | null }
  | { type: 'done'; which: 1 | 2 };

function reducer(state: TeamState, action: TeamAction): TeamState {
  switch (action.type) {
    case 'reset':
      return { stats1: null, stats2: null, loading1: true, loading2: true };
    case 'loaded':
      return action.which === 1
        ? { ...state, stats1: action.stats }
        : { ...state, stats2: action.stats };
    case 'done':
      return action.which === 1
        ? { ...state, loading1: false }
        : { ...state, loading2: false };
  }
}

function WinRateBadge({ winRate, settled }: { winRate: number; settled: number }) {
  if (settled === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Minus className="h-2.5 w-2.5" />
        нет данных
      </span>
    );
  }
  const isGood = winRate >= 60;
  const isBad = winRate < 40;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        isGood
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : isBad
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      )}
    >
      {isGood ? <TrendingUp className="h-2.5 w-2.5" /> : isBad ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
      {winRate.toFixed(0)}%
    </span>
  );
}

function MiniMatchRow({ m }: { m: TeamMatch }) {
  const resultIcon =
    m.result === 'won' ? '✓' :
    m.result === 'lost' ? '✗' :
    m.result === 'push' ? '=' :
    m.result === 'pending' ? '·' : '?';
  const resultCls =
    m.result === 'won' ? 'text-emerald-600 dark:text-emerald-400' :
    m.result === 'lost' ? 'text-rose-600 dark:text-rose-400' :
    m.result === 'push' ? 'text-slate-500' :
    'text-slate-400';

  const dateStr = m.pickDate
    ? new Date(m.pickDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : '—';

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <span className={cn('text-sm font-bold tabular-nums w-4 text-center', resultCls)}>
        {resultIcon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-700 dark:text-slate-200">
          {m.team1} <span className="text-slate-400">vs</span> {m.team2}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {dateStr} · {m.sportIcon} {m.league}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-slate-400">{m.market}</p>
        <p className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {m.odds}
        </p>
      </div>
    </div>
  );
}

function TeamCard({
  name,
  stats,
  loading,
}: {
  name: string;
  stats: TeamStats | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200" title={name}>
          {name}
        </p>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : stats ? (
          <WinRateBadge winRate={stats.winRate} settled={stats.settledMatches} />
        ) : (
          <span className="text-[10px] text-slate-400">нет данных</span>
        )}
      </div>
      {/* Streak badge — показываем только если есть активная серия */}
      {!loading && stats && stats.streak && stats.streak.type !== 'none' && (
        <div
          className={cn(
            'mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
            stats.streak.type === 'hot'
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
              : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
          )}
          title={stats.streak.label}
        >
          {stats.streak.type === 'hot' ? '🔥' : '❄️'}
          <span className="tabular-nums">{stats.streak.count}</span>
          {stats.streak.type === 'hot' ? ' побед' : ' поражений'}
        </div>
      )}
      {loading ? (
        <div className="mt-2 space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Всего: <b className="text-slate-700 dark:text-slate-200">{stats.totalMatches}</b>
            </span>
            <span>
              В/П: <b className="text-emerald-600 dark:text-emerald-400">{stats.wonPicks}</b>
              <span className="text-slate-400">/</span>
              <b className="text-rose-600 dark:text-rose-400">{stats.lostPicks}</b>
            </span>
          </div>
          {stats.lastMatches.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {stats.lastMatches.slice(0, 3).map((m) => (
                <MiniMatchRow key={m.id} m={m} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          <AlertCircle className="h-3 w-3" />
          В архиве нет пиков с этой командой
        </p>
      )}
    </div>
  );
}

export function TeamHistorySection({ team1, team2 }: TeamHistorySectionProps) {
  const [state, dispatch] = useReducer(reducer, {
    stats1: null,
    stats2: null,
    loading1: true,
    loading2: true,
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'reset' });

    const loadTeam = async (which: 1 | 2, name: string) => {
      try {
        const res = await fetch(`/api/team-stats?team=${encodeURIComponent(name)}&limit=3`);
        const d: TeamStatsResponse = await res.json();
        if (cancelled) return;
        if (d.success) {
          dispatch({ type: 'loaded', which, stats: d.stats });
        }
      } catch {
        // silent fail — секция не критична
      } finally {
        if (!cancelled) dispatch({ type: 'done', which });
      }
    };

    loadTeam(1, team1);
    loadTeam(2, team2);

    return () => {
      cancelled = true;
    };
  }, [team1, team2]);

  const hasAnyData =
    state.stats1 || state.stats2 || state.loading1 || state.loading2;

  if (!hasAnyData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
        <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        История команд в архиве
      </h3>
      <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
        Статистика пиков с участием этих команд из прошлых матчей
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TeamCard name={team1} stats={state.stats1} loading={state.loading1} />
        <TeamCard name={team2} stats={state.stats2} loading={state.loading2} />
      </div>
    </motion.div>
  );
}
