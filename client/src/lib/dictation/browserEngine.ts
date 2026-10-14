import {
  type SpeechSupport,
  UNSUPPORTED_MESSAGES,
  type UnsupportedReason,
  currentSpeechSupport,
  markSpeechUnavailable,
} from './browserSupport';
import type { DictationHandlers, SpeechEngine } from './engine';

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;

declare global {
  interface Window {
    // Standard name, and the prefixed one used by Chrome and Safari.
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

/** An error this soon after starting, before any speech, means there is no speech service. */
export const NO_SERVICE_WINDOW_MS = 3000;
/** Backoff for restarting after a network blip mid-session. */
export const RETRY_DELAYS_MS = [500, 1000, 2000];

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow it in your browser to dictate.',
  'audio-capture': 'No microphone was found.',
  'language-not-supported': 'Your browser does not support dictation in the chosen language.',
};
const LOST_CONNECTION = 'Lost connection to the speech service. Dictation stopped.';

interface EngineDeps {
  Ctor?: RecognitionCtor;
  support?: () => SpeechSupport;
  markUnavailable?: () => void;
  now?: () => number;
}

export interface BrowserSpeechEngine extends SpeechEngine {
  readonly unsupportedReason: UnsupportedReason | null;
}

/** Browser speech recognition (Chrome, Edge, Safari). */
export function createBrowserEngine(deps: EngineDeps = {}): BrowserSpeechEngine {
  const Ctor = () =>
    deps.Ctor ??
    (typeof window === 'undefined' ? undefined : (window.SpeechRecognition ?? window.webkitSpeechRecognition));
  const support = deps.support ?? currentSpeechSupport;
  const markUnavailable = deps.markUnavailable ?? markSpeechUnavailable;
  const now = deps.now ?? Date.now;

  let recognition: Recognition | null = null;
  let active = false;
  let handlers: DictationHandlers | null = null;
  let startedAt = 0;
  let heardSpeech = false;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = () => {
    active = false;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    handlers?.onInterim('');
    handlers?.onEnd();
  };

  const fail = (message: string) => {
    active = false;
    handlers?.onError(message);
  };

  const begin = () => {
    const RecognitionClass = Ctor();
    if (!RecognitionClass || !handlers) return;
    const h = handlers;
    const rec = new RecognitionClass();
    recognition = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      heardSpeech = true;
      retries = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) h.onFinal(result[0].transcript);
        else interim += result[0].transcript;
      }
      h.onInterim(interim);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine; the session restarts or ends quietly.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'network' || e.error === 'service-not-allowed') {
        if (!heardSpeech && now() - startedAt < NO_SERVICE_WINDOW_MS) {
          // Failed straight away: this browser has no speech service.
          markUnavailable();
          return fail(UNSUPPORTED_MESSAGES['no-service']);
        }
        if (retries < RETRY_DELAYS_MS.length) {
          // A blip mid-session: restart after a short wait (onend below won't restart).
          const delay = RETRY_DELAYS_MS[retries++];
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (active) begin();
            else finish();
          }, delay);
          return;
        }
        return fail(LOST_CONNECTION);
      }
      fail(ERRORS[e.error] ?? `Dictation stopped (${e.error}).`);
    };
    rec.onend = () => {
      if (retryTimer) return; // a retry is scheduled
      if (active) {
        // Browsers end a session after a pause; keep listening until asked to stop.
        try {
          begin();
          return;
        } catch {
          active = false;
        }
      }
      finish();
    };
    rec.start();
  };

  let lang = 'en-US';

  return {
    get supported() {
      return support().supported;
    },
    get unsupportedReason() {
      const s = support();
      return s.supported ? null : s.reason;
    },

    start(language, h) {
      if (active || !Ctor() || !support().supported) return;
      lang = language;
      handlers = h;
      active = true;
      heardSpeech = false;
      retries = 0;
      startedAt = now();
      try {
        begin();
      } catch (err) {
        fail((err as Error).message || 'Could not start dictation.');
        finish();
      }
    },

    stop() {
      active = false;
      if (retryTimer) {
        // Nothing is listening during the wait, so no onend will come: end now.
        finish();
        return;
      }
      recognition?.stop();
    },
  };
}
