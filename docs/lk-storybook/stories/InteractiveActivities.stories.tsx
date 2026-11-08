import {
  type CineScrambleData,
  hostedFontsCssUrl,
  type StyleChoice,
  validateCineScrambleData,
  validateWhatHappensData,
  type WhatHappensData,
} from '@intellectif/lk-interactive-activities';
import { InteractiveActivityPlayer } from '@intellectif/lk-interactive-activities/player';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

/**
 * The clips are original flat animations drawn with ffmpeg for these stories
 * (`docs/lk-storybook/public/interactive-activities`), and the copy is
 * placeholder text written for them.
 */
const media = (file: string) => ({ assetKey: file, url: `/interactive-activities/${file}` });

const whatHappens: WhatHappensData = {
  schemaVersion: '1.0',
  type: 'what-happens',
  id: 'sb-what-happens',
  title: 'What happens next?',
  locale: 'en',
  style: { presetId: 'default' },
  clips: [
    {
      id: 'sb-wh-ball',
      title: 'The rolling ball',
      video: { ...media('wh-ball.webm'), aspect: '16:9', durationS: 6 },
      poster: media('wh-ball-poster.jpg'),
      freezeAt: 3.2,
      predictPrompt: 'The ball is rolling towards the gap. What will happen?',
      tellPrompt: 'Tell your partner what happened, from the start.',
      supports: ['rolls along the grass', 'falls into the hole', 'first … then …'],
      answer: { text: 'The ball rolls along the grass and falls into the hole.' },
    },
    {
      id: 'sb-wh-balloon',
      title: 'The red balloon',
      video: { ...media('wh-balloon.webm'), aspect: '9:16', durationS: 6 },
      freezeAt: 3.4,
      predictPrompt: 'What would you do if this were your balloon?',
      supports: ['floats up', 'touches the spikes', 'pops'],
      answer: { text: 'The balloon floats up, touches the spikes and pops.' },
    },
    {
      id: 'sb-wh-lights',
      title: 'At the lights',
      video: { ...media('wh-lights.webm'), aspect: '16:9', durationS: 6 },
      poster: media('wh-lights-poster.jpg'),
      freezeAt: 2.9,
      supports: ['turns red', 'stops before the line', 'Remember: the light was amber.'],
      answer: { text: 'The light turns red and the car stops before the line.' },
    },
  ],
};

/** The default count: eight clips (the three above, repeated with new titles). */
const fullBoard: WhatHappensData = {
  ...whatHappens,
  id: 'sb-what-happens-eight',
  title: 'Eight short clips',
  clips: Array.from({ length: 8 }, (_, index) => {
    const source = whatHappens.clips[index % 3] as WhatHappensData['clips'][number];
    return { ...source, id: `sb-wh-${index + 1}`, title: `${source.title} ${index + 1}` };
  }),
};

const flower = [
  'A seed drops into the pot.',
  'A small green shoot pushes up.',
  'The stem grows tall and leafy.',
  'A pink flower opens at the top.',
];
const sunset = [
  'The sun is high in a blue sky.',
  'The sky turns orange as the sun goes down.',
  'The sun sinks behind the hills.',
];

const cineScramble: CineScrambleData = {
  schemaVersion: '1.0',
  type: 'cine-scramble',
  id: 'sb-cine-scramble',
  title: 'The flower',
  tagline: 'Four clips, one story. Put them in order.',
  poster: media('cs-poster.jpg'),
  locale: 'en',
  style: { presetId: 'cinema-dark', mode: 'dark' },
  vocab: [
    { term: 'seed', definition: 'The small part of a plant that a new plant grows from.' },
    { term: 'shoot', definition: 'A new part of a plant that has just started to grow.' },
    { term: 'stem', definition: 'The long, thin part of a plant that holds the leaves.' },
    { term: 'sink', definition: 'To go down slowly.' },
  ],
  scenes: [
    {
      id: 'sb-cs-flower',
      title: 'Growing a flower',
      clips: flower.map((caption, id) => ({
        id,
        caption,
        video: { ...media(`cs-flower-${id}.webm`), aspect: '16:9' as const, durationS: 3 },
      })),
    },
  ],
};

