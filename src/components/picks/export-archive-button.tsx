'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ArchivedPickForExport {
  id: string;
  sport: string;
  sportKey: string;
  league: string;
  team1: string;
  team2: string;
  startTime: string;
  market: string;
  selection: string;
  odds: string;
  confidence: string;
  confidenceScore: number;
  result: string;
  homeScore: number | null;
  awayScore: number | null;
  dataSource: string;
  pickDate: string;
  generatedAt: string;
}

interface ExportArchiveButtonProps {
  date: string; // YYYY-MM-DD
  disabled?: boolean;
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(picks: ArchivedPickForExport[], date: string): string {
  const lines: string[] = [];
  lines.push(`# Архив пиков за ${date}`);
  lines.push(
    'Дата,Вид спорта,Лига,Команда 1,Команда 2,Время,Рынок,Выбор,Коэф,Уверенность,Уверенность %,Результат,Счёт,Источник,Сгенерирован',
  );
  for (const p of picks) {
    const score =
      p.homeScore !== null && p.awayScore !== null ? `${p.homeScore}:${p.awayScore}` : '—';
    const resultLabel =
      p.result === 'won'
        ? 'Выиграл'
        : p.result === 'lost'
          ? 'Проиграл'
          : p.result === 'push'
            ? 'Возврат'
            : p.result === 'pending'
              ? 'Ожидает'
              : 'Нет результата';
    lines.push(
      [
        p.pickDate,
        escapeCsv(p.sport),
        escapeCsv(p.league),
        escapeCsv(p.team1),
        escapeCsv(p.team2),
        p.startTime || '—',
        escapeCsv(p.market),
        escapeCsv(p.selection),
        p.odds,
        p.confidence,
        p.confidenceScore,
        resultLabel,
        score,
        p.dataSource,
        new Date(p.generatedAt).toLocaleString('ru-RU'),
      ].join(','),
    );
  }
  return '\uFEFF' + lines.join('\n');
}

export function ExportArchiveButton({ date, disabled }: ExportArchiveButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!date || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/picks?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success || !data.picks || data.picks.length === 0) {
        toast.error('Нет пиков для экспорта за эту дату');
        return;
      }
      const csv = buildCsv(data.picks as ArchivedPickForExport[], date);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stavka-dnya-archive-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Экспортировано ${data.picks.length} пиков за ${date}`, {
        duration: 2500,
      });
    } catch (e) {
      toast.error('Не удалось экспортировать архив');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={disabled || loading}
      variant="outline"
      size="sm"
      className="gap-1.5"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">CSV за {date}</span>
      <span className="sm:hidden">CSV</span>
    </Button>
  );
}
