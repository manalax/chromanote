/**
 * Whether this browser can actually do speech recognition. Some Chromium
 * browsers (Arc, Brave, Opera, Vivaldi) expose the Web Speech API but have no
 * speech service behind it, so every attempt fails with a "network" error.
 */
export type UnsupportedReason = 'no-api' | 'brave' | 'arc' | 'opera' | 'vivaldi' | 'no-service';

export type SpeechSupport = { supported: true } | { supported: false; reason: UnsupportedReason };

export interface SpeechEnv {
  hasApi: boolean;
  userAgent: string;
  isBrave: boolean;
  isArc: boolean;
  isOpera: boolean;
  /** A previous attempt in this browser showed it has no speech service. */
  knownUnavailable: boolean;
}

const UNAVAILABLE_KEY = 'chromanote:speech-unavailable';
const ALTERNATIVES = 'Use Chrome, Edge or Safari to dictate.';

export const UNSUPPORTED_MESSAGES: Record<UnsupportedReason, string> = {
  'no-api': `This browser doesn't support dictation. ${ALTERNATIVES}`,
  brave: `Brave doesn't support dictation. ${ALTERNATIVES}`,
  arc: `Arc doesn't support dictation. ${ALTERNATIVES}`,
  opera: `Opera doesn't support dictation. ${ALTERNATIVES}`,
  vivaldi: `Vivaldi doesn't support dictation. ${ALTERNATIVES}`,
  'no-service': `This browser can't reach a speech service (Arc, Brave, Opera and Vivaldi don't support dictation). ${ALTERNATIVES}`,
};

export function detectSpeechSupport(env: SpeechEnv): SpeechSupport {
  if (!env.hasApi) return { supported: false, reason: 'no-api' };
  if (env.isBrave) return { supported: false, reason: 'brave' };
  if (env.isArc) return { supported: false, reason: 'arc' };
  if (env.isOpera || /\bOPR\//.test(env.userAgent)) return { supported: false, reason: 'opera' };
  if (/\bVivaldi\b/i.test(env.userAgent)) return { supported: false, reason: 'vivaldi' };
  if (env.knownUnavailable) return { supported: false, reason: 'no-service' };
  return { supported: true };
}

/** Reads the real browser environment. */
export function readSpeechEnv(): SpeechEnv {
  if (typeof window === 'undefined') {
    return { hasApi: false, userAgent: '', isBrave: false, isArc: false, isOpera: false, knownUnavailable: false };
  }
  const nav = navigator as Navigator & { brave?: unknown };
  let isArc = false;
  try {
    // Arc injects its theme colours as CSS variables on the root element.
    isArc = getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title').trim() !== '';
  } catch {
    // styles unavailable
  }
  return {
    hasApi: !!(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    userAgent: nav.userAgent,
    isBrave: nav.brave !== undefined,
    isArc,
    isOpera: 'opr' in window,
    knownUnavailable: readFlag(),
  };
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(UNAVAILABLE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Event fired when the remembered support status changes. */
export const SPEECH_SUPPORT_EVENT = 'chromanote:speech-support';

export function markSpeechUnavailable(): void {
  try {
    localStorage.setItem(UNAVAILABLE_KEY, '1');
  } catch {
    // storage unavailable: the mic just won't stay disabled after a reload
  }
  window.dispatchEvent(new Event(SPEECH_SUPPORT_EVENT));
}

export function clearSpeechUnavailable(): void {
  try {
    localStorage.removeItem(UNAVAILABLE_KEY);
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(SPEECH_SUPPORT_EVENT));
}

export function currentSpeechSupport(): SpeechSupport {
  return detectSpeechSupport(readSpeechEnv());
}
