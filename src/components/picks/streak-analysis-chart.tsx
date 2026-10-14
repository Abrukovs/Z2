'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import {
  Flame,
  Snowflake,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakAnalysis {
  maxWinStreak: number;
  maxLossStreak: number;
  avgWinStreak: number;
  avgLossStreak: number;
  totalWinStreaks: number;
  totalLossStreaks: number;
  distribution: { length: number; count: number; type: 'won' | 'lost' }[];
  recoveryTime: { avg: number; max: number };
}

interface StreakAnalysisChartProps {
  data: StreakAnalysis;
}

export function StreakAnalysisChart({ data }: StreakAnalysisChartProps) {
  // Преобразуем distribution в формат для BarChart
  // Группируем по длине: won count + lost count рядом
  const allLengths = useMemo(() => {
    const set = new Set<number>();
    data.distribution.forEach((d) => set.add(d.length));
    return Array.from(set).sort((a, b) => a - b);
  }, [data.distribution]);

  const chartData = allLengths.map((len) => {
    const won = data.distribution.find((d) => d.length === len && d.type === 'won')?.count || 0;
    const lost = data.distribution.find((d) => d.length === len && d.type === 'lost')?.count || 0;
    return { length: len, label: len >= 10 ? '10+' : `${len}`, won, lost };
  });

  const hasData = chartData.length > 0;

  return (
    <Card className="p-4 dark:bg-slate-900">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Анализ серий побед и поражений
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Распределение серий по длине — для оценки психологической устойчивости стратегии
        </p>
      </div>

      {/* Метрики */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricBox
          icon={<Flame className="h-3 w-3" />}
          label="Макс. побед"
          value={`${data.maxWinStreak}`}
          accent="emerald"
        />
        <MetricBox
          icon={<Snowflake className="h-3 w-3" />}
          label="Макс. пораж."
          value={`${data.maxLossStreak}`}
          accent="rose"
        />
        <MetricBox
          icon={<TrendingUp className="h-3 w-3" />}
          label="Ср. побед"
          value={data.avgWinStreak.toFixed(1)}
          accent="emerald"
        />
        <MetricBox
          icon={<TrendingDown className="h-3 w-3" />}
          label="Ср. пораж."
          value={data.avgLossStreak.toFixed(1)}
          accent="rose"
        />
      </div>

      {hasData ? (
        <>
          {/* Гистограмма */}
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'длина серии', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: '#94a3b8' } }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    const label = name === 'won' ? 'Серий побед' : 'Серий поражений';
                    return [`${value} раз`, label];
                  }}
                />
                {/* Серии побед — зелёные */}
                <Bar dataKey="won" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} name="won" />
                {/* Серии поражений — красные, рядом */}
                <Bar dataKey="lost" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={28} name="lost" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Легенда */}
          <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Серии побед ({data.totalWinStreaks})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rose-500" /> Серии поражений ({data.totalLossStreaks})
            </span>
          </div>

          {/* Recovery time */}
          {data.recoveryTime.avg > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-cyan-50 p-2.5 text-[11px] text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                <b>Время восстановления:</b> в среднем {data.recoveryTime.avg.toFixed(1)} дн.
                (макс {data.recoveryTime.max} дн.) после просадки банка
              </span>
            </div>
          )}

          {/* Предупреждение о риске руины */}
          {data.maxLossStreak >= 4 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>Внимание:</b> макс. серия поражений {data.maxLossStreak} подряд.
                При ставке 5% от банка на пик — просадка {data.maxLossStreak * 5}%.
                Рассмотрите уменьшение размера ставки или фильтрацию по уверенности.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">
          Недостаточно данных для анализа серий
        </div>
      )}
    </Card>
  );
}

function MetricBox({
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
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5', accents[accent])}>
      {icon}
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
        <p className="text-xs font-extrabold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
