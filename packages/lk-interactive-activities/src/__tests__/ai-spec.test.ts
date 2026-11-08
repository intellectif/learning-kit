import { describe, expect, it } from 'vitest';
import {
  ANIMATION_CATALOG,
  ANIMATION_IDS,
  CINE_SCRAMBLE_AI_SPEC,
  CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT,
  CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX,
  CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN,
  CINE_SCRAMBLE_SCENE_COUNT_DEFAULT,
  CINE_SCRAMBLE_SCENE_COUNT_MAX,
  CINE_SCRAMBLE_SCENE_COUNT_MIN,
  createCineScrambleDraft,
  createWhatHappensDraft,
  FONT_ALLOW_LIST,
  getTemplate,
  listTemplates,
  MOTION_PRESET_IDS,
  MOTION_PRESETS,
  STYLE_PRESET_IDS,
  STYLE_PRESETS,
  validateCineScrambleData,
  validateWhatHappensData,
  WHAT_HAPPENS_AI_SPEC,
  WHAT_HAPPENS_CLIP_COUNT_DEFAULT,
  WHAT_HAPPENS_CLIP_COUNT_MAX,
  WHAT_HAPPENS_CLIP_COUNT_MIN,
} from '../index.js';

const specs = [WHAT_HAPPENS_AI_SPEC, CINE_SCRAMBLE_AI_SPEC];

function propertyNames(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...propertyNames(child)]);
}

