import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './en';
import { es } from './es';

export type UiLocale = 'en' | 'es';

/** English is the shape every other locale has to satisfy. */
export type Dict = typeof en;

const DICTS: Record<UiLocale, Dict> = { en, es };

export const LOCALES: Array<{ id: UiLocale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const KEY = 'ai-office.locale';

/**
 * Remembering the choice is a per-browser convenience, so a blocked or empty localStorage
 * has to fall back silently rather than break the app.
 */
function stored(): UiLocale | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'es' ? v : null;
  } catch { return null; }
}

/** English by default, but a Spanish browser lands on Spanish without having to pick. */
function initial(): UiLocale {
  const saved = stored();
  if (saved) return saved;
  try {
    return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch { return 'en'; }
}

type Ctx = { locale: UiLocale; setLocale: (l: UiLocale) => void; t: Dict };

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setState] = useState<UiLocale>(initial);

  const setLocale = useCallback((l: UiLocale) => {
    setState(l);
    try { localStorage.setItem(KEY, l); } catch { /* private mode, blocked storage */ }
  }, []);

  // Keeps <html lang> honest: screen readers and the browser's spellchecker read it.
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: DICTS[locale] }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useT must be used inside a <LocaleProvider>');
  return ctx;
}

/** The strings. */
export const useT = (): Dict => useCtx().t;

/** The current language and how to change it. */
export function useLocale(): [UiLocale, (l: UiLocale) => void] {
  const { locale, setLocale } = useCtx();
  return [locale, setLocale];
}
