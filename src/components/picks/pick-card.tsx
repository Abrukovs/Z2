'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Clock,
  TrendingUp,
  AlertTriangle,
  Quote,
  ExternalLink,
  Maximize2,
  CheckCircle2,
  XCircle,
  Circle,
  Heart,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/hooks/use-favorites';
import type { Pick, Confidence } from '@/lib/picks-service';

const CONF_STYLES: Record<
  Confidence,
  { label: string; badge: string; bar: string; dot: string; text: string }
> = {
  high: {
    label: 'Высокая',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  medium: {
    label: 'Средняя',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  low: {
    label: 'Низкая',
    badge: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

// Цветовая кодировка левой полосы по виду спорта
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

// Тип рынка для тега-индикатора
// ВАЖНО: проверяем "обе забьют"/"обе команды" целиком, не просто "обе"
// т.к. "победитель" содержит подстроку "обе" (п-о-б-е-дитель)
function getMarketTag(market: string): { label: string; cls: string } | null {
  const m = market.toLowerCase();
  // Победа (включая "победитель", "победа", "moneyline")
  if (m.includes('побед') || m.includes('winner') || m.includes('moneyline') || m.includes('п1') || m.includes('п2')) {
    return { label: 'Победа', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800' };
  }
  // Тотал
  if (m.includes('тотал') || m.includes('over') || m.includes('under') || m.includes('тб') || m.includes('тм')) {
    return { label: 'Тотал', cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-800' };
  }
  // Фора
  if (m.includes('фора') || m.includes('handicap') || m.includes('гандикап')) {
    return { label: 'Фора', cls: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:ring-purple-800' };
  }
  // Обе забьют — ищем "обе забьют" или "обе команды" целиком (не просто "обе"!)
  if (m.includes('обе забьют') || m.includes('обе команды') || m.includes('btts') || m.includes('both teams to score')) {
    return { label: 'Обе забьют', cls: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800' };
  }
  return null;
}

interface PickCardProps {
  pick: Pick & {
    result?: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
    homeScore?: number | null;
    awayScore?: number | null;
    crossCheckAgree?: 'agree' | 'disagree' | 'uncertain' | null;
    crossCheckConfidence?: number | null;
    crossCheckReasoning?: string | null;
    crossCheckScore?: number | null;
    crossCheckModel?: string | null;
  };
  onOpenDetail?: () => void;
}

// Бейдж cross-check: показывает согласие двух ИИ
// Z = Z.ai (основной, всегда зелёный), N = Nemotron (зелёный=agree, красный=disagree)
// БЕЙСБОЛ: только Z (без N) — Nemotron некомпетентен в MLB
// ТЕННИС/БАСКЕТБОЛ/футбол/хоккей и др.: показываем Z+N (парадокс работает)
function CrossCheckBadge({ pick }: { pick: PickCardProps['pick'] }) {
  const agree = pick.crossCheckAgree;
  const model = pick.crossCheckModel;

  // Если cross-check не выполнялся — не показываем бейдж
  if (!agree) return null;

  // Бейсбол — только Z.ai, без cross-check
  // (даже если в БД стоит crossCheckAgree='agree' + model='skipped-baseball')
  const isBaseball = pick.sportKey === 'baseball';
  const isSkipped = model === 'skipped-baseball' || model === 'skipped-tennis';

  if (isBaseball || isSkipped) {
    // Показываем только Z (без N) — бейсбол на доверии к Z.ai
    return (
      <span
        className="animate-pop-in inline-flex items-center gap-0.5 rounded-md text-[9px] font-bold leading-none"
        title={`Только Z.ai\nВид спорта: ${pick.sport}\nCross-check отключён для бейсбола (Nemotron некомпетентен в MLB)`}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-500 text-white">
          Z
        </span>
      </span>
    );
  }

  // Z всегда зелёный (основной ИИ рекомендовал пик)
  // N: зелёный если agree, красный если disagree
  const cColor =
    agree === 'agree'
      ? 'bg-emerald-500 text-white'
      : 'bg-rose-500 text-white'; // disagree = красный

  const tooltip = agree === 'agree'
    ? `✓ Оба ИИ согласны\nZ.ai: ${pick.confidenceScore}%\nNemotron: ${pick.crossCheckConfidence}%\n${pick.crossCheckReasoning || ''}`
    : `⚠ Парадокс: ИИ расходятся\nZ.ai: ${pick.confidenceScore}%\nNemotron: ${pick.crossCheckConfidence}% (НЕ согласен)\n${pick.crossCheckReasoning || ''}\n\n💡 Исторически: disagree выигрывает в 56%+ случаев`;

  return (
    <span
      className="animate-pop-in inline-flex items-center gap-0.5 rounded-md text-[9px] font-bold leading-none"
      title={tooltip}
    >
      {/* Z — всегда зелёный (основной ИИ) */}
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-500 text-white">
        Z
      </span>
      {/* N — зелёный/красный в зависимости от согласия */}
      <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-sm', cColor)}>
        N
      </span>
    </span>
  );
}

function ResultBadge({ pick }: { pick: PickCardProps['pick'] }) {
  if (!pick.result || pick.result === 'pending' || pick.result === 'no_result') return null;

  // Краткий текст пика (selection) — обрезаем до 20 символов
  const selShort = (pick.selection || '').length > 20
    ? (pick.selection || '').slice(0, 18) + '..'
    : (pick.selection || '');

  // Счёт матча (если есть)
  const hasScore = pick.homeScore !== null && pick.homeScore !== undefined
    && pick.awayScore !== null && pick.awayScore !== undefined;
  const scoreText = hasScore ? `${pick.homeScore}:${pick.awayScore}` : '';

  if (pick.result === 'won') {
    return (
      <span
        className="animate-pop-in inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        title={`✓ Пик выиграл\nСтавка: ${pick.market} → ${pick.selection}\nСчёт: ${scoreText || 'н/д'}`}
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        <span>В</span>
        {selShort && (
          <span className="max-w-[80px] truncate opacity-90">{selShort}</span>
        )}
        {scoreText && <span className="tabular-nums opacity-80">{scoreText}</span>}
      </span>
    );
  }
  if (pick.result === 'lost') {
    return (
      <span
        className="animate-pop-in inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
        title={`✗ Пик проиграл\nСтавка: ${pick.market} → ${pick.selection}\nСчёт: ${scoreText || 'н/д'}`}
      >
        <XCircle className="h-2.5 w-2.5" />
        <span>П</span>
        {selShort && (
          <span className="max-w-[80px] truncate opacity-90">{selShort}</span>
        )}
        {scoreText && <span className="tabular-nums opacity-80">{scoreText}</span>}
      </span>
    );
  }
  if (pick.result === 'push') {
    return (
      <span
        className="animate-pop-in inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        title={`↔ Возврат\nСтавка: ${pick.market} → ${pick.selection}`}
      >
        <Circle className="h-2.5 w-2.5" />
        <span>Возврат</span>
        {selShort && <span className="max-w-[80px] truncate opacity-90">{selShort}</span>}
      </span>
    );
  }
  return null;
}

export function PickCard({ pick, onOpenDetail }: PickCardProps) {
  const [open, setOpen] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const conf = CONF_STYLES[pick.confidence];
  const stripe = SPORT_STRIPE[pick.sportKey] || DEFAULT_STRIPE;
  const marketTag = getMarketTag(pick.market);
  const fav = isFavorite(pick.id);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900',
        pick.result === 'won' && 'animate-glow-emerald ring-1 ring-emerald-200 dark:ring-emerald-800',
      )}
    >
      {/* Цветная полоска слева по виду спорта */}
      <div className={cn('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', stripe)} />

      {/* Hover-подсветка сверху */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/0 to-transparent opacity-0 transition-opacity group-hover:via-emerald-500/30 group-hover:opacity-100" />

      <div className="p-5 pl-6">
        {/* Шапка: спорт + лига + время + результат */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl leading-none">{pick.sportIcon}</span>
            <Badge
              variant="secondary"
              className="truncate max-w-[120px] sm:max-w-[160px] font-medium dark:bg-slate-800 dark:text-slate-200"
            >
              {pick.league}
            </Badge>
            <ResultBadge pick={pick} />
            <CrossCheckBadge pick={pick} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {pick.startTime && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {pick.startTime}
              </span>
            )}
            {/* Кнопка избранного */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(pick.id);
              }}
              className={cn(
                'rounded-md p-1 transition-all',
                fav
                  ? 'text-amber-500 opacity-100'
                  : 'text-slate-400 opacity-0 hover:text-amber-500 focus:opacity-100 group-hover:opacity-100 dark:text-slate-500',
              )}
              aria-label={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
              title={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
            >
              <Heart className={cn('h-3.5 w-3.5', fav && 'fill-current')} />
            </button>
            {onOpenDetail && (
              <button
                type="button"
                onClick={onOpenDetail}
                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-emerald-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800"
                aria-label="Открыть подробности"
                title="Подробный анализ"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Команды — вторичная иерархия (VLM: команды серее, прогноз выделен) */}
        <div className="mt-3 space-y-0.5">
          <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
            {pick.team1}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            против
          </p>
          <p className="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
            {pick.team2}
          </p>
        </div>

        {/* Рекомендация — ГЛАВНЫЙ визуальный акцент */}
        <div className="mt-4 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-emerald-50/30 p-3.5 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-emerald-950/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {pick.market}
                </p>
                {marketTag && (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset',
                      marketTag.cls,
                    )}
                  >
                    {marketTag.label}
                  </span>
                )}
              </div>
              <p className="mt-1 text-base font-extrabold leading-tight text-slate-900 dark:text-slate-100">
                {pick.selection}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-medium uppercase text-slate-400 dark:text-slate-500">
                Коэф.
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                {pick.odds}
              </p>
            </div>
          </div>
        </div>

        {/* Уверенность */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <TrendingUp className="h-3.5 w-3.5" />
              Уверенность
            </span>
            <Badge
              variant="outline"
              className={cn('text-[11px] font-semibold', conf.badge)}
            >
              <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', conf.dot)} />
              {conf.label} · {pick.confidenceScore}%
            </Badge>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className={cn('h-full rounded-full', conf.bar)}
              initial={{ width: 0 }}
              animate={{ width: `${pick.confidenceScore}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Раскрывающийся анализ */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          aria-expanded={open}
        >
          <span>{open ? 'Скрыть анализ' : 'Показать анализ'}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1 text-sm">
                {pick.reasoning && (
                  <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                    {pick.reasoning}
                  </p>
                )}
                {pick.risk && (
                  <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{pick.risk}</span>
                  </p>
                )}
                {pick.sourceQuote && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <Quote className="h-3 w-3" />
                      Источник
                    </p>
                    <p className="text-xs italic leading-relaxed text-slate-600 dark:text-slate-300">
                      «{pick.sourceQuote}»
                    </p>
                    {pick.sourceUrl && (
                      <a
                        href={pick.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400"
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
                {!pick.reasoning && !pick.risk && !pick.sourceQuote && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Подробный анализ недоступен. Нажмите на иконку развернуть ↗ в карточке
                    для просмотра всех деталей пика.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
