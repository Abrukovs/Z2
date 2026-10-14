import { ShieldAlert, Sparkles, ExternalLink } from 'lucide-react';

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-slate-200 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800 dark:from-slate-950 dark:to-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Дисклеймер */}
          <div className="md:col-span-2">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Информация ознакомительная · 18+
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Коэффициенты приблизительны и формируются на основе анализа
                  открытых источников. Ставки на спорт связаны с финансовым
                  риском — играйте ответственно.
                </p>
              </div>
            </div>
          </div>

          {/* Технологии + бренд */}
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                «Ставка Дня»
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                Веб-поиск
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700 ring-1 ring-inset ring-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-800">
                LLM
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800">
                ESPN + API
              </span>
            </div>
            <a
              href="https://chat.z.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 md:justify-end"
            >
              <ExternalLink className="h-3 w-3" />
              Powered by Z.ai
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:flex-row">
          <p>© {year} «Ставка Дня» · Все права защищены</p>
          <p>Сделано с заботой о ваших ставках</p>
        </div>
      </div>
    </footer>
  );
}
