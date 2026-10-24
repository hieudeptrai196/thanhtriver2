import { en, type MessageKey } from './en';
import { vi } from './vi';

export type Lang = 'vi' | 'en';
export type { MessageKey };

const tables: Record<Lang, Record<MessageKey, string>> = { vi, en };
const LANG_KEY = 'thanhtri.lang';

let lang: Lang = 'vi';

export function initLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  let stored: string | null;
  try {
    stored = localStorage.getItem(LANG_KEY);
  } catch {
    stored = null;
  }
  const pick = q ?? stored;
  lang = pick === 'en' ? 'en' : 'vi';
  document.documentElement.lang = lang;
  return lang;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

// Parameters whose values are content ids get translated too.
const PARAM_PREFIX: Record<string, string> = {
  room: 'room.',
  unit: 'unit.one.',
  struct: 'struct.',
  res: 'res.',
  skill: 'skill.',
};

export function t(key: MessageKey | string, params?: Record<string, string | number>): string {
  const table = tables[lang] as Record<string, string>;
  let s = table[key] ?? (en as Record<string, string>)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const prefix = PARAM_PREFIX[k];
      const val = prefix && typeof v === 'string' ? (table[prefix + v] ?? v) : String(v);
      s = s.split('{' + k + '}').join(val);
    }
  }
  return s;
}

export function isMessageKey(key: string): key is MessageKey {
  return key in en;
}
