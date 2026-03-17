import { Injectable, signal, computed } from '@angular/core';
import { TRANSLATIONS } from './translations';

export type SupportedLanguage =
  | 'es' | 'en' | 'fr' | 'pt' | 'ru'
  | 'tr' | 'ar' | 'he' | 'ko' | 'ja' | 'zh';

export interface LanguageMeta {
  label:      string;
  nativeName: string;
  flag:       string;
  dir:        'ltr' | 'rtl';
  locale:     string;
}

export const LANGUAGE_META: Record<SupportedLanguage, LanguageMeta> = {
  es: { label: 'Español',   nativeName: 'Español',   flag: '🇪🇸', dir: 'ltr', locale: 'es-ES' },
  en: { label: 'English',   nativeName: 'English',   flag: '🇬🇧', dir: 'ltr', locale: 'en-US' },
  fr: { label: 'Français',  nativeName: 'Français',  flag: '🇫🇷', dir: 'ltr', locale: 'fr-FR' },
  pt: { label: 'Português', nativeName: 'Português', flag: '🇧🇷', dir: 'ltr', locale: 'pt-BR' },
  ru: { label: 'Русский',   nativeName: 'Русский',   flag: '🇷🇺', dir: 'ltr', locale: 'ru-RU' },
  tr: { label: 'Türkçe',    nativeName: 'Türkçe',    flag: '🇹🇷', dir: 'ltr', locale: 'tr-TR' },
  ar: { label: 'العربية',   nativeName: 'العربية',   flag: '🇸🇦', dir: 'rtl', locale: 'ar-SA' },
  he: { label: 'עברית',     nativeName: 'עברית',     flag: '🇮🇱', dir: 'rtl', locale: 'he-IL' },
  ko: { label: '한국어',     nativeName: '한국어',    flag: '🇰🇷', dir: 'ltr', locale: 'ko-KR' },
  ja: { label: '日本語',     nativeName: '日本語',    flag: '🇯🇵', dir: 'ltr', locale: 'ja-JP' },
  zh: { label: '中文',       nativeName: '中文',      flag: '🇨🇳', dir: 'ltr', locale: 'zh-CN' },
};

export const ALL_LANGUAGES = Object.keys(LANGUAGE_META) as SupportedLanguage[];

@Injectable({ providedIn: 'root' })
export class I18nService {
  /** Current language — reactive signal */
  readonly lang = signal<SupportedLanguage>(this.detectLanguage());

  /** Current text direction — auto-computed */
  readonly dir = computed<'ltr' | 'rtl'>(() => LANGUAGE_META[this.lang()].dir);

  /** Current locale string for Intl APIs */
  readonly locale = computed(() => LANGUAGE_META[this.lang()].locale);

  /** True if current language is RTL */
  readonly isRTL = computed(() => this.dir() === 'rtl');

  constructor() {
    // Apply language to document on init
    this.applyToDocument(this.lang());
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Change the active language.
   * Persists to localStorage and updates document attributes.
   */
  setLanguage(lang: SupportedLanguage): void {
    this.lang.set(lang);
    localStorage.setItem('app-lang', lang);
    this.applyToDocument(lang);
  }

  /**
   * Translate a dot-notation key.
   * Supports {param} interpolation.
   * Falls back to English, then returns the key itself.
   *
   * @example i18n.t('game.start')
   * @example i18n.t('hint.higher', { guess: 42 })
   */
  t(key: string, params?: Record<string, string | number>): string {
    const keys  = key.split('.');
    let   value: any = TRANSLATIONS[this.lang()];

    for (const k of keys) {
      if (value == null) { value = undefined; break; }
      value = value[k];
    }

    // Fallback chain: current lang → English → key itself
    if (typeof value !== 'string') value = this.fallback(keys, 'en');
    if (typeof value !== 'string') return key;

    return params ? this.interpolate(value, params) : value;
  }

  /**
   * Format a number according to the active locale.
   * @example i18n.formatNumber(1234567) // "1,234,567" in en, "1.234.567" in de
   */
  formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), opts).format(n);
  }

  /**
   * Format a date according to the active locale.
   */
  formatDate(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), opts).format(new Date(d));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private detectLanguage(): SupportedLanguage {
    // 1. Stored preference
    const stored = localStorage.getItem('app-lang') as SupportedLanguage;
    if (stored && ALL_LANGUAGES.includes(stored)) return stored;

    // 2. Browser language
    const browser = (navigator.language ?? 'es').toLowerCase().split('-')[0];
    if (ALL_LANGUAGES.includes(browser as SupportedLanguage)) {
      return browser as SupportedLanguage;
    }

    // 3. Default
    return 'es';
  }

  private applyToDocument(lang: SupportedLanguage): void {
    const meta = LANGUAGE_META[lang];
    document.documentElement.lang      = lang;
    document.documentElement.dir       = meta.dir;
    document.documentElement.setAttribute('data-dir',  meta.dir);
    document.documentElement.setAttribute('data-lang', lang);
  }

  private interpolate(text: string, params: Record<string, string | number>): string {
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      text
    );
  }

  private fallback(keys: string[], lang: SupportedLanguage): string {
    let v: any = TRANSLATIONS[lang];
    for (const k of keys) {
      if (v == null) return '';
      v = v[k];
    }
    return typeof v === 'string' ? v : '';
  }
}
