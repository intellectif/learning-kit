import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { ActivityMedia } from '../ActivityMedia.js';

describe('ActivityMedia', () => {
  it('renders an image with its alt text', async () => {
    const { container, getByRole } = render(
      <ActivityMedia
        media={{ type: 'image', url: 'https://x.test/a.png', alt: 'A cell diagram' }}
      />,
    );
    const img = getByRole('img', { name: 'A cell diagram' });
    expect(img).toHaveAttribute('src', 'https://x.test/a.png');
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('renders audio with an accessible label and a source', () => {
    const { container } = render(
      <ActivityMedia
        media={{ type: 'audio', url: 'https://x.test/a.mp3', alt: 'Dialogue clip' }}
      />,
    );
    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('aria-label', 'Dialogue clip');
    expect(container.querySelector('source')).toHaveAttribute('src', 'https://x.test/a.mp3');
    expect(container.querySelector('track')).toBeNull();
  });

  it('renders video with a captions track when captionsUrl is provided', () => {
    const { container } = render(
      <ActivityMedia
        media={{ type: 'video', url: 'https://x.test/v.mp4', captionsUrl: 'https://x.test/v.vtt' }}
      />,
    );
    expect(container.querySelector('video')).toHaveAttribute('controls');
    const track = container.querySelector('track');
    expect(track).toHaveAttribute('kind', 'captions');
    expect(track).toHaveAttribute('src', 'https://x.test/v.vtt');
  });

  it('renders an embed as a titled iframe', () => {
    const { container } = render(
      <ActivityMedia
        media={{ type: 'embed', url: 'https://www.youtube.com/embed/abc', alt: 'Water cycle' }}
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/abc');
    expect(iframe).toHaveAttribute('title', 'Water cycle');
    expect(iframe).toHaveAttribute('allowfullscreen');
  });
});
