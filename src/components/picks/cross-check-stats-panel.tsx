'use client';

import { useEffect, useReducer } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrossCheckStats {
  total: number;
  checked: number;
  agree: number;
  disagree: number;
  uncertain: number;
  agreeWinRate: number;
  disagreeWinRate: number;
  agreeRoi: number;
  disagreeRoi: number;
}

interface State {
  loading: boolean;
  stats: CrossCheckStats | null;
}

type Action = { type: 'loading' } | { type: 'loaded'; stats: CrossCheckStats | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { loading: true, stats: null };
    case 'loaded':
      return { loading: false, stats: action.stats };
  }
}

export function CrossCheckStatsPanel() {
  const [state, dispatch] = useReducer(reducer, { loading: true, stats: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'loading' });
    fetch('/api/cross-check', { cache: 'no-store' })
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
  }, []);

  if (state.loading) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Cross-check: Z.ai + Nemotron
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

  if (!state.stats || state.stats.checked === 0) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Cross-check: Z.ai + Nemotron
          </h3>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Пока нет пиков, проверенных двумя ИИ. Cross-check запускается автоматически
          при генерации новых пиков, или через API.
        </p>
      </Card>
    );
  }

  const s = state.stats;
  const agreePct = s.checked > 0 ? (s.agree / s.checked) * 100 : 0;
  const disagreePct = s.checked > 0 ? (s.disagree / s.checked) * 100 : 0;
  const uncertainPct = s.checked > 0 ? (s.uncertain / s.checked) * 100 : 0;

  // Инсайт: если disagree винрейт > agree винрейт — это сигнал
  const disagreeBetter = s.disagree >= 2 && s.disagreeWinRate > s.agreeWinRate;
  const agreeBetter = s.agree >= 3 && s.agreeWinRate > s.disagreeWinRate + 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden p-0 dark:bg-slate-900">
        {/* Header с градиентом */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <h3 className="text-sm font-bold">Cross-check: Z.ai + Nemotron</h3>
            </div>
            {/* Бейджи Z + C в header */}
            <div className="flex items-center gap-0.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[10px] font-bold">Z</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[10px] font-bold">N</span>
            </div>
          </div>
          <p className="mt-0.5 text-[10px] text-purple-50/90">
            Второе мнение от reasoning модели. Проверено: {s.checked} пиков
          </p>
        </div>

        <div className="space-y-3 p-4">
          {/* Легенда бейджей */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-[10px] dark:bg-slate-800/40">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Бейджи:</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-white">Z</span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-white">N</span>
              <span className="text-slate-500 dark:text-slate-400">— согласны</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-white">Z</span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 text-white">N</span>
              <span className="text-slate-500 dark:text-slate-400">— расхождение</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-white">Z</span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-400 text-white">N</span>
              <span className="text-slate-500 dark:text-slate-400">— не уверен</span>
            </span>
          </div>

          {/* Распределение согласий */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox
              icon={<span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-[9px] font-bold text-white">Z+N</span>}
              label="Согласны"
              value={s.agree}
              pct={agreePct}
              accent="emerald"
            />
            <StatBox
              icon={<span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 text-[9px] font-bold text-white">N</span>}
              label="Расхождение"
              value={s.disagree}
              pct={disagreePct}
              accent="rose"
            />
            <StatBox
              icon={<HelpCircle className="h-3.5 w-3.5" />}
              label="Не уверены"
              value={s.uncertain}
              pct={uncertainPct}
              accent="slate"
            />
          </div>

          {/* Сравнение винрейта */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <Sparkles className="h-3 w-3 text-emerald-500" />
              Сравнение винрейта и ROI
            </p>
            <div className="space-y-2 text-xs">
              <CompareRow
                label="✓ Оба ИИ согласны"
                winRate={s.agreeWinRate}
                roi={s.agreeRoi}
                count={s.agree}
                accent="emerald"
              />
              <CompareRow
                label="⚠ ИИ разошлись"
                winRate={s.disagreeWinRate}
                roi={s.disagreeRoi}
                count={s.disagree}
                accent="rose"
              />
            </div>
          </div>

          {/* Авто-инсайты */}
          {disagreeBetter && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>⚠ Внимательный инсайт:</b> Когда Nemotron <b>не согласен</b> с Z.ai,
                винрейт <b>{s.disagreeWinRate.toFixed(0)}%</b> (против {s.agreeWinRate.toFixed(0)}% при согласии),
                ROI <b>{s.disagreeRoi >= 0 ? '+' : ''}{s.disagreeRoi.toFixed(1)}%</b>.
                Расхождения — сигнал к особому вниманию!
              </span>
            </div>
          )}
          {agreeBetter && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>✅ Хороший инсайт:</b> Пики где оба ИИ согласны дают винрейт{' '}
                <b>{s.agreeWinRate.toFixed(0)}%</b> (против {s.disagreeWinRate.toFixed(0)}% при расхождении).
                Фильтруйте по бейджу <span className="font-bold">Z+N зелёные</span> для повышения точности.
              </span>
            </div>
          )}
          {!disagreeBetter && !agreeBetter && s.disagree < 2 && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
              <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Недостаточно расхождений ({s.disagree}) для статистически значимого сравнения.
                Нужно минимум 2 пика с расхождением.
              </span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function StatBox({
  icon,
  label,
  value,
  pct,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  accent: 'emerald' | 'rose' | 'amber' | 'slate';
}) {
  const accents: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <div className={cn('rounded-lg p-2.5', accents[accent])}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] opacity-70">{pct.toFixed(0)}%</p>
    </div>
  );
}

function CompareRow({
  label,
  winRate,
  roi,
  count,
  accent,
}: {
  label: string;
  winRate: number;
  roi: number;
  count: number;
  accent: 'emerald' | 'rose';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="text-[10px] text-slate-400">({count})</span>
        <span className={cn('font-bold', winRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
          {winRate.toFixed(0)}%
        </span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className={cn('font-bold', roi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
          {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
