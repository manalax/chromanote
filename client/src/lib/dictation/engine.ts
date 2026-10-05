export interface DictationHandlers {
  /** The phrase being spoken right now (replaced on every update). */
  onInterim: (text: string) => void;
  /** A finished phrase. */
  onFinal: (text: string) => void;
  /** A user-facing error message. */
  onError: (message: string) => void;
  /** The engine stopped (by request or on its own). */
  onEnd: () => void;
}

/**
 * Speech-to-text engine. The browser engine is used today; a Databricks
 * Whisper engine (record audio, transcribe server-side) can implement the same
 * interface later.
 */
export interface SpeechEngine {
  readonly supported: boolean;
  start(lang: string, handlers: DictationHandlers): void;
  stop(): void;
}
