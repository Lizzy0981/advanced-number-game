import { es } from './es';
import { en } from './en';
import { fr } from './fr';
import { pt } from './pt';
import { ru } from './ru';
import { tr } from './tr';
import { ar } from './ar';
import { he } from './he';
import { ko } from './ko';
import { ja } from './ja';
import { zh } from './zh';
import type { SupportedLanguage } from '../i18n.service';

export const TRANSLATIONS: Record<SupportedLanguage, typeof es> = {
  es, en, fr, pt, ru, tr, ar, he, ko, ja, zh,
};

/** Type representing all translation keys — ensures exhaustive type checking */
export type TranslationKeys = typeof es;
