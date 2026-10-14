'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Trophy, Crown, Medal, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamDetailDialog } from './team-detail-dialog';

interface TeamLeaderEntry {
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

interface TeamsLeaderboardProps {
  data: TeamLeaderEntry[];
}

type SortKey = 'winRate' | 'total' | 'roi' | 'profit';
type SortDir = 'asc' | 'desc';

export function TeamsLeaderboard({ data }: TeamsLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('winRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr.slice(0, 10);
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (data.length === 0) {
    return null;
  }

  const getRankIcon = (idx: number) => {
    if (idx === 0) return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (idx === 1) return <Medal className="h-3.5 w-3.5 text-slate-400" />;
    if (idx === 2) return <Award className="h-3.5 w-3.5 text-orange-600" />;
    return <span className="text-[10px] font-bold text-slate-400">{idx + 1}</span>;
  };

  const renderSortButton = (k: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-0.5 hover:text-slate-700 dark:hover:text-slate-200"
    >
      {label}
      {sortKey === k ? (
        sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : null}
    </button>
  );

  return (
    <Card className="p-4 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Trophy className="h-4 w-4 text-amber-500" />
            Топ команд по винрейту
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Команды, которые ИИ предсказывает лучше всего (минимум 2 рассчитанных пика)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="pb-2 pr-2 font-semibold">#</th>
              <th className="pb-2 px-2 font-semibold">Команда</th>
              <th className="pb-2 px-1 text-right font-semibold">
                {renderSortButton('total', 'Пиков')}
              </th>
              <th className="pb-2 px-1 text-right font-semibold">В/П</th>
              <th className="pb-2 px-1 text-right font-semibold">
                {renderSortButton('winRate', 'Винрейт')}
              </th>
              <th className="pb-2 pl-1 text-right font-semibold">
                {renderSortButton('roi', 'ROI')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <motion.tr
                key={`${t.team}-${t.sportKey}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => {
                  setSelectedTeam(t.team);
                  setDialogOpen(true);
                }}
                className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-emerald-50/40 dark:border-slate-800/50 dark:hover:bg-emerald-950/20"
              >
                <td className="py-2 pr-2">
                  <div className="flex h-5 w-5 items-center justify-center">
                    {getRankIcon(i)}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm shrink-0">{t.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={t.team}>
                        {t.team}
                      </p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500">{t.sport}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-1 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                  {t.total}
                </td>
                <td className="py-2 px-1 text-right text-xs tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{t.won}</span>
                  <span className="text-slate-400">/</span>
                  <span className="text-rose-600 dark:text-rose-400">{t.lost}</span>
                </td>
                <td className="py-2 px-1 text-right text-xs">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      t.winRate >= 60
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : t.winRate >= 40
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                    )}
                  >
                    {t.winRate.toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 pl-1 text-right text-xs font-semibold tabular-nums">
                  <span
                    className={
                      t.roi > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : t.roi < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500'
                    }
                  >
                    {t.roi >= 0 ? '+' : ''}{t.roi.toFixed(1)}%
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Модалка с детальной статистикой команды */}
      <TeamDetailDialog
        team={selectedTeam}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  );
}
