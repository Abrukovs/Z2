'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdditionalStatsProps {
  children: ReactNode;
}

// Список секций с ID, иконками и заголовками
interface SectionDef {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  accent: string; // tailwind gradient
}

const SECTIONS: SectionDef[] = [
  {
    id: 'error-journal',
    icon: '📋',
    title: 'Журнал ошибок',
    subtitle: 'Отслеживание повторяющихся проблем',
    accent: 'from-rose-500 to-amber-600',
  },
  {
    id: 'personal',
    icon: '❤️',
    title: 'Личная статистика',
    subtitle: 'Статистика по избранным пикам',
    accent: 'from-rose-500 to-pink-600',
  },
  {
    id: 'crosscheck',
    icon: '🎯',
    title: 'Cross-check: Z.ai + Nemotron',
    subtitle: 'Парадокс двух ИИ — где они расходятся',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'bankroll',
    icon: '💰',
    title: 'Кривая банкролла',
    subtitle: 'Динамика капитала с учётом cross-check',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    id: 'paradox',
    icon: '⚡',
    title: 'Анализ парадокса',
    subtitle: 'Где Nemotron прав, а Z.ai ошибается',
    accent: 'from-orange-500 to-red-600',
  },
  {
    id: 'confidence',
    icon: '📊',
    title: 'Распределение по уверенности',
    subtitle: 'Как уверенность ИИ влияет на выигрыш',
    accent: 'from-violet-500 to-purple-600',
  },
  {
    id: 'odds',
    icon: '🎯',
    title: 'Корреляция коэффициента',
    subtitle: 'Винрейт по диапазонам коэффициентов',
    accent: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'streaks',
    icon: '🔥',
    title: 'Анализ серий',
    subtitle: 'Длины победных и проигрышных серий',
    accent: 'from-lime-500 to-green-600',
  },
  {
    id: 'best-worst',
    icon: '📅',
    title: 'Лучший и худший день',
    subtitle: 'Самые прибыльные и убыточные дни',
    accent: 'from-slate-500 to-slate-700',
  },
  {
    id: 'teams',
    icon: '🏆',
    title: 'Топ команд',
    subtitle: 'Лидерборд по винрейту и прибыли',
    accent: 'from-yellow-500 to-amber-600',
  },
];

export function AdditionalStats({ children }: AdditionalStatsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      {/* Кнопка-аккордеон */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'group flex w-full items-center justify-between rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 text-left transition-all hover:border-emerald-300 hover:from-emerald-50/50 hover:to-white dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:hover:border-emerald-700',
          expanded && 'border-emerald-300 from-emerald-50/50 to-white dark:border-emerald-700 dark:from-emerald-950/20',
        )}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              Дополнительно
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {expanded
                ? 'Скройте подробную аналитику в один клик'
                : '9 секций глубокой аналитики: cross-check, банкролл, парадокс, серии и др.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline',
              expanded
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            {expanded ? 'Открыто' : '9 секций'}
          </span>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-slate-400 transition-transform duration-300 group-hover:text-emerald-600',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Раскрывающееся содержимое */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Под-компонент-обёртка для каждой секции с заголовком
interface SectionWrapperProps {
  sectionId: string;
  children: ReactNode;
}

export function SectionWrapper({ sectionId, children }: SectionWrapperProps) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return <>{children}</>;

  return (
    <div className="space-y-2">
      {/* Заголовок секции */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-lg">{section.icon}</span>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            {section.title}
          </h4>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">{section.subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
