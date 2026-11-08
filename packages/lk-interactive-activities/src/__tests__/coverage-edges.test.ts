import { evaluate } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import {
  getTemplate,
  registerInteractiveActivities,
  registerTemplate,
} from '../registry/templates.js';
import { isAllowedFont, isMotionPresetId, isStylePresetId } from '../style/catalog.js';
import { cineScrambleChrome } from '../templates/cine-scramble/copy.js';
import {
  cineScrambleType,
  isVocabEnabled,
  validateCineScrambleData,
} from '../templates/cine-scramble/schema.js';
import { whatHappensChrome } from '../templates/what-happens/copy.js';
import { validateWhatHappensData, whatHappensType } from '../templates/what-happens/schema.js';
import { matchSupportsInAnswer } from '../templates/what-happens/underline.js';

registerInteractiveActivities();
registerInteractiveActivities();

function whClip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bowl',
    title: 'The bowl',
    video: { assetKey: 'bowl', aspect: '9:16', durationS: 8 },
    freezeAt: 3,
    answer: { text: 'She adds flour.' },
    ...overrides,
  };
}

function wh(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    type: 'what-happens',
    id: 'kitchen-1',
    title: 'A kitchen surprise',
    locale: 'en',
    style: { presetId: 'default' },
    clips: [whClip()],
    ...overrides,
  };
}

function csClips(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    video: { assetKey: `c${index}`, aspect: '16:9' },
    caption: `Caption ${index + 1}`,
  }));
}

function cs(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    type: 'cine-scramble',
    id: 'park-1',
    title: 'A walk in the park',
    scenes: [{ id: 'scene-1', title: 'The path', clips: csClips(3) }],
    ...overrides,
  };
}

describe('chrome, catalog, and registry helpers', () => {
  it('resolves English by default and Spanish when requested', () => {
    expect(whatHappensChrome().supportsLabel).toBe('To help you');
    expect(whatHappensChrome('es').supportsLabel).toBe('Para ayudarte');
    expect(whatHappensChrome('fr').nextButton).toBe('Next');
    expect(cineScrambleChrome().checkLabel).toBe('Check');
    expect(cineScrambleChrome('es').vocabButtonLabel).toBe('Vocabulario');
    expect(cineScrambleChrome('pt').checkLabel).toBe('Check');
  });

  it('recognizes known catalog ids and rejects unknown ones', () => {
    expect(isStylePresetId('default')).toBe(true);
    expect(isStylePresetId('cinema-dark')).toBe(true);
    expect(isStylePresetId('neon')).toBe(false);
    expect(isMotionPresetId('lively')).toBe(true);
    expect(isMotionPresetId('gentle')).toBe(true);
    expect(isMotionPresetId('bouncy')).toBe(false);
    expect(isAllowedFont('Inter')).toBe(true);
    expect(isAllowedFont('Source Serif 4')).toBe(true);
    expect(isAllowedFont('Fraunces')).toBe(true);
    expect(isAllowedFont('Comic Sans')).toBe(false);
  });

  it('allows registering the same template definition again', () => {
    const existing = getTemplate('cine-scramble');
    expect(existing).toBeDefined();
    if (!existing) {
      return;
    }
    expect(() => registerTemplate(existing)).not.toThrow();
  });

  it('skips empty support items when underlining', () => {
    expect(matchSupportsInAnswer('hello there', ['', 'there'])).toEqual([
      { support: 'there', start: 6, end: 11 },
    ]);
  });
});

