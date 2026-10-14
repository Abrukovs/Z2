'use client';

import { useEffect, useReducer } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Zap, Loader2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParadoxBySportItem {
  sportKey: string;
  sport: string;
  icon: string;
  agreeTotal: number;
  agreeWon: number;
  agreeWinRate: number;
  agreeRoi: number;
  disagreeTotal: number;
  disagreeWon: number;
  disagreeWinRate: number;
  disagreeRoi: number;
}

interface ParadoxByMarketItem {
  market: string;
  marketTag: string;
  agreeTotal: number;
  agreeWon: number;
  agreeWinRate: number;
  agreeRoi: number;
  disagreeTotal: number;
  disagreeWon: number;
  disagreeWinRate: number;
  disagreeRoi: number;
}

interface ParadoxData {
  bySport: ParadoxBySportItem[];
  byMarket: ParadoxByMarketItem[];
}

interface State {
  loading: boolean;
  data: ParadoxData | null;
}

type Action = { type: 'loading' } | { type: 'loaded'; data: ParadoxData | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { loading: true, data: null };
    case 'loaded':
      return { loading: false, data: action.data };
  }
}

// Определение тега рынка (упрощённая версия)
function getMarketTag(market: string): string {
  const m = market.toLowerCase();
  if (m.includes('побед') || m.includes('winner') || m.includes('moneyline') || m.includes('п1') || m.includes('п2')) return 'ML (Победа)';
  if (m.includes('тотал') || m.includes('over') || m.includes('under') || m.includes('тб') || m.includes('тм')) return 'Тотал';
  if (m.includes('фора') || m.includes('handicap') || m.includes('гандикап')) return 'Фора';
  if (m.includes('обе забьют') || m.includes('btts') || m.includes('both teams')) return 'ОЗ (Обе забьют)';
  return 'Другое';
}

