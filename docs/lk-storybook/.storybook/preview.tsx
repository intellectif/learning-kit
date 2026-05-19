import '@intellectif/lk-react/theme/defaults.css';
import '@intellectif/lk-react/theme/skin.css';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div style={{ maxWidth: 680, padding: 24 }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
