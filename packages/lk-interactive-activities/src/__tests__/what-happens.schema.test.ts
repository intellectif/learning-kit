import { jsonSchemaFor, validateActivity, validateDraft } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { registerInteractiveActivities } from '../registry/templates.js';
import { STYLE_PRESET_IDS } from '../style/catalog.js';
import {
  createWhatHappensDraft,
  isSupportsEnabled,
  validateWhatHappensData,
  WHAT_HAPPENS_CLIP_COUNT_DEFAULT,
  WHAT_HAPPENS_JSON_SCHEMA,
} from '../templates/what-happens/schema.js';

registerInteractiveActivities();

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    type: 'what-happens',
    id: 'kitchen-1',
    title: 'A kitchen surprise',
    locale: 'en',
    style: { presetId: 'default' },
    clips: [
      {
        id: 'bowl',
        title: 'The bowl',
        video: { assetKey: 'bowl', aspect: '9:16', durationS: 8 },
        freezeAt: 3,
        supports: ['flour', 'a pinch of salt'],
        answer: { text: 'She adds flour and a pinch of salt.' },
      },
    ],
    ...overrides,
  };
}

describe('What Happens schema', () => {
  it('accepts a valid activity and registers it with lk-core', () => {
    const result = validateWhatHappensData(sample());
    expect(result.success).toBe(true);
    const core = validateActivity('what-happens' as never, sample());
    expect(core.success).toBe(true);
  });

  it('seeds eight clips with supports on', () => {
    const draft = createWhatHappensDraft('draft-1');
    expect(draft.clips).toHaveLength(WHAT_HAPPENS_CLIP_COUNT_DEFAULT);
    expect(draft.supportsEnabled).toBe(true);
    expect(isSupportsEnabled(draft)).toBe(true);
    // A new draft is not publishable: titles, media and freeze points are still to set.
    expect(validateWhatHappensData(draft).success).toBe(false);
    expect(validateDraft('what-happens' as never, draft)).toMatchObject({ status: 'incomplete' });
  });

  it('rejects clip counts outside 1–12', () => {
    expect(validateWhatHappensData(sample({ clips: [] })).success).toBe(false);
    const many = Array.from({ length: 13 }, (_, index) => ({
      id: `clip-${index}`,
      title: `Clip ${index}`,
      video: { assetKey: `clip-${index}`, aspect: '9:16', durationS: 4 },
      freezeAt: 1,
      answer: { text: 'Answer' },
    }));
    const result = validateWhatHappensData(sample({ clips: many }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((error) => error.path[0] === 'clips')).toBe(true);
    }
  });

  it('rejects an unknown catalog id', () => {
    const result = validateWhatHappensData(sample({ style: { presetId: 'not-a-real-preset' } }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.message).toContain('Unknown style preset');
    }
  });

  it('rejects an unknown schema version and template', () => {
    const version = validateWhatHappensData(sample({ schemaVersion: '9.9' }));
    const type = validateWhatHappensData(sample({ type: 'not-a-template' }));
    expect(version.success).toBe(false);
    expect(type.success).toBe(false);
    if (!version.success) {
      expect(version.errors[0]?.message).toContain('Unknown schema version');
    }
    if (!type.success) {
      expect(type.errors[0]?.message).toContain('Unknown template');
    }
  });

  it('treats omitted supportsEnabled as on, and lets a clip turn it off', () => {
    const activity = sample();
    expect('supportsEnabled' in activity).toBe(false);
    const parsed = validateWhatHappensData(activity);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(isSupportsEnabled(parsed.data)).toBe(true);
      const firstClip = parsed.data.clips[0];
      expect(firstClip).toBeDefined();
      if (!firstClip) {
        return;
      }
      expect(isSupportsEnabled(parsed.data, { ...firstClip, supportsEnabled: false })).toBe(false);
    }
    expect(STYLE_PRESET_IDS).toContain('default');
  });

  it('exports JSON Schema for AI', () => {
    expect(WHAT_HAPPENS_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining(['schemaVersion', 'type', 'clips']),
    );
    expect(jsonSchemaFor('what-happens')).toMatchObject({ title: 'What Happens activity' });
  });
});
