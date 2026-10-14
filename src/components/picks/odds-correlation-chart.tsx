'use client';

import {
  Bar,
  BarChart,
  Cell,
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
import { ScatterChart, AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OddsBucket {
  range: string;
  min: number;
  max: number;
  total: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
  avgOdds: number;
}

interface OddsCorrelationChartProps {
  data: OddsBucket[];
}

function getColorForRoi(roi: number, settled: number): string {
  if (settled === 0) return '#cbd5e1';
  if (roi > 10) return '#10b981';
  if (roi > 0) return '#84cc16';
  if (roi > -10) return '#f59e0b';
  return '#f43f5e';
}

export function OddsCorrelationChart({ data }: OddsCorrelationChartProps) {
  const hasData = data.some((b) => b.total > 0);

  // Находим «слепую зону» — бакет с худшим ROI (>=3 settled)
  const worstBucket = data
    .filter((b) => b.settled >= 3)
    .sort((a, b) => a.roi - b.roi)[0];
  const bestBucket = data
    .filter((b) => b.settled >= 3)
    .sort((a, b) => b.roi - a.roi)[0];

  // Для линии тренда winrate — берём только бакеты с данными
  const trendData = data.filter((b) => b.settled > 0);

  return (
    <Card className="p-4 dark:bg-slate-900">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <ScatterChart className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          Корреляция коэффициента и винрейта
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          На каких коэффициентах ИИ ошибается чаще? Анализ ROI по диапазонам кэфов
        </p>
      </div>

      {!hasData ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">
          Недостаточно данных для анализа
        </div>
      ) : (
        <>
          {/* Комбинированный график: Bar (winRate) + Line (ROI) */}
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                {/* Левая ось — winRate */}
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={[0, 100]}
                  unit="%"
                />
                {/* Правая ось — ROI */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  unit="%"
                />
                <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" strokeWidth={1} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string, props) => {
                    const b = props.payload as OddsBucket;
                    if (name === 'winRate') {
                      return [
                        <span key="v">
                          <div><b>Винрейт:</b> {value.toFixed(1)}%</div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>
                            В/П: {b.won}/{b.lost} · ROI: {b.roi >= 0 ? '+' : ''}{b.roi.toFixed(1)}% · ср.кэф {b.avgOdds.toFixed(2)}
                          </div>
                        </span>,
                        'Винрейт',
                      ];
                    }
                    return [`${value.toFixed(1)}%`, 'ROI'];
                  }}
                />
                {/* Bar — винрейт */}
                <Bar yAxisId="left" dataKey="winRate" radius={[3, 3, 0, 0]} maxBarSize={48} name="winRate">
                  {data.map((b, i) => (
                    <Cell key={i} fill={getColorForRoi(b.roi, b.settled)} />
                  ))}
                </Bar>
                {/* Line — ROI (правая ось) */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="roi"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#8b5cf6' }}
                  name="roi"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Инсайты */}
          <div className="mt-3 space-y-1.5">
            {bestBucket && bestBucket.roi > 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-emerald-50 p-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <b>Прибыльная зона:</b> кэф {bestBucket.range} · ROI +{bestBucket.roi.toFixed(1)}% ·
                  винрейт {bestBucket.winRate.toFixed(0)}% ({bestBucket.won}В/{bestBucket.lost}П)
                </span>
              </div>
            )}
            {worstBucket && worstBucket.roi < 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-rose-50 p-2 text-[11px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <b>Слепая зона:</b> кэф {worstBucket.range} · ROI {worstBucket.roi.toFixed(1)}% ·
                  винрейт {worstBucket.winRate.toFixed(0)}% ({worstBucket.won}В/{worstBucket.lost}П) —
                  ИИ переоценивает исходы в этом диапазоне
                </span>
              </div>
            )}
          </div>

          {/* Легенда */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#10b981' }} /> Bar — винрейт
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3" style={{ backgroundColor: '#8b5cf6' }} /> Линия — ROI
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> Цвет = ROI
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