export function ParadoxAnalysisChart() {
  const [state, dispatch] = useReducer(reducer, { loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'loading' });
    // Загружаем все пики через /api/stats и группируем на клиенте
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) {
          dispatch({ type: 'loaded', data: null });
          return;
        }
        // Загружаем все пики через /api/picks?dates=1 и обрабатываем
        // Но проще: используем данные из stats (bySport уже есть)
        // Для парадокса нужны пики с crossCheckAgree — загрузим через API
        return fetch('/api/cross-check/all-picks', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d2) => {
            if (cancelled) return;
            if (!d2.success || !d2.picks) {
              dispatch({ type: 'loaded', data: { bySport: [], byMarket: [] } });
              return;
            }
            const picks = d2.picks;
            // Группируем по sport + crossCheckAgree
            const sportMap = new Map<string, ParadoxBySportItem>();
            const marketMap = new Map<string, ParadoxByMarketItem>();
            const SPORT_ICONS: Record<string, string> = {
              football: '⚽', basketball: '🏀', tennis: '🎾',
              hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
            };

            for (const p of picks) {
              if (!p.crossCheckAgree) continue;

              // По виду спорта
              const sKey = p.sportKey;
              if (!sportMap.has(sKey)) {
                sportMap.set(sKey, {
                  sportKey: sKey, sport: p.sport, icon: SPORT_ICONS[sKey] || '🏆',
                  agreeTotal: 0, agreeWon: 0, agreeWinRate: 0, agreeRoi: 0,
                  disagreeTotal: 0, disagreeWon: 0, disagreeWinRate: 0, disagreeRoi: 0,
                });
              }
              const sItem = sportMap.get(sKey)!;
              const odds = parseFloat((p.odds || '1').replace(',', '.'));

              if (p.crossCheckAgree === 'agree') {
                sItem.agreeTotal += 1;
                if (p.result === 'won') sItem.agreeWon += 1;
              } else if (p.crossCheckAgree === 'disagree') {
                sItem.disagreeTotal += 1;
                if (p.result === 'won') sItem.disagreeWon += 1;
              }

              // По рынку
              const mTag = getMarketTag(p.market || '');
              if (!marketMap.has(mTag)) {
                marketMap.set(mTag, {
                  market: mTag, marketTag: mTag,
                  agreeTotal: 0, agreeWon: 0, agreeWinRate: 0, agreeRoi: 0,
                  disagreeTotal: 0, disagreeWon: 0, disagreeWinRate: 0, disagreeRoi: 0,
                });
              }
              const mItem = marketMap.get(mTag)!;
              if (p.crossCheckAgree === 'agree') {
                mItem.agreeTotal += 1;
                if (p.result === 'won') mItem.agreeWon += 1;
              } else if (p.crossCheckAgree === 'disagree') {
                mItem.disagreeTotal += 1;
                if (p.result === 'won') mItem.disagreeWon += 1;
              }
            }

            // Считаем winRate
            const sportArr = Array.from(sportMap.values()).filter(s => s.agreeTotal + s.disagreeTotal > 0);
            sportArr.forEach(s => {
              const aSettled = s.agreeTotal;
              s.agreeWinRate = aSettled > 0 ? (s.agreeWon / aSettled) * 100 : 0;
              const dSettled = s.disagreeTotal;
              s.disagreeWinRate = dSettled > 0 ? (s.disagreeWon / dSettled) * 100 : 0;
            });

            const marketArr = Array.from(marketMap.values()).filter(m => m.agreeTotal + m.disagreeTotal > 0);
            marketArr.forEach(m => {
              m.agreeWinRate = m.agreeTotal > 0 ? (m.agreeWon / m.agreeTotal) * 100 : 0;
              m.disagreeWinRate = m.disagreeTotal > 0 ? (m.disagreeWon / m.disagreeTotal) * 100 : 0;
            });

            dispatch({ type: 'loaded', data: { bySport: sportArr, byMarket: marketArr } });
          });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'loaded', data: null });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Анализ парадокса по видам спорта и рынкам
          </h3>
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
        </div>
      </Card>
    );
  }

  if (!state.data || (state.data.bySport.length === 0 && state.data.byMarket.length === 0)) {
    return (
      <Card className="p-4 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Анализ парадокса
          </h3>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Недостаточно данных. Нужно больше пиков с cross-check.
        </p>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden p-0 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-3 text-white">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <h3 className="text-sm font-bold">Анализ парадокса: где C прав, а Z ошибается</h3>
          </div>
          <p className="mt-0.5 text-[10px] text-amber-50/90">
            Винрейт по видам спорта и рынкам: agree (Z+C 🟢) vs disagree (C 🔴)
          </p>
        </div>

        <div className="space-y-4 p-4">
          {/* По видам спорта */}
          {state.data.bySport.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                По видам спорта
              </h4>
              <div className="space-y-1.5">
                {state.data.bySport.map((s) => (
                  <div key={s.sportKey} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                    <span className="text-base shrink-0">{s.icon}</span>
                    <span className="min-w-[80px] text-xs font-semibold text-slate-700 dark:text-slate-200">{s.sport}</span>
                    {/* Agree bar */}
                    <div className="flex-1">
                      {s.agreeTotal > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-[8px] font-bold text-white">Z+C</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: '14px' }}>
                            <div className="h-full bg-emerald-500" style={{ width: `${s.agreeWinRate}%` }} />
                          </div>
                          <span className="min-w-[70px] text-right text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                            {s.agreeWinRate.toFixed(0)}% ({s.agreeWon}/{s.agreeTotal})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">нет agree</span>
                      )}
                    </div>
                    {/* Disagree bar */}
                    <div className="flex-1">
                      {s.disagreeTotal > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 text-[8px] font-bold text-white">C</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: '14px' }}>
                            <div className="h-full bg-rose-500" style={{ width: `${s.disagreeWinRate}%` }} />
                          </div>
                          <span className="min-w-[70px] text-right text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                            {s.disagreeWinRate.toFixed(0)}% ({s.disagreeWon}/{s.disagreeTotal})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">нет disagree</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* По рынкам */}
          {state.data.byMarket.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                По типам рынков
              </h4>
              <div className="space-y-1.5">
                {state.data.byMarket.map((m) => (
                  <div key={m.market} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                    <span className="min-w-[90px] text-xs font-semibold text-slate-700 dark:text-slate-200">{m.marketTag}</span>
                    {/* Agree */}
                    <div className="flex-1">
                      {m.agreeTotal > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500 text-[8px] font-bold text-white">Z+C</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: '14px' }}>
                            <div className="h-full bg-emerald-500" style={{ width: `${m.agreeWinRate}%` }} />
                          </div>
                          <span className="min-w-[70px] text-right text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                            {m.agreeWinRate.toFixed(0)}% ({m.agreeWon}/{m.agreeTotal})
                          </span>
                        </div>
                      ) : <span className="text-[10px] text-slate-400">—</span>}
                    </div>
                    {/* Disagree */}
                    <div className="flex-1">
                      {m.disagreeTotal > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 text-[8px] font-bold text-white">C</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: '14px' }}>
                            <div className="h-full bg-rose-500" style={{ width: `${m.disagreeWinRate}%` }} />
                          </div>
                          <span className="min-w-[70px] text-right text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                            {m.disagreeWinRate.toFixed(0)}% ({m.disagreeWon}/{m.disagreeTotal})
                          </span>
                        </div>
                      ) : <span className="text-[10px] text-slate-400">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Инсайт */}
          <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <Zap className="mr-1 inline h-3 w-3" />
            <b>Стратегия:</b> Ищите пики с бейджем <span className="font-bold">Z 🟢 + C 🔴</span> (disagree).
            Удваивайте ставку на них — парадокс показывает высокий винрейт.
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