const twoScenes: CineScrambleData = {
  ...cineScramble,
  id: 'sb-cine-scramble-scenes',
  title: 'A day in the garden',
  tagline: 'Two short scenes. Pick one, then put its clips in order.',
  scenes: [
    ...cineScramble.scenes,
    {
      id: 'sb-cs-sunset',
      title: 'The sunset',
      clips: sunset.map((caption, id) => ({
        id,
        caption,
        video: { ...media(`cs-sunset-${id}.webm`), aspect: '16:9' as const, durationS: 3 },
      })),
    },
  ],
};

/** A story with invalid content fails to render rather than drawing it as best it can. */
for (const result of [
  validateWhatHappensData(whatHappens),
  validateWhatHappensData(fullBoard),
  validateCineScrambleData(cineScramble),
  validateCineScrambleData(twoScenes),
]) {
  if (!result.success) {
    throw new Error(
      `Invalid interactive activity: ${result.errors.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`,
    );
  }
}

/**
 * Loads the activity's fonts from Google Fonts, as a host page does
 * (`hostedFontsCssUrl`): the package itself never fetches anything.
 */
function loadHostFonts(style: StyleChoice): void {
  const href = hostedFontsCssUrl(style);
  if (!href || document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

const withHostFonts: Decorator = (Story, context) => {
  const activity = context.args.activity as WhatHappensData | CineScrambleData | undefined;
  loadHostFonts(activity?.style ?? { presetId: 'cinema-dark' });
  return Story();
};

/** A phone-width frame (`frameWidth`, read by the preview): the player stacks into its portrait layout. */
const phone = { frameWidth: 390 };

const meta: Meta<typeof InteractiveActivityPlayer> = {
  title: 'Interactive activities/InteractiveActivityPlayer',
  component: InteractiveActivityPlayer,
  parameters: { wide: true, layout: 'fullscreen' },
  decorators: [withHostFonts],
  args: { activity: whatHappens, onEvent: fn() },
};
export default meta;

type Story = StoryObj<typeof InteractiveActivityPlayer>;

/**
 * Pick a card, watch to the freeze, predict, reveal, tell with the supports,
 * then compare with the sample answer and listen. Keys: R reveals, A shows the
 * answer, L listens, N goes on, Escape returns to the cards.
 */
export const WhatHappens: Story = {};

/** The same activity in dark mode. */
export const WhatHappensDark: Story = {
  args: { activity: { ...whatHappens, style: { presetId: 'default', mode: 'dark' } } },
};

/** The default count of eight clips on the board. */
export const WhatHappensEightClips: Story = { args: { activity: fullBoard } };

/**
 * Spanish chrome for Spanish-speaking learners of English: the host's
 * `locale` sets the buttons, the activity's own text stays in English.
 */
export const WhatHappensSpanishChrome: Story = { args: { locale: 'es-CO' } };

/** The phone layout: everything stacks. */
export const WhatHappensPhone: Story = { parameters: phone };

/**
 * Drag each clip onto the slot whose caption it shows, or tap a clip and then a
 * slot. Keyboard: focus a clip and press a slot number; Delete returns it; C checks.
 */
export const CineScramble: Story = { args: { activity: cineScramble } };

/** Two scenes: a scene list first, then the next unfinished scene after each story. */
export const CineScrambleTwoScenes: Story = { args: { activity: twoScenes } };

/** The cinema preset with the lights up. */
export const CineScrambleLight: Story = {
  args: { activity: { ...cineScramble, style: { presetId: 'cinema-dark', mode: 'light' } } },
};

/** Spanish chrome, on a phone. */
export const CineScramblePhone: Story = {
  args: { activity: cineScramble, locale: 'es' },
  parameters: phone,
};

/** No spatial motion, whatever the system setting. */
export const ReducedMotion: Story = { args: { reducedMotion: true } };
