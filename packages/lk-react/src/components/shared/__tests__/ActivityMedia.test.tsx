import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

/**
 * The standalone budget guard.
 *
 * `<ActivityMedia>` throws when audio declares `maxPlays`, the mode is `exam`
 * and no `mediaBudget` binding is supplied — nothing would persist the count,
 * so a refresh restores the full budget while the page still says plays remain.
 *
 * It needs its own test because no pager test can reach it: `ActivitySequence`
 * throws on a missing `onPlayConsumed` before children mount, and once that
 * callback is supplied the pager passes a binding, so this branch is skipped
 * either way. The guard previously sat AFTER the early return for
 * `controls: 'minimal'` — which a budgeted policy always resolves to — and was
 * therefore dead code; moving it back would leave every pager test green while
 * standalone exam playback silently went unlimited again.
 */
describe('ActivityMedia budget guard', () => {
  const budgeted = {
    type: 'audio',
    url: '/part2.mp3',
    alt: 'Part 2',
    playback: { maxPlays: 2 },
  } as never;

  it('refuses budgeted audio in exam mode with no binding', () => {
    expect(() => render(<ActivityMedia media={budgeted} renderMode="exam" />)).toThrow(
      /mediaBudget/,
    );
  });

  it('renders the transport once a binding is supplied', () => {
    render(
      <ActivityMedia
        media={budgeted}
        renderMode="exam"
        mediaBudget={{ key: 'slot:0', slotId: '0', index: 0, onPlayConsumed: vi.fn() }}
      />,
    );
    expect(document.querySelector('.lk-media-plays')).toHaveTextContent('2 of 2 plays remaining');
  });

  it('does not refuse an unbudgeted recording', () => {
    const plain = { type: 'audio', url: '/clip.mp3', alt: 'Clip' } as never;
    expect(() => render(<ActivityMedia media={plain} renderMode="exam" />)).not.toThrow();
  });

  it('does not refuse in review, where nothing is enforced', () => {
    expect(() => render(<ActivityMedia media={budgeted} renderMode="review" />)).not.toThrow();
  });
});
