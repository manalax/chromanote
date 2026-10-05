import { createBrowserEngine } from './browserEngine';

/** Common languages supported by browser speech recognition (BCP-47 tags). */
export const DICTATION_LANGUAGES: { tag: string; label: string }[] = [
  { tag: 'en-US', label: 'English (US)' },
  { tag: 'en-GB', label: 'English (UK)' },
  { tag: 'en-AU', label: 'English (Australia)' },
  { tag: 'en-IN', label: 'English (India)' },
  { tag: 'es-ES', label: 'Español (España)' },
  { tag: 'es-MX', label: 'Español (México)' },
  { tag: 'fr-FR', label: 'Français' },
  { tag: 'de-DE', label: 'Deutsch' },
  { tag: 'it-IT', label: 'Italiano' },
  { tag: 'pt-BR', label: 'Português (Brasil)' },
  { tag: 'pt-PT', label: 'Português (Portugal)' },
  { tag: 'nl-NL', label: 'Nederlands' },
  { tag: 'sv-SE', label: 'Svenska' },
  { tag: 'pl-PL', label: 'Polski' },
  { tag: 'tr-TR', label: 'Türkçe' },
  { tag: 'ru-RU', label: 'Русский' },
  { tag: 'hi-IN', label: 'हिन्दी' },
  { tag: 'ja-JP', label: '日本語' },
  { tag: 'ko-KR', label: '한국어' },
  { tag: 'zh-CN', label: '中文 (简体)' },
  { tag: 'zh-TW', label: '中文 (繁體)' },
  { tag: 'fil-PH', label: 'Filipino' },
];

export function dictationSupported(): boolean {
  return createBrowserEngine().supported;
}