describe('What Happens validation edges', () => {
  it('accepts optional clip media, copy, style, and prompts', () => {
    const result = validateWhatHappensData(
      wh({
        supportsEnabled: true,
        copy: { supportsLabel: 'Hints', nextButton: 'Go' },
        style: {
          presetId: 'cinema-dark',
          mode: 'dark',
          motionPresetId: 'gentle',
          fonts: { heading: 'Fraunces', body: 'Inter' },
        },
        clips: [
          whClip({
            video: {
              assetKey: 'bowl',
              aspect: '16:9',
              durationS: 8,
              url: 'https://cdn.example/bowl.mp4',
            },
            thumb: { assetKey: 'bowl-thumb', url: 'https://cdn.example/bowl.jpg' },
            poster: { assetKey: 'bowl-poster' },
            predictPrompt: 'What happens next?',
            tellPrompt: 'Tell the story',
            supportsEnabled: true,
            supportsLabel: 'To help you',
            supports: ['flour', 'sugar'],
            audio: { assetKey: 'bowl-audio', textHash: 'abc', voice: 'en-US' },
            videoPrompt: { text: 'A person pours flour', generatedBy: 'anthropic' },
            origin: 'authored',
          }),
        ],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const typeSlots = whatHappensType.mediaSlots?.(result.data) ?? [];
    expect(typeSlots.some((slot) => slot.kind === 'audio')).toBe(true);
    const template = getTemplate('what-happens');
    expect(template).toBeDefined();
    if (!template) {
      return;
    }
    const slots = template.mediaSlots(result.data);
    expect(slots.some((slot) => slot.kind === 'image')).toBe(true);
    expect(slots.some((slot) => slot.kind === 'audio')).toBe(true);
  });

  it('rejects malformed top-level fields', () => {
    expect(validateWhatHappensData(null).success).toBe(false);
    expect(validateWhatHappensData([]).success).toBe(false);
    expect(validateWhatHappensData(wh({ id: '' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ id: 1 })).success).toBe(false);
    expect(validateWhatHappensData(wh({ title: '' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ locale: '' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ style: undefined })).success).toBe(false);
    expect(validateWhatHappensData(wh({ style: 'default' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ supportsEnabled: 'yes' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ copy: 'hints' })).success).toBe(false);
    expect(validateWhatHappensData(wh({ copy: { predictTitle: 1 } })).success).toBe(false);
    expect(validateWhatHappensData(wh({ clips: 'one' })).success).toBe(false);
  });

  it('rejects unknown or invalid style choices', () => {
    expect(validateWhatHappensData(wh({ style: { presetId: 1 } })).success).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', mode: 'neon' } })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', motionPresetId: 1 } })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', motionPresetId: 'bouncy' } }))
        .success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', fonts: 'Inter' } })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', fonts: { heading: 1 } } }))
        .success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({ style: { presetId: 'default', fonts: { heading: 'Comic Sans' } } }),
      ).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ style: { presetId: 'default', fonts: { body: 'Comic Sans' } } }))
        .success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({ style: { presetId: 'default', mode: 'auto', fonts: { body: 'Inter' } } }),
      ).success,
    ).toBe(true);
  });

  it('rejects malformed clips and leftover Reveal fields', () => {
    expect(validateWhatHappensData(wh({ clips: ['nope'] })).success).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ easyCaption: 'Easy' })] })).success).toBe(
      false,
    );
    expect(validateWhatHappensData(wh({ clips: [whClip({ freezeAt: 'soon' })] })).success).toBe(
      false,
    );
    expect(validateWhatHappensData(wh({ clips: [whClip({ answer: 'text' })] })).success).toBe(
      false,
    );
    expect(validateWhatHappensData(wh({ clips: [whClip({ answer: { text: 1 } })] })).success).toBe(
      false,
    );
    expect(validateWhatHappensData(wh({ clips: [whClip({ video: 'clip' })] })).success).toBe(false);
    expect(
      validateWhatHappensData(wh({ clips: [whClip({ video: { aspect: '9:16' } })] })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({ clips: [whClip({ video: { assetKey: 'bowl', aspect: '4:3' } })] }),
      ).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({
          clips: [
            whClip({
              video: { assetKey: 'bowl', aspect: '9:16', url: 1 },
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({
          clips: [
            whClip({
              video: { assetKey: 'bowl', aspect: '9:16', durationS: 'eight' },
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({
          clips: [
            whClip({
              video: { assetKey: 'bowl', aspect: '9:16', durationS: 0 },
              freezeAt: 0.5,
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ predictPrompt: 1 })] })).success).toBe(
      false,
    );
    expect(
      validateWhatHappensData(wh({ clips: [whClip({ supportsEnabled: 'yes' })] })).success,
    ).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ supports: 'flour' })] })).success).toBe(
      false,
    );
    expect(validateWhatHappensData(wh({ clips: [whClip({ supports: [1] })] })).success).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ thumb: 'img' })] })).success).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ poster: 1 })] })).success).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ audio: 'tts' })] })).success).toBe(false);
    expect(
      validateWhatHappensData(wh({ clips: [whClip({ audio: { assetKey: 'a' } })] })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({
          clips: [whClip({ audio: { assetKey: 'a', textHash: 'h', voice: 1 } })],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ clips: [whClip({ videoPrompt: 'make it' })] })).success,
    ).toBe(false);
    expect(
      validateWhatHappensData(wh({ clips: [whClip({ videoPrompt: { generatedBy: 'x' } })] }))
        .success,
    ).toBe(false);
    expect(
      validateWhatHappensData(
        wh({
          clips: [whClip({ videoPrompt: { text: 'ok', generatedBy: 1 } })],
        }),
      ).success,
    ).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ origin: 'imported' })] })).success).toBe(
      false,
    );
    expect(
      validateWhatHappensData(wh({ clips: [whClip(), whClip({ id: 'bowl', title: 'Copy' })] }))
        .success,
    ).toBe(false);
    expect(validateWhatHappensData(wh({ clips: [whClip({ origin: 'generated' })] })).success).toBe(
      true,
    );
  });
});

