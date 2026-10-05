import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '../settings';
import { createBrowserEngine } from './browserEngine';
import type { SpeechEngine } from './engine';

export type DictationState = 'idle' | 'listening' | 'tidying' | 'unsupported';

interface Options {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Runs after listening stops (e.g. the AI tidy-up); the state is 'tidying' meanwhile. */
  onStop?: () => Promise<void> | void;
}

/** Only one microphone session at a time across the app. */
let stopActive: (() => void) | null = null;

/** The dictation language: the user's setting, else the browser's language. */
export function useDictationLang(): string {
  const { settings } = useSettings();
  return settings.dictation_lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
}

export function useDictation({ onInterim, onFinal, onStop }: Options) {
  const engine = useRef<SpeechEngine | null>(null);
  engine.current ??= createBrowserEngine();
  const lang = useDictationLang();
  const [state, setState] = useState<DictationState>(engine.current.supported ? 'idle' : 'unsupported');

  // Handlers change every render; the engine always calls the latest ones.
  const handlers = useRef({ onInterim, onFinal, onStop });
  useEffect(() => {
    handlers.current = { onInterim, onFinal, onStop };
  });

  const stop = useCallback(() => engine.current?.stop(), []);

  const start = useCallback(() => {
    const e = engine.current;
    if (!e?.supported) return;
    stopActive?.();
    stopActive = () => e.stop();
    setState('listening');
    e.start(lang, {
      onInterim: (t) => handlers.current.onInterim(t),
      onFinal: (t) => handlers.current.onFinal(t),
      onError: (message) => toast.error(message),
      onEnd: () => {
        if (stopActive && engine.current === e) stopActive = null;
        const after = handlers.current.onStop;
        if (!after) {
          setState('idle');
          return;
        }
        setState('tidying');
        Promise.resolve(after())
          .catch(() => toast.error('Could not tidy up the dictated text'))
          .finally(() => setState('idle'));
      },
    });
  }, [lang]);

  const toggle = useCallback(() => {
    if (state === 'listening') stop();
    else if (state === 'idle') start();
  }, [state, start, stop]);

  // Stop listening when the component goes away.
  useEffect(() => () => engine.current?.stop(), []);

  return { state, toggle, stop, lang };
}
