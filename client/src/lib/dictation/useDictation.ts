import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '../settings';
import { type BrowserSpeechEngine, createBrowserEngine } from './browserEngine';
import { SPEECH_SUPPORT_EVENT, UNSUPPORTED_MESSAGES } from './browserSupport';

export type DictationState = 'idle' | 'listening' | 'tidying' | 'unsupported';

interface Options {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Runs after listening stops (e.g. the AI tidy-up). */
  onStop?: () => Promise<void> | void;
  /**
   * Run `onStop` in the background: the mic is free again straight away and
   * `pending` is true until it finishes. Otherwise the state is 'tidying'.
   */
  background?: boolean;
}

/** Only one microphone session at a time across the app. */
let stopActive: (() => void) | null = null;

/** The dictation language: the user's setting, else the browser's language. */
export function useDictationLang(): string {
  const { settings } = useSettings();
  return settings.dictation_lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
}

export function useDictation({ onInterim, onFinal, onStop, background = false }: Options) {
  const engine = useRef<BrowserSpeechEngine | null>(null);
  engine.current ??= createBrowserEngine();
  const lang = useDictationLang();
  const [state, setState] = useState<DictationState>(engine.current.supported ? 'idle' : 'unsupported');
  const [reason, setReason] = useState(engine.current.unsupportedReason);
  /** Background `onStop` runs still in flight. */
  const [running, setRunning] = useState(0);

  // Re-check support when it changes (a failed attempt, or "Try dictation again").
  useEffect(() => {
    const recheck = () => {
      const e = engine.current;
      if (!e) return;
      setReason(e.unsupportedReason);
      setState((s) => (s === 'listening' || s === 'tidying' ? s : e.supported ? 'idle' : 'unsupported'));
    };
    window.addEventListener(SPEECH_SUPPORT_EVENT, recheck);
    return () => window.removeEventListener(SPEECH_SUPPORT_EVENT, recheck);
  }, []);

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
        // The session may have revealed that this browser has no speech service.
        const settled = (): DictationState => (e.supported ? 'idle' : 'unsupported');
        setReason(e.unsupportedReason);
        const after = handlers.current.onStop;
        if (!after) {
          setState(settled());
          return;
        }
        const run = () => Promise.resolve(after()).catch(() => toast.error('Could not tidy up the dictated text'));
        if (background) {
          setState(settled());
          setRunning((n) => n + 1);
          void run().finally(() => setRunning((n) => n - 1));
          return;
        }
        setState('tidying');
        void run().finally(() => setState(settled()));
      },
    });
  }, [lang, background]);

  const toggle = useCallback(() => {
    if (state === 'listening') stop();
    else if (state === 'idle') start();
  }, [state, start, stop]);

  // Stop listening when the component goes away.
  useEffect(() => () => engine.current?.stop(), []);

  /** Why the mic is disabled, for tooltips and Settings. */
  const unsupportedMessage = reason ? UNSUPPORTED_MESSAGES[reason] : null;

  return { state, toggle, stop, lang, unsupportedMessage, pending: running > 0 };
}