describe('Cine-Scramble validation edges', () => {
  it('accepts optional poster, style, vocab, copy, and clip extras', () => {
    const result = validateCineScrambleData(
      cs({
        locale: 'en',
        tagline: 'A walk',
        poster: { assetKey: 'poster', url: 'https://cdn.example/poster.jpg' },
        vocabEnabled: true,
        vocab: [{ term: 'bench', definition: 'A place to sit outside.' }],
        copy: { checkLabel: 'Check it', vocabButtonLabel: 'Words' },
        style: {
          presetId: 'cinema-dark',
          mode: 'light',
          motionPresetId: 'lively',
          fonts: { heading: 'Source Serif 4' },
        },
        scenes: [
          {
            id: 'scene-1',
            title: 'The path',
            clips: [
              {
                id: 0,
                video: {
                  assetKey: 'a',
                  aspect: '9:16',
                  durationS: 4,
                  url: 'https://cdn.example/a.mp4',
                },
                caption: 'A child opens the gate.',
                videoPrompt: { text: 'A gate opens' },
              },
              {
                id: 1,
                video: { assetKey: 'b', aspect: '16:9' },
                caption: 'They sit on a bench.',
              },
              {
                id: 2,
                video: { assetKey: 'c', aspect: '16:9' },
                caption: 'They walk home.',
              },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(isVocabEnabled(result.data)).toBe(true);
    expect(isVocabEnabled({ ...result.data, vocabEnabled: false })).toBe(false);
    const typeSlots = cineScrambleType.mediaSlots?.(result.data) ?? [];
    expect(typeSlots.some((slot) => slot.kind === 'image')).toBe(true);
    const template = getTemplate('cine-scramble');
    expect(template).toBeDefined();
    if (!template) {
      return;
    }
    expect(template.mediaSlots(result.data).some((slot) => slot.path[0] === 'poster')).toBe(true);
    const missingScene = evaluate(
      result.data as never,
      { sceneId: 'missing', order: [0, 1, 2] } as never,
    );
    expect(missingScene).toMatchObject({ status: 'scored', score: 0, passed: false });
  });

  it('rejects malformed activity, scene, clip, and vocab values', () => {
    expect(validateCineScrambleData(null).success).toBe(false);
    expect(validateCineScrambleData(cs({ schemaVersion: '9.9' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ type: 'not-this' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ id: '' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ title: 1 })).success).toBe(false);
    expect(validateCineScrambleData(cs({ locale: 1 })).success).toBe(false);
    expect(validateCineScrambleData(cs({ tagline: 1 })).success).toBe(false);
    expect(validateCineScrambleData(cs({ poster: 'img' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ poster: { url: 'x' } })).success).toBe(false);
    expect(validateCineScrambleData(cs({ style: { presetId: 1 } })).success).toBe(false);
    expect(
      validateCineScrambleData(cs({ style: { presetId: 'default', motionPresetId: 1 } })).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(cs({ style: { presetId: 'default', motionPresetId: 'bouncy' } }))
        .success,
    ).toBe(false);
    expect(
      validateCineScrambleData(cs({ style: { presetId: 'default', fonts: 'Inter' } })).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({ style: { presetId: 'default', fonts: { body: 'Comic Sans' } } }),
      ).success,
    ).toBe(false);
    expect(validateCineScrambleData(cs({ vocabEnabled: 'yes' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ vocab: 'bench' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ vocab: [1] })).success).toBe(false);
    expect(validateCineScrambleData(cs({ vocab: [{ term: 1, definition: 'x' }] })).success).toBe(
      false,
    );
    expect(validateCineScrambleData(cs({ vocab: [{ term: 'bench' }] })).success).toBe(false);
    expect(validateCineScrambleData(cs({ copy: 'check' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ copy: { checkLabel: 1 } })).success).toBe(false);
    expect(validateCineScrambleData(cs({ scenes: 'one' })).success).toBe(false);
    expect(validateCineScrambleData(cs({ scenes: ['nope'] })).success).toBe(false);
    expect(
      validateCineScrambleData(
        cs({ scenes: [{ id: 'scene-1', title: 'The path', clips: 'three' }] }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(cs({ scenes: [{ id: '', title: 'The path', clips: csClips(3) }] }))
        .success,
    ).toBe(false);
    expect(
      validateCineScrambleData(cs({ scenes: [{ id: 'scene-1', title: 1, clips: csClips(3) }] }))
        .success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            { id: 'scene-1', title: 'A', clips: csClips(3) },
            { id: 'scene-1', title: 'B', clips: csClips(3) },
          ],
        }),
      ).success,
    ).toBe(false);
    const duplicateClips = csClips(3);
    const first = duplicateClips[0];
    const second = duplicateClips[1];
    if (first && second) {
      duplicateClips[1] = { ...second, id: first.id };
      expect(
        validateCineScrambleData(
          cs({ scenes: [{ id: 'scene-1', title: 'The path', clips: duplicateClips }] }),
        ).success,
      ).toBe(false);
    }
    expect(
      validateCineScrambleData(
        cs({ scenes: [{ id: 'scene-1', title: 'The path', clips: ['nope', 'no', 'way'] }] }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: -1, video: { assetKey: 'a', aspect: '16:9' }, caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: 0.5, video: { assetKey: 'a', aspect: '16:9' }, caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: '0', video: { assetKey: 'a', aspect: '16:9' }, caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: 0, video: { assetKey: 'a', aspect: '16:9' }, caption: '' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: 0, video: { aspect: '16:9' }, caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: 0, video: { assetKey: 'a', aspect: '4:3' }, caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                {
                  id: 0,
                  video: { assetKey: 'a', aspect: '16:9', durationS: 'four' },
                  caption: 'A',
                },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                {
                  id: 0,
                  video: { assetKey: 'a', aspect: '16:9' },
                  caption: 'A',
                  videoPrompt: 'make it',
                },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                {
                  id: 0,
                  video: { assetKey: 'a', aspect: '16:9' },
                  caption: 'A',
                  videoPrompt: { text: 1 },
                },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      validateCineScrambleData(
        cs({
          scenes: [
            {
              id: 'scene-1',
              title: 'The path',
              clips: [
                { id: 0, video: 'clip', caption: 'A' },
                { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'B' },
                { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'C' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});
