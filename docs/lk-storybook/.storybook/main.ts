import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  // The example app's own media — the interactive video's clip and captions —
  // served as they are there, so the story and the demo play the same file;
  // and the interactive activities' demo clips, drawn for those stories.
  staticDirs: ['../../../apps/lk-example-vite/public', '../public'],
};

export default config;