describe('serializable AI generation ports', () => {
  it.each(specs)('exposes real catalog metadata, not styles or invented IDs', (spec) => {
    const ids = (entries: readonly { id: string }[]) => entries.map(({ id }) => id);
    expect(ids(spec.catalogs.styles)).toEqual([...STYLE_PRESET_IDS]);
    expect(ids(spec.catalogs.motions)).toEqual([...MOTION_PRESET_IDS]);
    expect(ids(spec.catalogs.animations)).toEqual([...ANIMATION_IDS]);
    expect(ids(spec.catalogs.fonts)).toEqual([...FONT_ALLOW_LIST]);
    const metadata = ({
      id,
      label,
      description,
    }: {
      id: string;
      label: string;
      description: string;
    }) => ({ id, label, description });
    expect(spec.catalogs.styles).toEqual(STYLE_PRESETS.map(metadata));
    expect(spec.catalogs.motions).toEqual(MOTION_PRESETS.map(metadata));
    expect(spec.catalogs.animations).toEqual(ANIMATION_CATALOG.map(metadata));
    for (const entries of Object.values(spec.catalogs)) {
      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(['description', 'id', 'label']);
        expect(entry.label.trim()).not.toBe('');
        expect(entry.description.trim()).not.toBe('');
      }
    }
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });

  it.each(specs)('supplies nonempty prompt fragments, fields, rules and video guidance', (spec) => {
    for (const fragments of [spec.promptFragments, spec.videoPrompt.promptFragments, spec.rules]) {
      expect(fragments.length).toBeGreaterThan(0);
      for (const fragment of fragments) {
        expect(typeof fragment).toBe('string');
        expect(fragment.trim()).not.toBe('');
      }
    }
    expect(spec.writableFields).toContain('title');
    expect(spec.writableFields).toContain('style.presetId');
    expect(spec.writableFields).toContain('style.motionPresetId');
    expect(spec.writableFields).toContain('style.fonts.body');
    expect(spec.jsonSchema.type).toBe('object');
    expect(spec.jsonSchema.additionalProperties).toBe(false);
    expect(spec.videoPrompt.aspectRatios).toEqual(['9:16', '16:9']);
    expect(spec.videoPrompt.inputs).toContain('targetLengthS');
    expect(spec.videoPrompt.targetLength).toMatch(/seconds/);
    expect(spec.videoPrompt.scene.length).toBeGreaterThan(0);
    expect(spec.videoPrompt.rules.join(' ')).toMatch(/No text.*logos/);
    expect(spec.videoPrompt.writableFields).toHaveLength(1);
    expect(spec.videoPrompt.writableFields[0]).toMatch(/videoPrompt.text$/);
    expect(propertyNames(spec.jsonSchema)).not.toContain('assetKey');
    expect(propertyNames(spec.jsonSchema)).not.toContain('url');
  });

  it('registers both rich specs without replacing the M3 JSON Schemas', () => {
    expect(getTemplate('what-happens')?.aiSpec).toBe(WHAT_HAPPENS_AI_SPEC);
    expect(getTemplate('cine-scramble')?.aiSpec).toBe(CINE_SCRAMBLE_AI_SPEC);
    for (const template of listTemplates()) {
      expect(template.aiSpec).toBeDefined();
      expect(template.jsonSchema).not.toBe(template.aiSpec.jsonSchema);
      expect(template.jsonSchema.$id).toMatch(/\/1.0.json$/);
    }
  });

  it('keeps count/default rules aligned with the validators and draft factories', () => {
    expect(WHAT_HAPPENS_AI_SPEC.counts.clips).toEqual({
      min: WHAT_HAPPENS_CLIP_COUNT_MIN,
      max: WHAT_HAPPENS_CLIP_COUNT_MAX,
      default: WHAT_HAPPENS_CLIP_COUNT_DEFAULT,
    });
    expect(CINE_SCRAMBLE_AI_SPEC.counts.scenes).toEqual({
      min: CINE_SCRAMBLE_SCENE_COUNT_MIN,
      max: CINE_SCRAMBLE_SCENE_COUNT_MAX,
      default: CINE_SCRAMBLE_SCENE_COUNT_DEFAULT,
    });
    expect(CINE_SCRAMBLE_AI_SPEC.counts.clipsPerScene).toEqual({
      min: CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN,
      max: CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX,
      default: CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT,
    });
    expect(createWhatHappensDraft().clips).toHaveLength(8);
    expect(createCineScrambleDraft().scenes[0]?.clips).toHaveLength(4);
    const whatProperties = WHAT_HAPPENS_AI_SPEC.jsonSchema.properties as Record<string, unknown>;
    expect(whatProperties.clips).toMatchObject({ minItems: 1, maxItems: 12 });
    expect(whatProperties.supportsEnabled).toEqual({ type: 'boolean', default: true });
    const cineProperties = CINE_SCRAMBLE_AI_SPEC.jsonSchema.properties as Record<string, unknown>;
    expect(cineProperties.scenes).toMatchObject({
      minItems: 1,
      maxItems: 8,
      items: { properties: { clips: { minItems: 3, maxItems: 6 } } },
    });
    expect(cineProperties.vocabEnabled).toEqual({ type: 'boolean', default: true });
  });

  it('offers free-text speaking copy, optional supports and a bounded post-upload freeze suggestion', () => {
    const spec = WHAT_HAPPENS_AI_SPEC;
    const freeze = spec.freezeSuggestion;
    expect(freeze?.inputs).toContain('durationS');
    expect(freeze?.inputs).toContain('aspect');
    expect(freeze?.bounds).toEqual({ exclusiveMinimum: 0, exclusiveMaximumField: 'durationS' });
    expect(freeze?.writableFields).toEqual([
      'freezeAt',
      'predictPrompt',
      'tellPrompt',
      'supportsEnabled',
      'supportsLabel',
      'supports',
      'answer.text',
    ]);
    expect(freeze?.jsonSchema).toMatchObject({
      properties: {
        freezeAt: { type: 'number', exclusiveMinimum: 0 },
        predictPrompt: { type: 'string' },
        tellPrompt: { type: 'string' },
      },
    });
    expect(freeze?.promptFragments.every((fragment) => fragment.trim().length > 0)).toBe(true);
    expect(spec.videoPrompt.defaultAspect).toBe('9:16');
    expect(spec.videoPrompt.surpriseMoment).toMatch(/before/);
    expect(spec.rules.join(' ')).toMatch(/need not occur/);
    const activity = createWhatHappensDraft();
    activity.title = 'Garden';
    activity.clips = activity.clips.slice(0, 1);
    const clip = activity.clips[0];
    if (!clip) throw new Error('Missing fixture clip');
    clip.title = 'The gate';
    clip.video.assetKey = 'gate.mp4';
    clip.supports = ['A hint absent from the answer'];
    clip.predictPrompt = 'What would you do?';
    clip.tellPrompt = 'Explain a different choice.';
    clip.video.durationS = 10;
    clip.freezeAt = 5;
    expect(validateWhatHappensData(activity).success).toBe(true);
    for (const invalid of [0, -1, 10, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
      clip.freezeAt = invalid;
      expect(validateWhatHappensData(activity).success).toBe(false);
    }
  });

  it('generates only one caption, one glossary and no freeze or Reveal fields for Cine-Scramble', () => {
    const spec = CINE_SCRAMBLE_AI_SPEC;
    expect(Object.hasOwn(spec, 'freezeSuggestion')).toBe(false);
    expect(Object.hasOwn(spec.videoPrompt, 'surpriseMoment')).toBe(false);
    expect(spec.videoPrompt.defaultAspect).toBe('16:9');
    const names = propertyNames(spec.jsonSchema);
    for (const forbidden of [
      'freezeAt',
      'easyCaption',
      'hardCaption',
      'easy',
      'hard',
      'revealPrompt',
      'captions',
    ]) {
      expect(names).not.toContain(forbidden);
      expect(spec.writableFields.some((field) => field.includes(forbidden))).toBe(false);
    }
    expect(names).toContain('caption');
    expect(names).toContain('videoPrompt');
    expect(spec.writableFields).toContain('scenes[].title');
    expect(spec.writableFields).toContain('vocab[].term');
    const activity = createCineScrambleDraft();
    activity.title = 'A story';
    for (const scene of activity.scenes) {
      scene.title = 'Morning';
      for (const clip of scene.clips) {
        clip.caption = `Step ${clip.id + 1}.`;
        clip.video.assetKey = `clip-${clip.id}.mp4`;
      }
    }
    activity.vocab = [{ term: 'lantern', definition: 'A portable light' }];
    expect(validateCineScrambleData(activity).success).toBe(true);
  });

  it.each(['presetId', 'motionPresetId', 'font'] as const)(
    'still rejects unknown %s in generated drafts',
    (field) => {
      for (const [draft, validate] of [
        [createWhatHappensDraft(), validateWhatHappensData],
        [createCineScrambleDraft(), validateCineScrambleData],
      ] as const) {
        if (!draft.style) throw new Error('Missing fixture style');
        if (field === 'font') draft.style.fonts = { heading: 'invented' };
        else draft.style[field] = 'invented';
        expect(validate(draft).success).toBe(false);
      }
    },
  );
});
