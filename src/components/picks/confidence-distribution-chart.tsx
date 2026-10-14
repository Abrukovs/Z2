'use client';

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceBucket {
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
}

interface ConfidenceDistributionChartProps {
  data: ConfidenceBucket[];
}

// Цвет по ROI: красный (отрицательный), жёлтый (около нуля), зелёный (положительный)
function getColorForRoi(roi: number, settled: number): string {
  if (settled === 0) return '#cbd5e1'; // slate-300 — нет данных
  if (roi > 10) return '#10b981'; // emerald
  if (roi > 0) return '#84cc16'; // lime
  if (roi > -10) return '#f59e0b'; // amber
  return '#f43f5e'; // rose
}

export function ConfidenceDistributionChart({ data }: ConfidenceDistributionChartProps) {
  // Находим «зону смерти» — бакет с худшим ROI (>=3 settled)
  const worstBucket = data
    .filter((b) => b.settled >= 3)
    .sort((a, b) => a.roi - b.roi)[0];
  const bestBucket = data
    .filter((b) => b.settled >= 3)
    .sort((a, b) => b.roi - a.roi)[0];

  const hasData = data.some((b) => b.total > 0);

  return (
    <Card className="p-4 dark:bg-slate-900">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Распределение по уверенности ИИ
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Где ИИ ошибается чаще? Анализ ROI по бакетам уверенности
        </p>
      </div>

      {!hasData ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">
          Недостаточно данных для анализа
        </div>
      ) : (
        <>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string, props) => {
                    const b = props.payload as ConfidenceBucket;
                    if (name === 'roi') {
                      return [
                        <span key="v">
                          <div><b>ROI:</b> {value >= 0 ? '+' : ''}{value.toFixed(1)}%</div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>
                            В/П: {b.won}/{b.lost} · Винрейт: {b.winRate.toFixed(0)}% · Прибыль: {b.profit >= 0 ? '+' : ''}{b.profit.toFixed(2)}
                          </div>
                        </span>,
                        'ROI',
                      ];
                    }
                    return [value, name];
                  }}
                />
                <Bar dataKey="roi" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {data.map((b, i) => (
                    <Cell key={i} fill={getColorForRoi(b.roi, b.settled)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Инсайты под графиком */}
          <div className="mt-3 space-y-1.5">
            {bestBucket && bestBucket.roi > 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-emerald-50 p-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <b>Лучшая зона:</b> {bestBucket.range} · ROI +{bestBucket.roi.toFixed(1)}% ·
                  винрейт {bestBucket.winRate.toFixed(0)}% ({bestBucket.won}В/{bestBucket.lost}П)
                </span>
              </div>
            )}
            {worstBucket && worstBucket.roi < 0 && (
              <div className="flex items-start gap-1.5 rounded-md bg-rose-50 p-2 text-[11px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <b>Зона риска:</b> {worstBucket.range} · ROI {worstBucket.roi.toFixed(1)}% ·
                  винрейт {worstBucket.winRate.toFixed(0)}% ({worstBucket.won}В/{worstBucket.lost}П) —
                  рассмотрите фильтр в настройках
                </span>
              </div>
            )}
          </div>

          {/* Легенда цветов */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#10b981' }} /> ROI &gt; 10%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#84cc16' }} /> 0-10%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} /> -10-0%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#f43f5e' }} /> &lt; -10%
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
