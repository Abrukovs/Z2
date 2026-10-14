'use client';

import { useEffect, useReducer } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Target,
  Flame,
  Snowflake,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TeamMatchInfo {
  id: string;
  pickDate: string;
  team1: string;
  team2: string;
  market: string;
  selection: string;
  odds: string;
  result: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
  confidenceScore: number;
  league: string;
  sport: string;
  sportKey: string;
  sportIcon: string;
}

interface TeamStatsInfo {
  team: string;
  totalMatches: number;
  settledMatches: number;
  wonPicks: number;
  lostPicks: number;
  winRate: number;
  lastMatches: TeamMatchInfo[];
  byLeague: { league: string; count: number; winRate: number }[];
  streak: {
    type: 'hot' | 'cold' | 'none';
    count: number;
    label: string;
  };
}

interface TeamDetailDialogProps {
  team: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface State {
  loading: boolean;
  stats: TeamStatsInfo | null;
}

type Action = { type: 'loading' } | { type: 'loaded'; stats: TeamStatsInfo | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { loading: true, stats: null };
    case 'loaded':
      return { loading: false, stats: action.stats };
  }
}

function shortDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function TeamDetailDialog({ team, open, onOpenChange }: TeamDetailDialogProps) {
  const [state, dispatch] = useReducer(reducer, { loading: false, stats: null });

  useEffect(() => {
    if (!open || !team) return;
    let cancelled = false;
    dispatch({ type: 'loading' });

    fetch(`/api/team-stats?team=${encodeURIComponent(team)}&limit=10`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) {
          dispatch({ type: 'loaded', stats: d.stats });
        } else {
          dispatch({ type: 'loaded', stats: null });
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'loaded', stats: null });
      });

    return () => {
      cancelled = true;
    };
  }, [open, team]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-0 border-b border-slate-100 p-5 pb-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                    {team || 'Команда'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                    Полная статистика команды в архиве пиков
                  </DialogDescription>
                </div>
              </div>
            </div>
            {state.loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {state.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : !state.stats ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Нет данных по этой команде в архиве
              </p>
            </div>
          ) : (
            <>
              {/* KPI */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                <KpiCard
                  icon={<Trophy className="h-3.5 w-3.5" />}
                  label="Всего"
                  value={String(state.stats.totalMatches)}
                  sub={`${state.stats.settledMatches} рассч.`}
                  accent="emerald"
                />
                <KpiCard
                  icon={<Target className="h-3.5 w-3.5" />}
                  label="Винрейт"
                  value={`${state.stats.winRate.toFixed(0)}%`}
                  sub={`${state.stats.wonPicks}В/${state.stats.lostPicks}П`}
                  accent={state.stats.winRate >= 50 ? 'emerald' : 'rose'}
                />
                <KpiCard
                  icon={state.stats.streak.type === 'hot' ? <Flame className="h-3.5 w-3.5" /> : state.stats.streak.type === 'cold' ? <Snowflake className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                  label="Серия"
                  value={state.stats.streak.type === 'none' ? '—' : `${state.stats.streak.count}`}
                  sub={state.stats.streak.type === 'hot' ? 'побед' : state.stats.streak.type === 'cold' ? 'поражений' : 'нет'}
                  accent={state.stats.streak.type === 'hot' ? 'emerald' : state.stats.streak.type === 'cold' ? 'rose' : 'slate'}
                />
                <KpiCard
                  icon={state.stats.winRate >= 50 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  label="Форма"
                  value={state.stats.lastMatches.slice(0, 5).map((m) => m.result === 'won' ? 'В' : m.result === 'lost' ? 'П' : '—').join('')}
                  sub="последние 5"
                  accent="slate"
                />
              </motion.div>

              {/* Streak badge */}
              {state.stats.streak.type !== 'none' && (
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold',
                    state.stats.streak.type === 'hot'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                      : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
                  )}
                >
                  {state.stats.streak.type === 'hot' ? '🔥' : '❄️'}
                  {state.stats.streak.label}
                </div>
              )}

              {/* По лигам */}
              {state.stats.byLeague.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    По лигам
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {state.stats.byLeague.map((l) => (
                      <div
                        key={l.league}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-200">{l.league}</span>
                        <span className="text-slate-400">{l.count} пик.</span>
                        <span
                          className={cn(
                            'rounded px-1 py-0.5 text-[10px] font-bold',
                            l.winRate >= 60
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : l.winRate >= 40
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                          )}
                        >
                          {l.winRate.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Последние матчи */}
              {state.stats.lastMatches.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    Последние матчи ({state.stats.lastMatches.length})
                  </h3>
                  <div className="space-y-1">
                    {state.stats.lastMatches.map((m, i) => (
                      <MatchRow key={m.id} match={m} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: 'emerald' | 'rose' | 'amber' | 'slate';
}) {
  const accents: Record<string, { bg: string; text: string; value: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', value: 'text-emerald-700' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', value: 'text-rose-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', value: 'text-amber-700' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', value: 'text-slate-900' },
  };
  const a = accents[accent];
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded', a.bg, a.text)}>
          {icon}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <p className={cn('mt-1 text-base font-extrabold tabular-nums', a.value)}>{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}

function MatchRow({ match, index }: { match: TeamMatchInfo; index: number }) {
  const resultIcon =
    match.result === 'won' ? '✓' :
    match.result === 'lost' ? '✗' :
    match.result === 'push' ? '=' :
    match.result === 'pending' ? '·' : '?';
  const resultCls =
    match.result === 'won' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
    match.result === 'lost' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' :
    match.result === 'push' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' :
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold', resultCls)}>
        {resultIcon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
          {match.team1} <span className="text-slate-400">vs</span> {match.team2}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          <Clock className="h-2.5 w-2.5" />
          {shortDate(match.pickDate)}
          <span>·</span>
          <span>{match.sportIcon} {match.league}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] text-slate-400">{match.market}</p>
        <p className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {match.odds}
        </p>
      </div>
    </motion.div>
  );
}
