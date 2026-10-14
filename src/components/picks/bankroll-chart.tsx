'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Wallet, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BankrollPoint {
  date: string;
  bankroll: number;
  profit: number;
  peak: number;
  drawdown: number;
}

interface BankrollChartProps {
  data: BankrollPoint[];
  maxDrawdown: number;
  startBankroll?: number;
  crossCheckData?: BankrollPoint[];  // кривая с учётом cross-check
  maxDrawdownCrossCheck?: number;
}

function shortDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function BankrollChart({ data, maxDrawdown, startBankroll = 100, crossCheckData, maxDrawdownCrossCheck }: BankrollChartProps) {
  const currentBankroll = data.length > 0 ? data[data.length - 1].bankroll : startBankroll;
  const totalProfit = currentBankroll - startBankroll;
  const isProfit = totalProfit >= 0;
  const profitColor = isProfit ? '#10b981' : '#f43f5e';

  // Cross-check bankroll (если есть)
  const ccCurrent = crossCheckData && crossCheckData.length > 0 ? crossCheckData[crossCheckData.length - 1].bankroll : null;
  const ccProfit = ccCurrent !== null ? ccCurrent - startBankroll : null;
  const ccIsProfit = ccProfit !== null ? ccProfit >= 0 : false;
  const ccColor = ccIsProfit ? '#f59e0b' : '#f43f5e';

  // Объединяем данные для сравнительного графика
  const chartData = useMemo(() => {
    if (!crossCheckData || crossCheckData.length === 0) return data;
    // Merge by date
    const map = new Map<string, { date: string; bankroll: number; ccBankroll?: number }>();
    data.forEach(d => map.set(d.date, { date: d.date, bankroll: d.bankroll }));
    crossCheckData.forEach(d => {
      const e = map.get(d.date);
      if (e) e.ccBankroll = d.bankroll;
      else map.set(d.date, { date: d.date, bankroll: startBankroll, ccBankroll: d.bankroll });
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, crossCheckData, startBankroll]);

  const peakBankroll = useMemo(() => {
    return data.reduce((max, d) => (d.peak > max ? d.peak : max), startBankroll);
  }, [data, startBankroll]);

  const minBankroll = useMemo(() => {
    if (data.length === 0) return startBankroll;
    return Math.min(...data.map((d) => d.bankroll));
  }, [data, startBankroll]);

  return (
    <Card className="p-4 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Кривая банкролла
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Старт {startBankroll} ед. · {data.length} дней · обновление по settled пикам
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Текущий банк */}
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Текущий банк</p>
            <p className={cn('text-lg font-extrabold tabular-nums', isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              {currentBankroll.toFixed(2)}
            </p>
          </div>
          {/* Изменение */}
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Изменение</p>
            <p className={cn('text-lg font-extrabold tabular-nums', isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              {isProfit ? '+' : ''}{totalProfit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* График */}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={profitColor} stopOpacity={0.35} />
                <stop offset="95%" stopColor={profitColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={['auto', 'auto']}
            />
            {/* Стартовая линия */}
            <ReferenceLine y={startBankroll} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
              labelFormatter={(label) => `Дата: ${shortDate(String(label))}`}
              formatter={(value: number, name: string) => {
                if (name === 'bankroll') return [`${value.toFixed(2)} ед.`, 'Банк'];
                if (name === 'peak') return [`${value.toFixed(2)} ед.`, 'Пик'];
                return [value, name];
              }}
            />
            {/* Линия пика (peak) — пунктирная */}
            <Line
              type="monotone"
              dataKey="peak"
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              opacity={0.5}
            />
            {/* Основная кривая банкролла (стандартная — 1 ед на пик) */}
            <Area
              type="monotone"
              dataKey="bankroll"
              stroke={profitColor}
              strokeWidth={2.5}
              fill="url(#bankrollGradient)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              name="bankroll"
            />
            {/* Cross-check кривая (disagree = 2 ставки) */}
            {crossCheckData && crossCheckData.length > 0 && (
              <Line
                type="monotone"
                dataKey="ccBankroll"
                stroke={ccColor}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                name="ccBankroll"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Легенда если есть cross-check */}
      {crossCheckData && crossCheckData.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-4" style={{ backgroundColor: profitColor }} /> Стандарт (1 ед/пик)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: ccColor }} /> Cross-check (disagree=2 ед)
          </span>
        </div>
      )}

      {/* Метрики под графиком */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip
          icon={<ArrowUpFromLine className="h-3 w-3" />}
          label="Пик банка"
          value={peakBankroll.toFixed(2)}
          accent="emerald"
        />
        <MetricChip
          icon={<ArrowDownToLine className="h-3 w-3" />}
          label="Минимум"
          value={minBankroll.toFixed(2)}
          accent="rose"
        />
        <MetricChip
          icon={<TrendingDown className="h-3 w-3" />}
          label="Макс. просадка"
          value={`${maxDrawdown.toFixed(1)}%`}
          accent={maxDrawdown > 20 ? 'rose' : 'amber'}
        />
        <MetricChip
          icon={<TrendingUp className="h-3 w-3" />}
          label="ROI всего"
          value={`${((totalProfit / startBankroll) * 100).toFixed(1)}%`}
          accent={isProfit ? 'emerald' : 'rose'}
        />
      </div>
    </Card>
  );
}

function MetricChip({
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
