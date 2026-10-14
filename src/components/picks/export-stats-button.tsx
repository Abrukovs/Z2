'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Stats, SportStat, ConfidenceStat, DayStat } from '@/lib/stats-service';

interface ExportButtonProps {
  stats: Stats;
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(stats: Stats): string {
  const lines: string[] = [];
  // Сводка
  lines.push('# Сводка');
  lines.push('Метрика,Значение');
  lines.push(`Всего пиков,${stats.total}`);
  lines.push(`Рассчитано,${stats.settled}`);
  lines.push(`Ожидают результата,${stats.pending}`);
  lines.push(`Побед,${stats.won}`);
  lines.push(`Поражений,${stats.lost}`);
  lines.push(`Возвратов,${stats.push}`);
  lines.push(`Без авто-результата,${stats.noResult}`);
  lines.push(`Винрейт (%),${stats.winRate.toFixed(2)}`);
  lines.push(`Сумма ставок,${stats.totalStake}`);
  lines.push(`Сумма возврата,${stats.totalReturn}`);
  lines.push(`Прибыль,${stats.profit.toFixed(2)}`);
  lines.push(`ROI (%),${stats.roi.toFixed(2)}`);
  lines.push(`Текущая серия,${stats.streak.current} (${stats.streak.type})`);
  lines.push(`Лучшая серия побед,${stats.streak.best}`);
  lines.push('');

  // По виду спорта
  lines.push('# По виду спорта');
  lines.push('Спорт,Ключ,Пиков,Рассчитано,Побед,Поражений,Винрейт (%),ROI (%)');
  for (const s of stats.bySport as SportStat[]) {
    lines.push(
      [
        escapeCsv(s.sport),
        s.sportKey,
        s.total,
        s.settled,
        s.won,
        s.lost,
        s.winRate.toFixed(2),
        s.roi.toFixed(2),
      ].join(','),
    );
  }
  lines.push('');

  // По уверенности
  lines.push('# По уровню уверенности');
  lines.push('Уверенность,Пиков,Рассчитано,Побед,Винрейт (%),ROI (%)');
  for (const c of stats.byConfidence as ConfidenceStat[]) {
    lines.push(
      [c.confidence, c.total, c.settled, c.won, c.winRate.toFixed(2), c.roi.toFixed(2)].join(','),
    );
  }
  lines.push('');

  // По дням
  lines.push('# Динамика по дням');
  lines.push('Дата,Пиков,Рассчитано,Побед,Поражений,Прибыль,Нарастающий итог,ROI (%)');
  for (const d of stats.byDay as DayStat[]) {
    lines.push(
      [
        d.date,
        d.picks,
        d.settled,
        d.won,
        d.lost,
        d.profit.toFixed(2),
        d.cumulativeProfit.toFixed(2),
        d.roi.toFixed(2),
      ].join(','),
    );
  }

  // BOM для корректного UTF-8 в Excel
  return '\uFEFF' + lines.join('\n');
}

export function ExportStatsButton({ stats }: ExportButtonProps) {
  const handleExport = () => {
    const csv = buildCsv(stats);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `stavka-dnya-stats-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5">
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">CSV</span>
    </Button>
  );
}
