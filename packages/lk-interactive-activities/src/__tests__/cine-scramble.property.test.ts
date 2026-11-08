import { describe, expect, it } from 'vitest';
import { validateCineScrambleData } from '../templates/cine-scramble/schema.js';

function activity(scenes: unknown) {
  return {
    schemaVersion: '1.0',
    type: 'cine-scramble',
    id: 'counts',
    title: 'Counts',
    scenes,
  };
}

function clips(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    video: { assetKey: `c${index}`, aspect: '16:9' },
    caption: `Caption ${index + 1}`,
  }));
}

describe('Cine-Scramble count properties', () => {
  it('accepts 1–8 scenes and 3–6 clips per scene, and rejects the edges outside', () => {
    for (const sceneCount of [1, 2, 8]) {
      const scenes = Array.from({ length: sceneCount }, (_, index) => ({
        id: `scene-${index + 1}`,
        title: `Scene ${index + 1}`,
        clips: clips(4),
      }));
      expect(validateCineScrambleData(activity(scenes)).success, `${sceneCount} scenes`).toBe(true);
    }
    expect(validateCineScrambleData(activity([])).success).toBe(false);
    expect(
      validateCineScrambleData(
        activity(
          Array.from({ length: 9 }, (_, index) => ({
            id: `scene-${index + 1}`,
            title: `Scene ${index + 1}`,
            clips: clips(4),
          })),
        ),
      ).success,
    ).toBe(false);

    for (const clipCount of [3, 4, 5, 6]) {
      expect(
        validateCineScrambleData(
          activity([{ id: 'scene-1', title: 'Scene 1', clips: clips(clipCount) }]),
        ).success,
        `${clipCount} clips`,
      ).toBe(true);
    }
    expect(
      validateCineScrambleData(activity([{ id: 'scene-1', title: 'Scene 1', clips: clips(2) }]))
        .success,
    ).toBe(false);
    expect(
      validateCineScrambleData(activity([{ id: 'scene-1', title: 'Scene 1', clips: clips(7) }]))
        .success,
    ).toBe(false);
  });

  it('rejects clip ids that are not 0..n-1', () => {
    const broken = clips(4);
    const second = broken[1];
    expect(second).toBeDefined();
    if (!second) {
      return;
    }
    broken[1] = { ...second, id: 9 };
    const result = validateCineScrambleData(
      activity([{ id: 'scene-1', title: 'Scene 1', clips: broken }]),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an unknown catalog id when style is provided', () => {
    const result = validateCineScrambleData({
      ...activity([{ id: 'scene-1', title: 'Scene 1', clips: clips(4) }]),
      style: { presetId: 'neon-disco' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((error) => error.message.includes('Unknown style preset'))).toBe(
        true,
      );
    }
  });
});
