'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  RefreshCw,
  Activity,
  BarChart3,
  Clock,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChartsPanel } from './charts-panel';
import { ExportStatsButton } from './export-stats-button';
import { BankrollChart } from './bankroll-chart';
import { ConfidenceDistributionChart } from './confidence-distribution-chart';
import { PersonalStatsPanel } from './personal-stats-panel';
import { StreakAnalysisChart } from './streak-analysis-chart';
import { OddsCorrelationChart } from './odds-correlation-chart';
import { TeamsLeaderboard } from './teams-leaderboard';
import { CrossCheckStatsPanel } from './cross-check-stats-panel';
import { ParadoxAnalysisChart } from './paradox-analysis-chart';
import { AdditionalStats, SectionWrapper } from './additional-stats';
import { ErrorJournalPanel } from './error-journal-panel';

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

interface ConfidenceStat {
  confidence: string;
  total: number;
  settled: number;
  won: number;
  winRate: number;
  roi: number;
}

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

interface BankrollPoint {
  date: string;
  bankroll: number;
  profit: number;
  peak: number;
  drawdown: number;
}

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

interface Stats {
  total: number;
  settled: number;
  pending: number;
  won: number;
  lost: number;
  push: number;
  noResult: number;
  winRate: number;
  totalStake: number;
  totalReturn: number;
  profit: number;
  roi: number;
  bySport: SportStat[];
  byConfidence: ConfidenceStat[];
  byDay: DayStat[];
  streak: { current: number; type: 'won' | 'lost' | 'none'; best: number };
  bankrollCurve?: BankrollPoint[];
  bankrollCurveCrossCheck?: BankrollPoint[];
  confidenceDistribution?: ConfidenceBucket[];
  maxDrawdown?: number;
  maxDrawdownCrossCheck?: number;
  bestDay?: DayStat | null;
  worstDay?: DayStat | null;
  streakAnalysis?: StreakAnalysisData;
  oddsCorrelation?: OddsBucketData[];
  teamsLeaderboard?: TeamLeaderData[];
}

interface StreakAnalysisData {
  maxWinStreak: number;
  maxLossStreak: number;
  avgWinStreak: number;
  avgLossStreak: number;
  totalWinStreaks: number;
  totalLossStreaks: number;
  distribution: { length: number; count: number; type: 'won' | 'lost' }[];
  recoveryTime: { avg: number; max: number };
}

interface OddsBucketData {
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

interface TeamLeaderData {
  team: string;
  sportKey: string;
  sport: string;
  icon: string;
  total: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
}

const CONF_LABELS: Record<string, string> = {
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
};

const CONF_COLORS: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-rose-100 text-rose-700',
};

type PeriodKey = 'all' | '30d' | '7d';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: 'all', label: 'Всё время' },
];

