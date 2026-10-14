'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ErrorEntry {
  id: number;
  createdAt: string;
  date: string;
  category: string;
  severity: string;
  message: string;
  details: string | null;
  resolved: boolean;
}

interface ErrorStats {
  total: number;
  byCategory: Record<string, number>;
  byDate: Record<string, number>;
}

const CATEGORY_LABELS: Record<string, string> = {
  picks: 'Генерация пиков',
  'cross-check': 'Cross-check',
  validation: 'Валидация',
  server: 'Сервер',
  data: 'Данные',
  wta: 'Женский теннис (WTA)',
  atp: 'Мужской теннис (ATP)',
};

const SEVERITY_STYLES = {
  error: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  info: { icon: Info, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' },
};

export function ErrorJournalPanel() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const fetchErrors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/error-log?resolved=${showResolved}&limit=30`);
      const data = await res.json();
      if (data.success) {
        setErrors(data.errors);
        setStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, [showResolved]);

  const resolveError = async (id: number) => {
    try {
      await fetch(`/api/error-log?id=${id}`, { method: 'PATCH' });
      fetchErrors();
    } catch {
      // ignore
    }
  };

  const severityIcon = (sev: string) => {
    const s = SEVERITY_STYLES[sev as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.warning;
    return s;
  };

  return (
    <Card className="overflow-hidden p-0">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-rose-500 to-amber-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <h3 className="text-sm font-bold">Журнал ошибок</h3>
              <p className="text-[11px] opacity-90">Отслеживание повторяющихся проблем</p>
            </div>
          </div>
          <button
            onClick={fetchErrors}
            disabled={loading}
            className="rounded-lg bg-white/20 p-1.5 transition-colors hover:bg-white/30"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Статистика по категориям */}
      {stats && stats.total > 0 && (
        <div className="border-b border-slate-100 bg-slate-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byCategory).map(([cat, count]) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200"
              >
                {CATEGORY_LABELS[cat] || cat}: <b className="text-slate-900">{count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Переключатель: активные / все */}
      <div className="flex gap-1 border-b border-slate-100 p-2">
        <button
          onClick={() => setShowResolved(false)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-semibold transition-all',
            !showResolved ? 'bg-rose-100 text-rose-700' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          Активные ({!showResolved && stats ? stats.total : ''})
        </button>
        <button
          onClick={() => setShowResolved(true)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-semibold transition-all',
            showResolved ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          Все ошибки
        </button>
      </div>

      {/* Список ошибок */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-slate-400">Загрузка...</div>
        ) : errors.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Ошибок нет!</p>
            <p className="text-xs text-slate-400">Система работает стабильно</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {errors.map((err, i) => {
              const sev = severityIcon(err.severity);
              const Icon = sev.icon;
              return (
                <motion.div
                  key={err.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn('flex items-start gap-2 p-3', sev.bg, err.resolved && 'opacity-50')}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', sev.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                        {CATEGORY_LABELS[err.category] || err.category}
                      </span>
                      <span className="text-[10px] text-slate-400">{err.date}</span>
                      {err.resolved && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Решено
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium leading-snug text-slate-700">
                      {err.message}
                    </p>
                    {err.details && (
                      <p className="mt-0.5 text-[10px] leading-snug text-slate-400 line-clamp-2">
                        {err.details}
                      </p>
                    )}
                  </div>
                  {!err.resolved && (
                    <button
                      onClick={() => resolveError(err.id)}
                      className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                      title="Отметить как решённое"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
