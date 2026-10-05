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
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow it in your browser to dictate.',
  'service-not-allowed': 'Dictation is blocked by your browser settings.',
  'audio-capture': 'No microphone was found.',
  network: 'Dictation needs an internet connection (your browser transcribes speech online).',
  'language-not-supported': 'Your browser does not support dictation in the chosen language.',
};

/** Browser speech recognition (Chrome, Edge, Safari). */
export function createBrowserEngine(): SpeechEngine {
  const Ctor = recognitionCtor();
  let recognition: Recognition | null = null;
  let active = false;

  return {
    supported: !!Ctor,

    start(lang, handlers: DictationHandlers) {
      if (!Ctor || active) return;
      active = true;
      const begin = () => {
        recognition = new Ctor();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            if (result.isFinal) handlers.onFinal(result[0].transcript);
            else interim += result[0].transcript;
          }
          handlers.onInterim(interim);
        };
        recognition.onerror = (e) => {
          // "no-speech" and "aborted" are routine; the session restarts or ends quietly.
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          active = false;
          handlers.onError(ERRORS[e.error] ?? `Dictation stopped (${e.error}).`);
        };
        recognition.onend = () => {
          // Browsers end a session after a pause; keep listening until asked to stop.
          if (active) {
            try {
              begin();
              return;
            } catch {
              active = false;
            }
          }
          handlers.onInterim('');
          handlers.onEnd();
        };
        recognition.start();
      };
      try {
        begin();
      } catch (err) {
        active = false;
        handlers.onError((err as Error).message || 'Could not start dictation.');
        handlers.onEnd();
      }
    },

    stop() {
      active = false;
      recognition?.stop();
    },
  };
}
