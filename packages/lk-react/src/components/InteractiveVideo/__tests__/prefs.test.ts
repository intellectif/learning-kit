import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPreferenceChange,
  DEFAULT_PREFERENCES,
  readStoredPreferences,
  rememberPreferences,
  resolvePreferences,
  sanitizePartialPreferences,
  sanitizePreferences,
} from '../prefs.js';

/**
 * What the player remembers, and whose word wins. Four layers decide each
 * field on its own — what the host forces, what the learner chose, what the
 * host suggests, the SDK's defaults — so a learner who has only ever changed
 * the volume still gets the language pair their host suggests.
 */

afterEach(() => {
  localStorage.clear();
});

describe('sanitising', () => {
  it('holds every stored value inside what the controls can undo', () => {
    expect(
      sanitizePreferences({
        speed: 16,
        volume: 50,
        muted: 'yes',
        captions: false,
        captionLanguage: 'javascript:alert(1)',
        secondaryCaptionLanguage: '<script>',
        captionSize: 'enormous',
        panel: true,
      }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      volume: 1,
      captions: false,
      panel: true,
    });
  });

  it('keeps values that are in range, both languages among them', () => {
    expect(
      sanitizePreferences({
        speed: 1.5,
        volume: 0.25,
        captionLanguage: 'pt-BR',
        secondaryCaptionLanguage: 'es-419',
      }),
    ).toMatchObject({
      speed: 1.5,
      volume: 0.25,
      captionLanguage: 'pt-BR',
      secondaryCaptionLanguage: 'es-419',
    });
  });

  it('answers the defaults for anything that is not an object', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('speed=2')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences([])).toEqual(DEFAULT_PREFERENCES);
  });

  it('turns a pair of one language into no pair, whatever the case', () => {
    expect(
      sanitizePreferences({ captionLanguage: 'en', secondaryCaptionLanguage: 'EN' })
        .secondaryCaptionLanguage,
    ).toBeNull();
    expect(
      sanitizePreferences({ captionLanguage: 'en', secondaryCaptionLanguage: 'es' })
        .secondaryCaptionLanguage,
    ).toBe('es');
  });

  it('reads only the fields that are there and usable, keeping null as a choice', () => {
    expect(
      sanitizePartialPreferences({
        secondaryCaptionLanguage: null,
        captionLanguage: 'not a tag',
        speed: 3,
        volume: 0.5,
      }),
    ).toEqual({ secondaryCaptionLanguage: null, volume: 0.5 });
    expect(sanitizePartialPreferences({})).toEqual({});
    expect(sanitizePartialPreferences(undefined)).toEqual({});
  });
});

describe('the four layers', () => {
  const pair = { captionLanguage: 'en', secondaryCaptionLanguage: 'es' };

  it('uses the host suggestion where the learner chose nothing', () => {
    expect(resolvePreferences({ defaults: pair })).toMatchObject(pair);
  });

  it('puts what the learner chose above the host suggestion, field by field', () => {
    // The learner turned the second line off, and changed nothing else.
    const resolved = resolvePreferences({
      defaults: { ...pair, speed: 1.25 },
      stored: { secondaryCaptionLanguage: null },
    });
    expect(resolved.secondaryCaptionLanguage).toBeNull();
    // Fields they never chose still come from the host.
    expect(resolved.captionLanguage).toBe('en');
    expect(resolved.speed).toBe(1.25);
  });

  it('puts the force above what the learner chose', () => {
    expect(
      resolvePreferences({
        force: { captionLanguage: 'ar' },
        stored: { captionLanguage: 'es' },
        defaults: { captionLanguage: 'en' },
      }).captionLanguage,
    ).toBe('ar');
  });

  it('puts a change made while the video is open above even the force', () => {
    expect(resolvePreferences({ force: { panel: true }, chosen: { panel: false } }).panel).toBe(
      false,
    );
  });

  it('takes nothing unusable from a host either', () => {
    expect(resolvePreferences({ defaults: { speed: 3 }, force: { volume: 9 } })).toMatchObject({
      speed: 1,
      volume: 1,
    });
  });

  it('drops a second line that a lower layer made equal to the first', () => {
    // The learner picked Spanish as their first language; the host suggests
    // it as the second. One language twice is no pair.
    expect(
      resolvePreferences({ stored: { captionLanguage: 'es' }, defaults: pair })
        .secondaryCaptionLanguage,
    ).toBeNull();
  });
});

describe('storage', () => {
  it('stores what the learner changed, and nothing the host said', () => {
    rememberPreferences({ secondaryCaptionLanguage: null });
    rememberPreferences({ volume: 0.5 });
    expect(JSON.parse(localStorage.getItem('lk.video.v1') ?? '{}')).toEqual({
      secondaryCaptionLanguage: null,
      volume: 0.5,
    });
    expect(readStoredPreferences()).toEqual({ secondaryCaptionLanguage: null, volume: 0.5 });
  });

  it('reads a 15.0 payload — every field, no second language — as every field chosen', () => {
    const { secondaryCaptionLanguage: _new, ...fifteen } = {
      ...DEFAULT_PREFERENCES,
      captionLanguage: 'es',
    };
    localStorage.setItem('lk.video.v1', JSON.stringify(fifteen));
    const stored = readStoredPreferences();
    expect(stored.captionLanguage).toBe('es');
    expect('secondaryCaptionLanguage' in stored).toBe(false);
    // So a host's suggested second line still reaches this learner.
    expect(
      resolvePreferences({ stored, defaults: { secondaryCaptionLanguage: 'en' } })
        .secondaryCaptionLanguage,
    ).toBe('en');
  });

  it('survives storage that holds nonsense, and storage that refuses', () => {
    localStorage.setItem('lk.video.v1', '{not json');
    expect(readStoredPreferences()).toEqual({});
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => rememberPreferences({ speed: 1.5 })).not.toThrow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});

describe('applying a change', () => {
  it('clamps it and keeps the pair honest', () => {
    const before = {
      ...DEFAULT_PREFERENCES,
      captionLanguage: 'en',
      secondaryCaptionLanguage: 'es',
    };
    expect(applyPreferenceChange(before, { volume: 4 }).volume).toBe(1);
    expect(applyPreferenceChange(before, { captionLanguage: 'es' }).secondaryCaptionLanguage).toBe(
      null,
    );
  });
});