type SortKey = 'sport' | 'total' | 'settled' | 'winRate' | 'roi';
type SortDir = 'asc' | 'desc';

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchStats = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        // Нормализуем поля, которых может не быть в старом API
        setStats({
          ...data,
          byDay: data.byDay ?? [],
          streak: data.streak ?? { current: 0, type: 'none', best: 0 },
          bankrollCurve: data.bankrollCurve ?? [],
          bankrollCurveCrossCheck: data.bankrollCurveCrossCheck ?? [],
          confidenceDistribution: data.confidenceDistribution ?? [],
          maxDrawdown: data.maxDrawdown ?? 0,
          maxDrawdownCrossCheck: data.maxDrawdownCrossCheck ?? 0,
          bestDay: data.bestDay ?? null,
          worstDay: data.worstDay ?? null,
          streakAnalysis: data.streakAnalysis ?? null,
          oddsCorrelation: data.oddsCorrelation ?? [],
          teamsLeaderboard: data.teamsLeaderboard ?? [],
        });
      }
    } catch (e) {
      console.error('stats fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Фильтрация по периоду: берём последние N дней из byDay и пересчитываем сводку
  const filtered = useMemo(() => {
    if (!stats) return null;
    if (period === 'all') return stats;

    const days = period === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Фильтруем byDay по дате >= cutoff
    const byDay = stats.byDay.filter((d) => d.date >= cutoffStr);

    // Пересчитываем агрегаты по дням из filtered byDay
    // Но проще: пересчитать по всем settled пикам, чья pickDate в диапазоне.
    // У нас нет полного списка пиков в клиенте — используем byDay для приближённого пересчёта.
    let total = 0;
    let settled = 0;
    let won = 0;
    let lost = 0;
    let push = 0; // push не хранится по дням, пропускаем
    let pending = 0;
    let totalStake = 0;
    let totalReturn = 0;

    for (const d of byDay) {
      total += d.picks;
      settled += d.settled;
      won += d.won;
      lost += d.lost;
      if (d.profit >= 0) {
        // approximate: won-пики дали profit, lost — забрали
      }
      // stake = settled, return = settled + profit
      totalStake += d.settled;
      totalReturn += d.settled + d.profit;
    }

    const profit = Math.round((totalReturn - totalStake) * 100) / 100;
    const roi = totalStake > 0 ? Math.round((profit / totalStake) * 100 * 100) / 100 : 0;
    const winRate = settled > 0 ? (won / settled) * 100 : 0;

    return {
      ...stats,
      total,
      settled,
      won,
      lost,
      push,
      pending,
      winRate: Math.round(winRate * 100) / 100,
      totalStake,
      totalReturn: Math.round(totalReturn * 100) / 100,
      profit,
      roi,
      byDay,
    } as Stats;
  }, [stats, period]);

  // Сортировка по виду спорта
  const sortedBySport = useMemo(() => {
    if (!filtered) return [];
    const arr = [...filtered.bySport];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'sport') {
        cmp = a.sport.localeCompare(b.sport, 'ru');
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'sport' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-200" />
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <div className="h-32 animate-pulse rounded bg-slate-200" />
        </Card>
      </div>
    );
  }

  if (!filtered) {
    return (
      <Card className="p-6 text-center text-slate-500">
        Не удалось загрузить статистику
      </Card>
    );
  }

  const profitPositive = filtered.profit >= 0;
  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-emerald-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-emerald-600" />
    );
  };

  return (
    <div className="space-y-5">
      {/* Header + period filter + export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
            Статистика пиков
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Фильтр по периоду */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                  period === p.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {stats && <ExportStatsButton stats={stats} />}
          <Button
            onClick={fetchStats}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Обновить</span>
          </Button>
        </div>
      </div>

      {filtered.total === 0 ? (
        <Card className="p-8 text-center">
          <Activity className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">
            {period === 'all'
              ? 'Пока нет пиков для статистики'
              : `Нет пиков за последние ${period === '7d' ? '7' : '30'} дней`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Сгенерируйте пики на вкладке «Пики на сегодня» — статистика будет
            накапливаться автоматически.
          </p>
        </Card>
      ) : (
        <>
          {/* Главные метрики */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              icon={<Trophy className="h-4 w-4" />}
              label="Всего пиков"
              value={String(filtered.total)}
              sub={`${filtered.settled} рассчитано`}
              accent="emerald"
            />
            <MetricCard
              icon={<Target className="h-4 w-4" />}
              label="Винрейт"
              value={`${filtered.winRate.toFixed(1)}%`}
              sub={`${filtered.won}В / ${filtered.lost}П`}
              accent="slate"
            />
            <MetricCard
              icon={
                profitPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )
              }
              label="Прибыль"
              value={`${profitPositive ? '+' : ''}${filtered.profit.toFixed(2)}`}
              sub="ед. (по 1 ед./пик)"
              accent={profitPositive ? 'emerald' : 'rose'}
            />
            <MetricCard
              icon={
                profitPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )
              }
              label="ROI"
              value={`${filtered.roi >= 0 ? '+' : ''}${filtered.roi.toFixed(1)}%`}
              sub={`ставок: ${filtered.totalStake}`}
              accent={profitPositive ? 'emerald' : 'rose'}
            />
          </div>

          {/* Графики (динамика, серии, pie) */}
          <ChartsPanel
            byDay={filtered.byDay}
            bySport={filtered.bySport}
            streak={filtered.streak}
            profit={filtered.profit}
            roi={filtered.roi}
          />

          {/* ===== ДОПОЛНИТЕЛЬНО: глубокая аналитика (аккордеон) ===== */}
          {period === 'all' && (
            <AdditionalStats>
              {/* Журнал ошибок — первый для видимости */}
              <SectionWrapper sectionId="error-journal">
                <ErrorJournalPanel />
              </SectionWrapper>

              {/* Личная статистика по избранным пикам */}
              <SectionWrapper sectionId="personal">
                <PersonalStatsPanel
                  globalWinRate={filtered.winRate}
                  globalProfit={filtered.profit}
                  globalRoi={filtered.roi}
                />
              </SectionWrapper>

              {/* Cross-check статистика (Z.ai + Nemotron) */}
              <SectionWrapper sectionId="crosscheck">
                <CrossCheckStatsPanel />
              </SectionWrapper>

              {/* Кривая банкролла */}
              {stats?.bankrollCurve && stats.bankrollCurve.length > 0 && (
                <SectionWrapper sectionId="bankroll">
                  <BankrollChart
                    data={stats.bankrollCurve}
                    maxDrawdown={stats.maxDrawdown ?? 0}
                    crossCheckData={stats.bankrollCurveCrossCheck}
                    maxDrawdownCrossCheck={stats.maxDrawdownCrossCheck}
                  />
                </SectionWrapper>
              )}

              {/* Анализ парадокса по видам спорта и рынкам */}
              <SectionWrapper sectionId="paradox">
                <ParadoxAnalysisChart />
              </SectionWrapper>

              {/* Распределение по уверенности ИИ */}
              {stats?.confidenceDistribution && stats.confidenceDistribution.some((b) => b.total > 0) && (
                <SectionWrapper sectionId="confidence">
                  <ConfidenceDistributionChart data={stats.confidenceDistribution} />
                </SectionWrapper>
              )}

              {/* Корреляция коэффициента и винрейта */}
              {stats?.oddsCorrelation && stats.oddsCorrelation.some((b) => b.total > 0) && (
                <SectionWrapper sectionId="odds">
                  <OddsCorrelationChart data={stats.oddsCorrelation} />
                </SectionWrapper>
              )}

              {/* Анализ серий побед/поражений */}
              {stats?.streakAnalysis && (
                <SectionWrapper sectionId="streaks">
                  <StreakAnalysisChart data={stats.streakAnalysis} />
                </SectionWrapper>
              )}

              {/* Лучший/худший день */}
              {stats?.bestDay && stats?.worstDay && (stats.bestDay.profit !== 0 || stats.worstDay.profit !== 0) && (
                <SectionWrapper sectionId="best-worst">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BestWorstDayCard type="best" day={stats.bestDay} />
                    <BestWorstDayCard type="worst" day={stats.worstDay} />
                  </div>
                </SectionWrapper>
              )}

              {/* Топ команд по винрейту */}
              {stats?.teamsLeaderboard && stats.teamsLeaderboard.length > 0 && (
                <SectionWrapper sectionId="teams">
                  <TeamsLeaderboard data={stats.teamsLeaderboard} />
                </SectionWrapper>
              )}
            </AdditionalStats>
          )}

          {/* Pending / noResult */}
          {(filtered.pending > 0 || filtered.noResult > 0) && (
            <Card className="p-3.5">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {filtered.pending > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Ожидают результата: <b className="text-slate-700">{filtered.pending}</b>
                  </span>
                )}
                {filtered.noResult > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-slate-400" />
                    Без авто-результата (теннис/кибер): <b className="text-slate-700">{filtered.noResult}</b>
                  </span>
                )}
                {filtered.push > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    Возвраты: <b className="text-slate-700">{filtered.push}</b>
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* По виду спорта (с сортировкой по клику на заголовок) */}
          {filtered.bySport.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">По виду спорта</h3>
                <span className="text-[11px] text-slate-400">кликни на заголовок для сортировки</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-2 font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('sport')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Спорт {sortIcon('sport')}
                        </button>
                      </th>
                      <th className="pb-2 px-2 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('total')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Пиков {sortIcon('total')}
                        </button>
                      </th>
                      <th className="pb-2 px-2 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('settled')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Рассч. {sortIcon('settled')}
                        </button>
                      </th>
                      <th className="pb-2 px-2 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('winRate')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Винрейт {sortIcon('winRate')}
                        </button>
                      </th>
                      <th className="pb-2 pl-2 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort('roi')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          ROI {sortIcon('roi')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBySport.map((s) => (
                      <tr key={s.sportKey} className="border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/50">
                        <td className="py-2.5 pr-2">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                            <span className="text-base">{s.icon}</span>
                            {s.sport}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">
                          {s.total}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">
                          {s.settled}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className={s.winRate >= 50 ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                            {s.settled > 0 ? `${s.winRate.toFixed(0)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums">
                          <span
                            className={cn(
                              'font-semibold',
                              s.roi > 0
                                ? 'text-emerald-600'
                                : s.roi < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500',
                            )}
                          >
                            {s.settled > 0 ? `${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}%` : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* По уровню уверенности */}
          {filtered.byConfidence.some((c) => c.total > 0) && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-900">
                По уровню уверенности ИИ
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {filtered.byConfidence.map((c) => (
                  <div
                    key={c.confidence}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          CONF_COLORS[c.confidence],
                        )}
                      >
                        {CONF_LABELS[c.confidence]}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {c.total} пик.
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-slate-500">Винрейт</p>
                        <p className="text-lg font-extrabold tabular-nums text-slate-900">
                          {c.settled > 0 ? `${c.winRate.toFixed(0)}%` : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">ROI</p>
                        <p
                          className={cn(
                            'text-lg font-extrabold tabular-nums',
                            c.roi > 0
                              ? 'text-emerald-600'
                              : c.roi < 0
                                ? 'text-rose-600'
                                : 'text-slate-500',
                          )}
                        >
                          {c.settled > 0 ? `${c.roi >= 0 ? '+' : ''}${c.roi.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <p className="text-[11px] leading-relaxed text-slate-400">
            Статистика ведётся автоматически и бесплатно. Результаты матчей ЧМ,
            WNBA, MLB подтягиваются из ESPN API (без LLM-токенов). Пики по
            теннису и киберспорту помечаются «без авто-результата» — их можно
            учесть вручную позже. Расчёт условный: по 1 единице на каждый пик.
          </p>
        </>
      )}
    </div>
  );
}

function MetricCard({
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
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      value: 'text-emerald-700',
    },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', value: 'text-rose-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', value: 'text-amber-700' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', value: 'text-slate-900' },
  };
  const a = accents[accent];
  return (
    <Card className="p-3.5 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', a.bg, a.text)}>
          {icon}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className={cn('mt-2 text-2xl font-extrabold tabular-nums', a.value)}>
        {value}
      </p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </Card>
  );
}

function BestWorstDayCard({
  type,
  day,
}: {
  type: 'best' | 'worst';
  day: {
    date: string;
    picks: number;
    settled: number;
    won: number;
    lost: number;
    profit: number;
    roi: number;
  };
}) {
  const isBest = type === 'best';
  const profitPositive = day.profit >= 0;
  const dateStr = new Date(day.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  });

  return (
    <Card
      className={cn(
        'relative overflow-hidden p-4 dark:bg-slate-900',
        isBest
          ? 'border-emerald-200 dark:border-emerald-900/50'
          : 'border-rose-200 dark:border-rose-900/50',
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          isBest
            ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
            : 'bg-gradient-to-r from-rose-400 to-rose-600',
        )}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              isBest
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
            )}
          >
            {isBest ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {isBest ? 'Лучший день' : 'Худший день'}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{dateStr}</span>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-extrabold tabular-nums',
          profitPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}
      >
        {profitPositive ? '+' : ''}{day.profit.toFixed(2)}
      </p>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Пиков: <b className="text-slate-700 dark:text-slate-200">{day.picks}</b></span>
        <span>В/П: <b className="text-emerald-600 dark:text-emerald-400">{day.won}</b>/<b className="text-rose-600 dark:text-rose-400">{day.lost}</b></span>
        <span>ROI: <b className={day.roi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{day.roi >= 0 ? '+' : ''}{day.roi.toFixed(1)}%</b></span>
      </div>
    </Card>
  );
}
