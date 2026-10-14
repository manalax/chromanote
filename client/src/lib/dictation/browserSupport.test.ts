import { describe, expect, it } from 'vitest';
import { type SpeechEnv, detectSpeechSupport } from './browserSupport';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const env = (over: Partial<SpeechEnv> = {}): SpeechEnv => ({
  hasApi: true,
  userAgent: CHROME_UA,
  isBrave: false,
  isArc: false,
  isOpera: false,
  knownUnavailable: false,
  ...over,
});

describe('detectSpeechSupport', () => {
  it('supports Chrome', () => {
    expect(detectSpeechSupport(env())).toEqual({ supported: true });
  });

  it('rejects browsers without the Web Speech API (e.g. Firefox)', () => {
    expect(detectSpeechSupport(env({ hasApi: false }))).toEqual({ supported: false, reason: 'no-api' });
  });

  it('rejects Chromium browsers that have the API but no speech service', () => {
    expect(detectSpeechSupport(env({ isBrave: true }))).toEqual({ supported: false, reason: 'brave' });
    expect(detectSpeechSupport(env({ isArc: true }))).toEqual({ supported: false, reason: 'arc' });
    expect(detectSpeechSupport(env({ isOpera: true }))).toEqual({ supported: false, reason: 'opera' });
    expect(detectSpeechSupport(env({ userAgent: `${CHROME_UA} OPR/114.0.0.0` }))).toEqual({
      supported: false,
      reason: 'opera',
    });
    expect(detectSpeechSupport(env({ userAgent: `${CHROME_UA} Vivaldi/7.0` }))).toEqual({
      supported: false,
      reason: 'vivaldi',
    });
  });

  it('remembers a browser that failed to reach a speech service', () => {
    expect(detectSpeechSupport(env({ knownUnavailable: true }))).toEqual({ supported: false, reason: 'no-service' });
  });
});
