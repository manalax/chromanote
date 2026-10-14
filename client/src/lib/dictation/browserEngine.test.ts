import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_DELAYS_MS, type RecognitionCtor, createBrowserEngine } from './browserEngine';
import { UNSUPPORTED_MESSAGES } from './browserSupport';

/** Scriptable stand-in for SpeechRecognition; records every instance. */
function fakeRecognition() {
  const instances: FakeRec[] = [];
  class FakeRec {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    constructor() {
      instances.push(this);
    }
    start() {
      this.started = true;
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
    say(text: string, isFinal = true) {
      this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, 0: { transcript: text } } } });
    }
    error(code: string) {
      this.onerror?.({ error: code });
      this.onend?.(); // browsers fire end after an error
    }
  }
  const Ctor: RecognitionCtor = FakeRec;
  return { Ctor, instances };
}

function setup() {
  const { Ctor, instances } = fakeRecognition();
  let time = 0;
  const markUnavailable = vi.fn();
  const engine = createBrowserEngine({
    Ctor,
    support: () => ({ supported: true }),
    markUnavailable,
    now: () => time,
  });
  const handlers = { onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
  return {
    engine,
    handlers,
    instances,
    markUnavailable,
    advance: (ms: number) => {
      time += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('browser engine', () => {
  it('treats an immediate network error as "no speech service" and does not retry', () => {
    const { engine, handlers, instances, markUnavailable, advance } = setup();
    engine.start('en-US', handlers);
    advance(400);
    instances[0].error('network');
    advance(5000);
    expect(markUnavailable).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledWith(UNSUPPORTED_MESSAGES['no-service']);
    expect(handlers.onEnd).toHaveBeenCalledOnce();
    expect(instances).toHaveLength(1);
  });

  it('retries a network blip after speech was heard, keeping the session alive', () => {
    const { engine, handlers, instances, markUnavailable, advance } = setup();
    engine.start('en-US', handlers);
    instances[0].say('hello');
    advance(5000);
    instances[0].error('network');
    expect(handlers.onEnd).not.toHaveBeenCalled();
    advance(RETRY_DELAYS_MS[0]);
    expect(instances).toHaveLength(2);
    instances[1].say('world');
    expect(handlers.onFinal).toHaveBeenLastCalledWith('world');
    expect(markUnavailable).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('gives up after repeated network errors with no speech in between', () => {
    const { engine, handlers, instances, advance } = setup();
    engine.start('en-US', handlers);
    instances[0].say('hello');
    advance(5000);
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      instances[i].error('network');
      advance(RETRY_DELAYS_MS[i]);
    }
    instances[RETRY_DELAYS_MS.length].error('network');
    expect(handlers.onError).toHaveBeenCalledWith('Lost connection to the speech service. Dictation stopped.');
    expect(handlers.onEnd).toHaveBeenCalledOnce();
  });

  it('resets the retry budget whenever speech comes through', () => {
    const { engine, handlers, instances, advance } = setup();
    engine.start('en-US', handlers);
    instances[0].say('one');
    advance(5000);
    for (let i = 0; i < 6; i++) {
      instances[i].error('network');
      advance(RETRY_DELAYS_MS[0]);
      instances[i + 1].say(`phrase ${i}`);
    }
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('ends cleanly when stopped while a retry is pending', () => {
    const { engine, handlers, instances, advance } = setup();
    engine.start('en-US', handlers);
    instances[0].say('hello');
    advance(5000);
    instances[0].error('network');
    engine.stop();
    expect(handlers.onEnd).toHaveBeenCalledOnce();
    advance(5000);
    expect(instances).toHaveLength(1);
  });

  it('keeps listening across normal pauses', () => {
    const { engine, handlers, instances } = setup();
    engine.start('en-US', handlers);
    instances[0].onend?.();
    expect(instances).toHaveLength(2);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('reports microphone permission errors without marking the browser unsupported', () => {
    const { engine, handlers, instances, markUnavailable } = setup();
    engine.start('en-US', handlers);
    instances[0].error('not-allowed');
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('Microphone permission'));
    expect(markUnavailable).not.toHaveBeenCalled();
    expect(handlers.onEnd).toHaveBeenCalledOnce();
  });
});
