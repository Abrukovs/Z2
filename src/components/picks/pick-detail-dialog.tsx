'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Clock,
  TrendingUp,
  AlertTriangle,
  Quote,
  ExternalLink,
  Calendar,
  Database,
  Target,
  CheckCircle2,
  XCircle,
  Circle,
  Trophy,
  ShieldCheck,
  Activity,
  Copy,
  Check,
  Star,
  Heart,
  Brain,
  HelpCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Pick, Confidence } from '@/lib/picks-service';
import { TeamHistorySection } from './team-history-section';
import { useFavorites } from '@/hooks/use-favorites';

const CONF_STYLES: Record<
  Confidence,
  { label: string; badge: string; bar: string; dot: string; text: string; ring: string }
> = {
  high: {
    label: 'Высокая',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
  },
  medium: {
    label: 'Средняя',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-200 dark:ring-amber-800',
  },
  low: {
    label: 'Низкая',
    badge: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-200 dark:ring-rose-800',
  },
};

const SPORT_STRIPE: Record<string, string> = {
  football: 'from-emerald-400 to-emerald-600',
  basketball: 'from-orange-400 to-orange-600',
  tennis: 'from-lime-400 to-lime-600',
  hockey: 'from-cyan-400 to-cyan-600',
  baseball: 'from-amber-400 to-amber-600',
  esports: 'from-purple-400 to-purple-600',
  volleyball: 'from-pink-400 to-pink-600',
};
const DEFAULT_STRIPE = 'from-emerald-400 to-emerald-600';

export interface PickDetail extends Pick {
  result?: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
  homeScore?: number | null;
  awayScore?: number | null;
  crossCheckAgree?: 'agree' | 'disagree' | 'uncertain' | null;
  crossCheckConfidence?: number | null;
  crossCheckReasoning?: string | null;
  crossCheckScore?: number | null;
  crossCheckModel?: string | null;
}

interface PickDetailDialogProps {
  pick: PickDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ResultBadge({ pick }: { pick: PickDetail }) {
  if (!pick.result || pick.result === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Circle className="h-3 w-3" />
        Ожидает результата
      </span>
    );
  }
  if (pick.result === 'won') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Выиграл
        {pick.homeScore !== null && pick.awayScore !== null && (
          <span className="ml-1 tabular-nums opacity-80">
            {pick.homeScore}:{pick.awayScore}
          </span>
        )}
      </span>
    );
  }
  if (pick.result === 'lost') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        <XCircle className="h-3 w-3" />
        Проиграл
        {pick.homeScore !== null && pick.awayScore !== null && (
          <span className="ml-1 tabular-nums opacity-80">
            {pick.homeScore}:{pick.awayScore}
          </span>
        )}
      </span>
    );
  }
  if (pick.result === 'push') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <ShieldCheck className="h-3 w-3" />
        Возврат
      </span>
    );
  }
  return null;
}

