'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Flame, Crown, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayStat {
  date: string;
  picks: number;
  settled: number;
  won: number;
  lost: number;
  profit: number;
  cumulativeProfit: number;
  roi: number;
}

interface SportStat {
  sportKey: string;
  sport: string;
  icon: string;
  total: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
}

interface ChartsPanelProps {
  byDay: DayStat[];
  bySport: SportStat[];
  streak: { current: number; type: 'won' | 'lost' | 'none'; best: number };
  profit: number;
  roi: number;
}

// Палитра для видов спорта (без indigo/blue по требованиям проекта)
const SPORT_COLORS: Record<string, string> = {
  baseball: '#f59e0b',    // amber
  basketball: '#f97316',  // orange
  football: '#10b981',    // emerald
  tennis: '#84cc16',      // lime
  hockey: '#06b6d4',      // cyan (не blue)
  esports: '#a855f7',     // purple
  volleyball: '#ec4899',  // pink
};
const FALLBACK_COLORS = ['#10b981', '#f59e0b', '#f97316', '#84cc16', '#a855f7', '#ec4899', '#06b6d4'];

function shortDate(iso: string): string {
  // YYYY-MM-DD -> DD.MM
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}`;
}

export function ChartsPanel({ byDay, bySport, streak, profit, roi }: ChartsPanelProps) {
  // Pie data: только виды спорта с >0 пиков
  const pieData = useMemo(() => {
    return bySport
      .filter((s) => s.total > 0)
      .map((s) => ({
        name: s.sport,
        value: s.total,
        color: SPORT_COLORS[s.sportKey] || FALLBACK_COLORS[bySport.indexOf(s) % FALLBACK_COLORS.length],
        icon: s.icon,
      }));
  }, [bySport]);

  const profitColor = profit >= 0 ? '#10b981' : '#f43f5e';

  const streakInfo = useMemo(() => {
    if (streak.type === 'won') {
      return { label: `${streak.current} побед подряд`, color: 'emerald', icon: <Flame className="h-4 w-4" /> };
    }
    if (streak.type === 'lost') {
      return { label: `${streak.current} поражений подряд`, color: 'rose', icon: <TrendingDown className="h-4 w-4" /> };
    }
    return { label: 'Нет активной серии', color: 'slate', icon: <TrendingUp className="h-4 w-4" /> };
  }, [streak]);

  const accentMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };

  return (
    <div className="space-y-5">
      {/* Streak + best */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('rounded-xl p-4 ring-1 ring-inset', accentMap[streakInfo.color])}>
          <div className="flex items-center gap-2">
            {streakInfo.icon}
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Текущая серия
            </p>
          </div>
          <p className="mt-1.5 text-lg font-extrabold tabular-nums">{streakInfo.label}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
          <div className="flex items-center gap-2 text-amber-700">
            <Crown className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Лучшая серия побед
            </p>
          </div>
          <p className="mt-1.5 text-lg font-extrabold tabular-nums text-amber-700">
            {streak.best} {streak.best === 1 ? 'победа' : streak.best < 5 ? 'победы' : 'побед'} подряд
          </p>
        </div>
      </div>

      {/* График динамики прибыли (нарастающий итог) */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Динамика прибыли
            </h3>
            <p className="text-[11px] text-slate-500">
              Нарастающий итог по дням · {byDay.length} дней
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Итог</p>
            <p
              className={cn(
                'text-base font-extrabold tabular-nums',
                profit >= 0 ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              {profit >= 0 ? '+' : ''}
              {profit.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={byDay} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
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
                width={36}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  padding: 0,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const dayData = payload[0]?.payload;
                  if (!dayData) return null;
                  return <DayPicksTooltipContent dayData={dayData} />;
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulativeProfit"
                stroke={profitColor}
                strokeWidth={2}
                fill="url(#profitGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* График ежедневной прибыли (bar) + распределение по видам спорта (pie) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Bar chart — ежедневная прибыль */}
        <Card className="p-4 lg:col-span-3">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">Прибыль по дням</h3>
            <p className="text-[11px] text-slate-500">
              Зелёные столбцы — выигрышные дни, красные — убыточные
            </p>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={15}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  contentStyle={{ padding: 0, border: 'none', background: 'transparent' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const dayData = payload[0]?.payload;
                    if (!dayData) return null;
                    return <DayPicksTooltipContent dayData={dayData} />;
                  }}
                />
                <Bar dataKey="profit" radius={[3, 3, 0, 0]} maxBarSize={28}>
                  {byDay.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie chart — распределение по видам спорта */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">По видам спорта</h3>
            <p className="text-[11px] text-slate-500">Распределение всех пиков</p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="h-[160px] w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                    formatter={(value: number, _name, props) => [
                      `${value} ${value === 1 ? 'пик' : value < 5 ? 'пика' : 'пиков'}`,
                      `${props.payload.icon} ${props.payload.name}`,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-1 sm:w-1/2">
              {pieData.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.icon} {s.name}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-700">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ===== Кэш пиков по датам для tooltip =====
const dayPicksCache = new Map<string, DayPickInfo[]>();

interface DayPickInfo {
  team1: string;
  team2: string;
  icon: string;
  sportKey: string;
  market: string;
  selection: string;
  odds: string;
  result: string;
  homeScore: number | null;
  awayScore: number | null;
  confidenceScore: number | null;
  showN: boolean;
  crossCheck: string | null;
  crossCheckConfidence: number | null;
  zOnly: boolean;
}

async function fetchDayPicks(date: string): Promise<DayPickInfo[]> {
  if (dayPicksCache.has(date)) {
    return dayPicksCache.get(date)!;
  }
  try {
    const res = await fetch(`/api/picks-by-day?date=${date}`, { cache: 'force-cache' });
    const data = await res.json();
    if (data.success && data.picks) {
      dayPicksCache.set(date, data.picks);
      return data.picks;
    }
  } catch {
    // ignore
  }
  return [];
}

// Компонент tooltip с пиками для конкретного дня
function DayPicksTooltipContent({ dayData }: { dayData: any }) {
  const [picks, setPicks] = useState<DayPickInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDayPicks(dayData.date).then((p) => {
      if (!cancelled) {
        setPicks(p);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [dayData.date]);

  const profit = dayData.profit;
  const profitColor = profit >= 0 ? '#10b981' : '#f43f5e';
  const wonCount = picks.filter((p) => p.result === 'won').length;
  const lostCount = picks.filter((p) => p.result === 'lost').length;
  const pendingCount = picks.filter((p) => p.result === 'pending' || p.result === 'no_result').length;

  return (
    <div
      style={{
        minWidth: 280,
        maxWidth: 340,
        padding: 12,
        borderRadius: 10,
        background: '#fff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Шапка tooltip: дата + прибыль */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 8,
          marginBottom: 8,
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
          📅 {shortDate(dayData.date)}
        </span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: profitColor,
            background: profit >= 0 ? '#ecfdf5' : '#fef2f2',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {profit >= 0 ? '+' : ''}
          {profit.toFixed(2)} ед.
        </span>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
          ⏳ Загрузка пиков...
        </div>
      ) : picks.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
          Нет пиков за этот день
        </div>
      ) : (
        <>
          {/* Список пиков */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
            {picks.map((p, i) => {
              const won = p.result === 'won';
              const lost = p.result === 'lost';
              const pending = p.result === 'pending' || p.result === 'no_result';
              const push = p.result === 'push';

              // Цвет рамки по результату
              const borderColor = won ? '#10b981' : lost ? '#f43f5e' : push ? '#94a3b8' : 'transparent';
              const bgColor = won ? '#f0fdf4' : lost ? '#fef2f2' : '#f8fafc';

              // Cross-check бейдж (Z всегда, N если showN)
              const nAgree = p.crossCheck === 'agree';
              const nDisagree = p.crossCheck === 'disagree';

              // Счёт матча
              const hasScore = p.homeScore !== null && p.awayScore !== null;

              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 7px',
                    borderRadius: 6,
                    background: bgColor,
                    borderLeft: `3px solid ${borderColor}`,
                    fontSize: 11,
                  }}
                >
                  {/* Иконка результата */}
                  <span style={{ fontSize: 12, flexShrink: 0 }}>
                    {won ? '✅' : lost ? '❌' : push ? '↔️' : pending ? '⏳' : '•'}
                  </span>

                  {/* Иконка спорта */}
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{p.icon}</span>

                  {/* Команды */}
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                      color: '#334155',
                    }}
                  >
                    {truncateTeam(p.team1)} - {truncateTeam(p.team2)}
                  </span>

                  {/* Счёт (если есть) */}
                  {hasScore && (
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
                      {p.homeScore}:{p.awayScore}
                    </span>
                  )}

                  {/* Бейджи Z/N */}
                  <span style={{ display: 'inline-flex', gap: 1, flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: '#10b981',
                        color: '#fff',
                        fontSize: 8,
                        fontWeight: 800,
                      }}
                    >
                      Z
                    </span>
                    {p.showN && (nAgree || nDisagree) && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          background: nAgree ? '#10b981' : '#f43f5e',
                          color: '#fff',
                          fontSize: 8,
                          fontWeight: 800,
                        }}
                      >
                        N
                      </span>
                    )}
                  </span>

                  {/* Коэффициент */}
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 10,
                      color: '#475569',
                      flexShrink: 0,
                      minWidth: 28,
                      textAlign: 'right',
                    }}
                  >
                    {p.odds}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Подвал: статистика дня */}
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: '#64748b',
              fontWeight: 500,
            }}
          >
            <span>
              Всего: <b style={{ color: '#0f172a' }}>{picks.length}</b>
            </span>
            <span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>В: {wonCount}</span>
              {' · '}
              <span style={{ color: '#f43f5e', fontWeight: 700 }}>П: {lostCount}</span>
              {pendingCount > 0 && (
                <>
                  {' · '}
                  <span style={{ color: '#94a3b8' }}>⏳ {pendingCount}</span>
                </>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Обрезка длинных названий команд
function truncateTeam(name: string): string {
  if (name.length <= 14) return name;
  return name.slice(0, 12) + '..';
}
