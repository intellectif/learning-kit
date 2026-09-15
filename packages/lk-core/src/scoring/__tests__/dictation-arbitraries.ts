import fc from 'fast-check';
import { validateActivity } from '../../schemas/index.js';
import type { DictationData } from '../../types/activity.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const ACCENTED = ['café', 'niño', 'praça', 'não', 'está', 'über'];

const tokenArb = (max = 8): fc.Arbitrary<string> =>
  fc.oneof(
    fc.array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: max }).map((a) => a.join('')),
    fc.constantFrom(...ACCENTED),
  );

/** A sentence of 1–12 words, with sentence punctuation an author would type. */
const sentenceArb = fc
  .array(tokenArb(), { minLength: 1, maxLength: 12 })
  .chain((words) =>
    fc
      .constantFrom('', '.', '?', '!', ', ')
      .map((mark) => (mark === ', ' ? words.join(', ') : `${words.join(' ')}${mark}`)),
  );

/**
 * Valid `DictationData`: a transcript, optionally accepted alternatives that
 * differ from it, a recording, a slow recording on a different file, hints,
 * whole-word equivalences and the shared optional fields. Every value is
 * checked against the schema, so a property that holds over this arbitrary
 * holds over content `validateActivity` accepts.
 */
export function arbitraryDictationData(): fc.Arbitrary<DictationData> {
  return fc
    .record({
      transcript: sentenceArb,
      accepted: fc.array(sentenceArb, { maxLength: 3 }),
      media: fc.option(
        fc.record({
          url: fc.constantFrom('/a.mp3', 'https://cdn.example/a.mp3', 'blob:https://x/1'),
          playback: fc.option(
            fc.constantFrom(
              { seek: 'none' as const },
              { rate: 'fixed' as const },
              { seek: 'none' as const, rate: 'fixed' as const },
            ),
            { nil: undefined },
          ),
        }),
        { nil: undefined },
      ),
      slow: fc.boolean(),
      hints: fc.boolean(),
      rules: fc.array(
        fc.record({ from: tokenArb(), to: fc.array(tokenArb(), { minLength: 1, maxLength: 3 }) }),
        { maxLength: 3 },
      ),
      passThreshold: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
      feedback: fc.boolean(),
      id: tokenArb(),
    })
    .map((base): DictationData => {
      const acceptedTranscripts = base.accepted.filter((text) => text !== base.transcript);
      const media: DictationData['media'] | undefined =
        base.media === undefined
          ? undefined
          : {
              type: 'audio',
              url: base.media.url,
              alt: 'Recording',
              ...(base.media.playback !== undefined ? { playback: base.media.playback } : {}),
            };
      return {
        schemaVersion: '1.0',
        type: 'dictation',
        id: base.id,
        title: 'Listen, then type what you hear',
        transcript: base.transcript,
        ...(acceptedTranscripts.length > 0 ? { acceptedTranscripts } : {}),
        ...(media !== undefined ? { media } : {}),
        ...(media !== undefined && base.slow
          ? { slowMedia: { type: 'audio', url: `${media.url}?slow`, alt: 'Recording, slow' } }
          : {}),
        ...(base.hints ? { hints: { mode: 'progressive-words' } } : {}),
        ...(base.rules.length > 0
          ? {
              tolerance: {
                equivalences: base.rules.map((rule) => ({
                  from: rule.from,
                  to: rule.to.join(' '),
                })),
              },
            }
          : {}),
        ...(base.passThreshold !== undefined ? { passThreshold: base.passThreshold } : {}),
        ...(base.feedback ? { feedback: { correct: 'Well heard.', incorrect: 'Once more.' } } : {}),
      };
    })
    .filter((data) => validateActivity('dictation', data).success);
}