export function PickDetailDialog({ pick, open, onOpenChange }: PickDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!pick) return null;
  const conf = CONF_STYLES[pick.confidence];
  const stripe = SPORT_STRIPE[pick.sportKey] || DEFAULT_STRIPE;
  const hasAnalysis = Boolean(pick.reasoning || pick.risk || pick.sourceQuote);
  const fav = isFavorite(pick.id);

  // Копирование ставки в буфер обмена
  const handleCopy = async () => {
    const text = `${pick.selection} @ ${pick.odds} (${pick.team1} vs ${pick.team2}, ${pick.league})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Ставка скопирована в буфер обмена', {
        description: text,
        duration: 2500,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const handleFavorite = () => {
    toggleFavorite(pick.id);
    toast.success(fav ? 'Удалено из избранного' : 'Добавлено в избранное', {
      duration: 2000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        {/* Header с градиентной полосой */}
        <div className={cn('h-1.5 w-full bg-gradient-to-r', stripe)} />
        <DialogHeader className="space-y-0 border-b border-slate-100 p-5 pb-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl leading-none">{pick.sportIcon}</span>
                <Badge variant="secondary" className="font-medium">
                  {pick.league}
                </Badge>
                <ResultBadge pick={pick} />
              </div>
              <DialogTitle className="mt-2 text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                {pick.team1} <span className="text-slate-400 dark:text-slate-500">против</span> {pick.team2}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {pick.startTime || '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {pick.generatedAt ? new Date(pick.generatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {pick.dataSource}
                </span>
              </DialogDescription>
            </div>
            {/* Кнопки действий: избранное + копировать */}
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={handleFavorite}
                aria-label={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
                title={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
                  fav
                    ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-amber-800',
                )}
              >
                <Heart className={cn('h-4 w-4', fav && 'fill-current')} />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Скопировать ставку"
                title="Скопировать ставку"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-all hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-800"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {/* Главная рекомендация */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-4 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-emerald-950/10"
          >
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Рекомендация ИИ
              </p>
            </div>
            <p className="mt-2 text-xs font-medium text-emerald-700/70 dark:text-emerald-400/70">
              {pick.market}
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-xl font-extrabold leading-tight text-slate-900 dark:text-slate-100">
                {pick.selection}
              </p>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase text-slate-400">Коэффициент</p>
                <p className="text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {pick.odds}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Уверенность — большой визуал */}
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <TrendingUp className="h-4 w-4" />
                Уверенность ИИ
              </span>
              <Badge variant="outline" className={cn('text-xs font-semibold', conf.badge)}>
                <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', conf.dot)} />
                {conf.label} · {pick.confidenceScore}%
              </Badge>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <motion.div
                className={cn('h-full rounded-full', conf.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${pick.confidenceScore}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Анализ (если есть) */}
          {hasAnalysis ? (
            <div className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Анализ и обоснование
              </h3>
              {pick.reasoning && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  {pick.reasoning}
                </div>
              )}
              {pick.risk && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="mb-0.5 font-bold uppercase tracking-wide text-[10px]">Факторы риска</p>
                    {pick.risk}
                  </div>
                </div>
              )}
              {pick.sourceQuote && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/50">
                  <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <Quote className="h-3 w-3" />
                    Источник
                  </p>
                  <p className="text-xs italic leading-relaxed text-slate-600 dark:text-slate-400">
                    «{pick.sourceQuote}»
                  </p>
                  {pick.sourceUrl && (
                    <a
                      href={pick.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {pick.sourceName || 'открыть источник'}
                    </a>
                  )}
                  {!pick.sourceUrl && pick.sourceName && (
                    <p className="mt-1.5 text-[11px] text-slate-400">{pick.sourceName}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <Trophy className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Подробный ИИ-анализ не сохранён для этого пика
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Карточка показывает ключевые параметры: команду, рынок, коэффициент
                и уровень уверенности.
              </p>
            </div>
          )}

          {/* Метаданные */}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
            <MetaItem label="Вид спорта" value={`${pick.sportIcon} ${pick.sport}`} />
            <MetaItem label="Рынок" value={pick.market} />
            <MetaItem label="Источник данных" value={pick.dataSource} />
            <MetaItem
              label="Сгенерирован"
              value={pick.generatedAt ? new Date(pick.generatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
            />
          </div>

          {/* Cross-check секция (второе мнение от gpt-oss-20b:free) */}
          {pick.crossCheckAgree && (
            <CrossCheckSection pick={pick} />
          )}

          {/* История команд в архиве */}
          <TeamHistorySection team1={pick.team1} team2={pick.team2} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-medium text-slate-700 dark:text-slate-300" title={value}>
        {value}
      </p>
    </div>
  );
}

// Секция cross-check: второе мнение от gpt-oss
function CrossCheckSection({ pick }: { pick: PickDetail }) {
  const agree = pick.crossCheckAgree;
  if (!agree) return null;

  const isAgree = agree === 'agree';
  const isDisagree = agree === 'disagree';

  const headerColor = isAgree
    ? 'from-emerald-500 to-emerald-700'
    : isDisagree
      ? 'from-amber-500 to-orange-600'
      : 'from-slate-500 to-slate-700';

  const bgColor = isAgree
    ? 'bg-emerald-50 dark:bg-emerald-950/30'
    : isDisagree
      ? 'bg-amber-50 dark:bg-amber-950/30'
      : 'bg-slate-50 dark:bg-slate-800/40';

  const textColor = isAgree
    ? 'text-emerald-800 dark:text-emerald-300'
    : isDisagree
      ? 'text-amber-800 dark:text-amber-300'
      : 'text-slate-600 dark:text-slate-300';

  const icon = isAgree ? <CheckCircle2 className="h-4 w-4" /> : isDisagree ? <AlertTriangle className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />;

  const label = isAgree
    ? 'Оба ИИ согласны'
    : isDisagree
      ? 'ИИ расходятся во мнениях'
      : 'gpt-oss не уверен';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 bg-gradient-to-r p-3 text-white', headerColor)}>
        <Brain className="h-4 w-4" />
        <p className="text-sm font-bold">Cross-check: второе мнение</p>
        <span className="ml-auto text-[10px] opacity-90">{pick.crossCheckModel}</span>
      </div>

      {/* Body */}
      <div className={cn('space-y-3 p-4', bgColor)}>
        {/* Статус + уверенность */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn('flex items-center gap-1.5 text-sm font-bold', textColor)}>
            {icon}
            {label}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {pick.crossCheckConfidence !== null && pick.crossCheckConfidence !== undefined && (
              <span className={cn('font-semibold', textColor)}>
                gpt-oss: {pick.crossCheckConfidence}%
              </span>
            )}
            {pick.crossCheckScore !== null && pick.crossCheckScore !== undefined && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  Итог: {pick.crossCheckScore}%
                </span>
              </>
            )}
          </div>
        </div>

        {/* Обоснование gpt-oss */}
        {pick.crossCheckReasoning && (
          <div className={cn('rounded-lg p-2.5 text-xs leading-relaxed', textColor, bgColor)}>
            «{pick.crossCheckReasoning}»
          </div>
        )}

        {/* Сравнение уверенности */}
        {pick.crossCheckConfidence !== null && pick.crossCheckConfidence !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span>Z.ai: {pick.confidenceScore}%</span>
              <span>gpt-oss: {pick.crossCheckConfidence}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${pick.confidenceScore}%` }}
              />
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={cn(
                  'h-full',
                  isAgree ? 'bg-emerald-500' : isDisagree ? 'bg-amber-500' : 'bg-slate-500',
                )}
                style={{ width: `${pick.crossCheckConfidence}%` }}
              />
            </div>
          </div>
        )}

        {/* Рекомендация */}
        {isAgree && (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            ✅ Пик проверен двумя ИИ — повышенная уверенность
          </p>
        )}
        {isDisagree && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            ⚠ ИИ расходятся — пик рискованный, рассмотрите осторожно
          </p>
        )}
      </div>
    </motion.div>
  );
}
