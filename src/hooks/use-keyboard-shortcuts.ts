'use client';

import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;            // 'k', 'j', '/', 'Escape', etc.
  ctrl?: boolean;         // требовать Ctrl/Cmd
  shift?: boolean;        // требовать Shift
  alt?: boolean;          // требовать Alt
  handler: () => void;
  // Не срабатывать если фокус в input/textarea/contenteditable
  ignoreInputs?: boolean;
  description?: string;   // для подсказки
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        if (s.ctrl && !(e.ctrlKey || e.metaKey)) continue;
        if (s.shift && !e.shiftKey) continue;
        if (s.alt && !e.altKey) continue;

        // Спец-клавиши нормализуем
        const key = e.key;
        if (key.toLowerCase() !== s.key.toLowerCase()) continue;

        // Игнорируем shortcut если фокус в input (если ignoreInputs !== false)
        if (s.ignoreInputs !== false && isEditable(e.target)) {
          // Кроме Escape — он должен работать везде (закрытие модалок)
          if (s.key !== 'Escape') continue;
        }

        e.preventDefault();
        s.handler();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
