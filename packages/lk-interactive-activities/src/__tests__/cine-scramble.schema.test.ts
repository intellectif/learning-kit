import { evaluate, jsonSchemaFor, validateActivity } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { registerInteractiveActivities } from '../registry/templates.js';
import {
  CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT,
  CINE_SCRAMBLE_JSON_SCHEMA,
  CINE_SCRAMBLE_SCENE_COUNT_DEFAULT,
  createCineScrambleDraft,
  isVocabEnabled,
  validateCineScrambleData,
} from '../templates/cine-scramble/schema.js';

registerInteractiveActivities();

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    type: 'cine-scramble',
    id: 'park-1',
    title: 'A walk in the park',
    vocabEnabled: true,
    vocab: [{ term: 'bench', definition: 'A place to sit outside.' }],
    scenes: [
      {
        id: 'scene-1',
        title: 'The path',
        clips: [
          { id: 0, video: { assetKey: 'a', aspect: '16:9' }, caption: 'A child opens the gate.' },
          { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'They sit on a bench.' },
          { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'A dog runs past.' },
          { id: 3, video: { assetKey: 'd', aspect: '16:9' }, caption: 'They walk home.' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Cine-Scramble schema', () => {
  it('accepts a valid activity with one caption per clip', () => {
    const result = validateCineScrambleData(sample());
    expect(result.success).toBe(true);
    expect(validateActivity('cine-scramble' as never, sample()).success).toBe(true);
  });

  it('seeds one scene of four clips with vocab on', () => {
    const draft = createCineScrambleDraft();
    expect(draft.scenes).toHaveLength(CINE_SCRAMBLE_SCENE_COUNT_DEFAULT);
    expect(draft.scenes[0]?.clips).toHaveLength(CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT);
    expect(draft.vocabEnabled).toBe(true);
    expect(validateCineScrambleData(draft).success).toBe(true);
  });

  it('hides vocab when it is empty even if enabled', () => {
    const parsed = validateCineScrambleData(sample({ vocab: [] }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(isVocabEnabled(parsed.data)).toBe(false);
    }
  });

  it('rejects Easy/Hard leftover fields', () => {
    const scenes = [
      {
        id: 'scene-1',
        title: 'The path',
        clips: [
          {
            id: 0,
            video: { assetKey: 'a', aspect: '16:9' },
            caption: 'A child opens the gate.',
            easyCaption: 'Easy',
            hardCaption: 'Hard',
          },
          { id: 1, video: { assetKey: 'b', aspect: '16:9' }, caption: 'They sit on a bench.' },
          { id: 2, video: { assetKey: 'c', aspect: '16:9' }, caption: 'A dog runs past.' },
        ],
      },
    ];
    const result = validateCineScrambleData(sample({ scenes }));
    expect(result.success).toBe(false);
  });

  it('scores a correct chronological order', () => {
    const parsed = validateCineScrambleData(sample());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const correct = evaluate(parsed.data as never, { sceneId: 'scene-1', order: [0, 1, 2, 3] } as never);
    const wrong = evaluate(parsed.data as never, { sceneId: 'scene-1', order: [3, 2, 1, 0] } as never);
    expect(correct).toMatchObject({ status: 'scored', score: 1, passed: true });
    expect(wrong).toMatchObject({ status: 'scored', score: 0, passed: false });
  });

  it('exports JSON Schema for AI', () => {
    expect(CINE_SCRAMBLE_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining(['schemaVersion', 'type', 'scenes']),
    );
    expect(jsonSchemaFor('cine-scramble')).toMatchObject({ title: 'Cine-Scramble activity' });
  });
});
