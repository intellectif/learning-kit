import type { ItemGroup, MediaTimeline } from '@intellectif/lk-core';
import { InteractiveVideo } from '@intellectif/lk-react/components/InteractiveVideo';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

/**
 * The example app's clip — eight seconds of ffmpeg's test pattern, served from
 * `apps/lk-example-vite/public` (see `.storybook/main.ts`) — with a quiz at 0:02
 * and a required one at 0:05.
 */
const timeline: MediaTimeline = {
  navigation: 'free',
  chapters: [
    { at: 0, title: 'Counting' },
    { at: 5, title: 'Stopping' },
  ],
  cues: [
    { id: 'first', at: 2, title: 'First pause', itemIds: ['sb-video-start'] },
    { id: 'second', at: 5, title: 'Second pause', itemIds: ['sb-video-stop'], required: true },
  ],
};

const group: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'sb-video',
  title: 'A short clip',
  stimulus: {
    id: 'sb-video-stimulus',
    kind: 'video',
    media: {
      type: 'video',
      url: '/demo-video.webm',
      alt: 'A test pattern with a counting clock',
      tracks: [
        {
          kind: 'captions',
          src: '/demo-video.vtt',
          srclang: 'en',
          label: 'English',
          default: true,
        },
      ],
    },
  },
  items: [
    {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'sb-video-start',
      title: 'The start',
      question: 'Where does the clock start?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'zero', text: 'At zero', isCorrect: true },
        { id: 'ten', text: 'At ten', isCorrect: false },
      ],
    },
    {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'sb-video-stop',
      title: 'The end',
      passage: 'The clock stops at {{n}}.',
      blanks: [{ id: 'n', acceptedAnswers: ['eight', '8'] }],
      scoringStrategy: 'all-or-nothing',
    },
  ],
  timeline,
};

const meta: Meta<typeof InteractiveVideo> = {
  title: 'Activities/InteractiveVideo',
  component: InteractiveVideo,
  args: {
    group,
    renderMode: 'practice',
    onActivityComplete: fn(),
    onFinished: fn(),
    onInteraction: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof InteractiveVideo>;

export const Practice: Story = {};

/** No skipping ahead of a quiz not yet answered. */
export const NoSkipAhead: Story = {
  args: { group: { ...group, timeline: { ...timeline, navigation: 'no-skip-ahead' } } },
};
