import type { CineScrambleData } from '../templates/cine-scramble/schema.js';
import type { WhatHappensData } from '../templates/what-happens/schema.js';
export function whatHappensFixture(): WhatHappensData {
  return {
    schemaVersion: '1.0',
    type: 'what-happens',
    id: 'prediction',
    title: 'Garden predictions',
    locale: 'en',
    style: { presetId: 'default' },
    clips: [
      {
        id: 'garden',
        title: 'The garden',
        video: { assetKey: 'garden.mp4', url: 'media/garden.mp4', aspect: '9:16', durationS: 10 },
        freezeAt: 3,
        supports: ['opens the gate', 'a hint not in the answer', 'the gate'],
        answer: { text: 'She opens the gate and smiles.' },
      },
    ],
  };
}
export function cineScrambleFixture(count = 4): CineScrambleData {
  return {
    schemaVersion: '1.0',
    type: 'cine-scramble',
    id: 'sequence',
    title: 'A garden sequence',
    scenes: [
      {
        id: 'morning',
        title: 'Morning',
        clips: Array.from({ length: count }, (_, id) => ({
          id,
          video: { assetKey: `clip-${id}.mp4`, aspect: '16:9' as const },
          caption: `Step ${id + 1}.`,
        })),
      },
    ],
  };
}
