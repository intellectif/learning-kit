import {
  type CineScrambleData,
  InteractiveActivityPlayer,
  validateCineScrambleData,
  validateWhatHappensData,
  type WhatHappensData,
} from '@intellectif/lk-interactive-activities';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

/**
 * Both activities play the example app's clip - eight seconds of ffmpeg's test
 * pattern, served from `apps/lk-example-vite/public` (see `.storybook/main.ts`).
 * The copy is placeholder text written for these stories.
 */
const clip = { url: '/demo-video.webm', aspect: '16:9' as const, durationS: 8 };

const whatHappens: WhatHappensData = {
  schemaVersion: '1.0',
  type: 'what-happens',
  id: 'sb-what-happens',
  title: 'What happens next?',
  locale: 'en',
  style: { presetId: 'default' },
  clips: [
    {
      id: 'sb-wh-count',
      title: 'The counting clock',
      video: { ...clip, assetKey: 'demo-video-a.webm' },
      freezeAt: 3,
      predictPrompt: 'The clock has stopped for a moment. What do you think it does next?',
      tellPrompt: 'Say what happened after the pause.',
      supports: ['keeps counting', 'the numbers go up'],
      answer: { text: 'The clock keeps counting, and the numbers go up one by one.' },
    },
    {
      id: 'sb-wh-colours',
      title: 'The colour bars',
      video: { ...clip, assetKey: 'demo-video-b.webm' },
      freezeAt: 5,
      answer: { text: 'The colour bars stay on the screen until the clip ends.' },
    },
  ],
};

const cineScramble: CineScrambleData = {
  schemaVersion: '1.0',
  type: 'cine-scramble',
  id: 'sb-cine-scramble',
  title: 'Put the clock in order',
  locale: 'en',
  vocab: [
    { term: 'second', definition: 'One sixtieth of a minute.' },
    { term: 'pattern', definition: 'Shapes or colours that repeat.' },
  ],
  scenes: [
    {
      id: 'sb-cs-clock',
      title: 'Counting',
      clips: [
        'The clock starts.',
        'It counts on.',
        'It passes the middle.',
        'It reaches the end.',
      ].map((caption, id) => ({
        id,
        caption,
        video: { ...clip, assetKey: `demo-video-${id}.webm` },
      })),
    },
  ],
};

/** A story with invalid content fails to render rather than drawing it as best it can. */
for (const result of [
  validateWhatHappensData(whatHappens),
  validateCineScrambleData(cineScramble),
]) {
  if (!result.success) {
    throw new Error(
      `Invalid interactive activity: ${result.errors.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`,
    );
  }
}

const viewport = { width: 1232, height: 693 };

const meta: Meta<typeof InteractiveActivityPlayer> = {
  title: 'Interactive activities/InteractiveActivityPlayer',
  component: InteractiveActivityPlayer,
  parameters: { wide: true },
  args: { activity: whatHappens, onEvent: fn(), viewport },
};
export default meta;

type Story = StoryObj<typeof InteractiveActivityPlayer>;

/** Pick a card, watch to the freeze, predict, reveal, tell, then compare with the answer. */
export const WhatHappens: Story = {};

/** Order the clips by dragging, or focus one and press 1-4; C checks. */
export const CineScramble: Story = { args: { activity: cineScramble } };

/** Spanish chrome from the locale; the activity's own text is unchanged. */
export const WhatHappensSpanishChrome: Story = {
  args: { activity: { ...whatHappens, locale: 'es' } },
};

/** No spatial motion, whatever the system setting. */
export const ReducedMotion: Story = { args: { reducedMotion: true } };
