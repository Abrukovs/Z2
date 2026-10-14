'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  RotateCcw,
  Check,
  Trophy,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
  Filter,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSettings, type UserSettings } from '@/hooks/use-settings';

const SPORT_OPTIONS = [
  { key: 'football', label: 'Футбол', icon: '⚽' },
  { key: 'basketball', label: 'Баскетбол', icon: '🏀' },
  { key: 'tennis', label: 'Теннис', icon: '🎾' },
  { key: 'hockey', label: 'Хоккей', icon: '🏒' },
  { key: 'baseball', label: 'Бейсбол', icon: '⚾' },
  { key: 'esports', label: 'Киберспорт', icon: '🎮' },
  { key: 'volleyball', label: 'Волейбол', icon: '🏐' },
];

const CONFIDENCE_PRESETS = [
  { value: 0, label: 'Любая' },
  { value: 50, label: '50%+' },
  { value: 70, label: '70%+' },
  { value: 85, label: '85%+' },
];

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const { settings, updateSettings, toggleSport, resetSettings } = useSettings();

  const handleReset = () => {
    resetSettings();
    toast.success('Настройки сброшены', { duration: 2000 });
  };

  const handleSportToggle = (sportKey: string, label: string) => {
    toggleSport(sportKey);
    const isActive = !settings.preferredSports.includes(sportKey);
    toast.success(
      isActive ? `Фильтр «${label}» включён` : `Фильтр «${label}» выключен`,
      { duration: 1800 },
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] dark:bg-slate-950">
        <DrawerHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
          <DrawerTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            <Settings className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Настройки просмотра
          </DrawerTitle>
          <DrawerDescription className="text-xs text-slate-500 dark:text-slate-400">
            Персональные фильтры применяются автоматически к списку пиков. Настройки сохраняются в этом браузере.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-6 overflow-y-auto px-4 py-5">
          {/* Виды спорта */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Trophy className="h-4 w-4 text-amber-500" />
              Виды спорта
            </h3>
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              Выберите виды спорта для отображения. Пустой выбор = показывать все.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SPORT_OPTIONS.map((sport) => {
                const active = settings.preferredSports.includes(sport.key);
                return (
                  <button
                    key={sport.key}
                    type="button"
                    onClick={() => handleSportToggle(sport.key, sport.label)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                      active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600',
                    )}
                    aria-pressed={active}
                  >
                    <span className="text-base">{sport.icon}</span>
                    <span className="flex-1 text-left text-xs">{sport.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
            {settings.preferredSports.length > 0 && (
              <button
                type="button"
                onClick={() => updateSettings({ preferredSports: [] })}
                className="mt-2 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Сбросить фильтр видов спорта
              </button>
            )}
          </section>

          {/* Порог уверенности */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Минимальная уверенность ИИ
            </h3>
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              Показывать только пики с уверенностью не ниже выбранного порога.
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CONFIDENCE_PRESETS.map((preset) => {
                const active = settings.minConfidence === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => updateSettings({ minConfidence: preset.value })}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-all',
                      active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                    )}
                    aria-pressed={active}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {settings.minConfidence > 0 && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                <Filter className="mr-1 inline h-3 w-3 text-emerald-600" />
                Скрываются пики с уверенностью ниже {settings.minConfidence}%
              </div>
            )}
          </section>

          {/* Переключатели */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Eye className="h-4 w-4 text-purple-500" />
              Отображение
            </h3>
            <div className="space-y-2">
              <ToggleRow
                icon={<EyeOff className="h-4 w-4" />}
                title="Скрыть пики с низкой уверенностью"
                description="Не показывать пики с уверенностью ниже 40%"
                checked={settings.hideLowConfidence}
                onCheckedChange={(v) => updateSettings({ hideLowConfidence: v })}
              />
              <ToggleRow
                icon={<Trophy className="h-4 w-4" />}
                title="Показывать ESPN-пики"
                description="Пики с расписанием из ESPN API (ЧМ, WNBA, MLB)"
                checked={settings.showEspnPicks}
                onCheckedChange={(v) => updateSettings({ showEspnPicks: v })}
              />
            </div>
          </section>

          {/* Часовой пояс */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Clock className="h-4 w-4 text-cyan-500" />
              Часовой пояс
            </h3>
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {settings.timezone === 'Europe/Moscow' ? '🇷🇺 Москва (UTC+3)' : settings.timezone}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Время всех матчей отображается в этом поясе. Смена пояса будет доступна в следующей версии.
              </p>
            </div>
          </section>
        </div>

        <DrawerFooter className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Настроек активно: {countActiveSettings(settings)}
            </p>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Сбросить всё
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 text-slate-500 dark:text-slate-400">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function countActiveSettings(s: UserSettings): number {
  let count = 0;
  if (s.preferredSports.length > 0) count += 1;
  if (s.minConfidence > 0) count += 1;
  if (s.hideLowConfidence) count += 1;
  if (!s.showEspnPicks) count += 1;
  return count;
}
