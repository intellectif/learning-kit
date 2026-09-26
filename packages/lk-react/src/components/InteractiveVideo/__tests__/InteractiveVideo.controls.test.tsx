import type { ItemGroup } from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMediaElement } from '../../../test-support/media.js';
import { InteractiveVideo } from '../index.js';

/**
 * The player's own controls: the buttons, the menus, the keyboard and what the
 * browser remembers. The quiz side of the player is driven in
 * `InteractiveVideo.test.tsx`.
 */

const captionFile = [
  'WEBVTT',
  '',
  '00:00:00.000 --> 00:00:20.000',
  'Primera línea',
  '',
  '00:00:40.000 --> 00:00:50.000',
  'Segunda línea',
].join('\n');

const item = (id: string) => ({
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id,
  title: id,
  question: '¿Cuánto?',
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 'a', text: 'Tres', isCorrect: false },
    { id: 'b', text: 'Cuatro', isCorrect: true },
  ],
});

const group = (over: Partial<ItemGroup> = {}): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'v',
    title: 'Vídeo',
    stimulus: {
      id: 's',
      kind: 'video',
      media: {
        type: 'video',
        url: '/v.mp4',
        alt: 'Vídeo',
        tracks: [
          { kind: 'captions', src: '/es.vtt', srclang: 'es', label: 'Español', default: true },
          { kind: 'subtitles', src: '/pt.vtt', srclang: 'pt', label: 'Português' },
        ],
      },
    },
    items: [item('q1'), item('q2'), item('q3')],
    timeline: {
      chapters: [
        { at: 0, title: 'Principio' },
        { at: 40, title: 'Medio' },
      ],
      cues: [
        { id: 'c1', at: 20, title: 'Pausa', itemIds: ['q1', 'q2'] },
        { id: 'c2', at: 80, title: 'Otra', itemIds: ['q3'] },
      ],
    },
    ...over,
  }) as ItemGroup;

const video = () => document.querySelector('video') as HTMLVideoElement;
const shell = () => document.querySelector('.lk-iv') as HTMLElement;

async function press(key: string, over: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    shell().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...over }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function mount(ui: React.ReactElement): Promise<void> {
  render(ui);
  await act(async () => {
    video().dispatchEvent(new Event('loadedmetadata'));
  });
}

const loadCaptions = vi.fn(async () => captionFile);

beforeEach(() => {
  stubMediaElement({ duration: 100 });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InteractiveVideo controls', () => {
  it('plays, pauses and moves by keyboard while the player has the keys', async () => {
    await mount(<InteractiveVideo group={group()} />);

    await press('k');
    expect(video().paused).toBe(false);
    await press(' ');
    expect(video().paused).toBe(true);

    await press('l');
    expect(video().currentTime).toBe(10);
    await press('j');
    expect(video().currentTime).toBe(0);
    await press('ArrowRight');
    expect(video().currentTime).toBe(5);
    await press('ArrowRight', { shiftKey: true });
    expect(video().currentTime).toBe(6);
    await press('ArrowLeft');
    expect(video().currentTime).toBe(1);
    await press('5');
    expect(video().currentTime).toBe(50);
    await press('End');
    expect(video().currentTime).toBe(100);
    await press('Home');
    expect(video().currentTime).toBe(0);
  });

  it('steps between chapters and quizzes, forwards and back', async () => {
    await mount(<InteractiveVideo group={group()} />);

    await press(']');
    expect(video().currentTime).toBe(20);
    await press(']');
    expect(video().currentTime).toBe(40);
    await press('[');
    expect(video().currentTime).toBe(20);
    await press('[');
    expect(video().currentTime).toBe(0);
  });

  it('leaves the keys alone where a learner is typing, and where they turned them off', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loadCaptions}
        preferences={{ panel: true }}
      />,
    );
    await waitFor(() => expect(loadCaptions).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    await user.type(screen.getByRole('searchbox'), 'l');
    expect(video().currentTime).toBe(0);

    cleanup();
    await mount(<InteractiveVideo group={group()} preferences={{ shortcuts: false }} />);
    await press('l');
    expect(video().currentTime).toBe(0);
  });

  it('changes speed from the menu and from the keyboard, and remembers it', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);

    await user.click(screen.getByRole('button', { name: 'Playback speed' }));
    await user.click(screen.getByRole('menuitemradio', { name: '1.5×' }));
    expect(video().playbackRate).toBe(1.5);
    expect(screen.getByRole('button', { name: 'Playback speed' })).toHaveTextContent('1.5×');

    await press('<');
    expect(video().playbackRate).toBe(1.25);
    await press('>');
    await press('>');
    expect(video().playbackRate).toBe(1.75);

    // The next video starts where this learner left the dial.
    cleanup();
    await mount(<InteractiveVideo group={group()} />);
    await waitFor(() => expect(video().playbackRate).toBe(1.75));
  });

  it('mutes, shows the time the other way round, and opens the panel', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);

    await press('m');
    expect(video().muted).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(video().muted).toBe(false);

    const time = screen.getByRole('button', { name: 'Show time remaining' });
    expect(time).toHaveTextContent('0:00 / 1:40');
    await user.click(time);
    expect(screen.getByRole('button', { name: 'Show time elapsed' })).toHaveTextContent('-1:40');

    await user.click(screen.getByRole('button', { name: 'Contents and transcript' }));
    expect(screen.getByRole('button', { name: /Medio/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Medio/ }));
    expect(video().currentTime).toBe(40);
  });

  it('draws the caption of the moment, and turns them off and on again', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loadCaptions} />);
    await waitFor(() => expect(screen.getByText('Primera línea')).toBeInTheDocument());

    await press('c');
    expect(screen.queryByText('Primera línea')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show captions' }));
    expect(screen.getByText('Primera línea')).toBeInTheDocument();

    // Not over the end card: nothing is being spoken there.
    await act(async () => {
      video().dispatchEvent(new Event('ended'));
    });
    expect(screen.queryByText('Primera línea')).not.toBeInTheDocument();
    await act(async () => {
      await video().play();
    });

    // The line follows the playhead. Seeking past the quiz at 0:20 first: a
    // seek crosses nothing, and a quiz would hide the captions behind it.
    await press('4');
    await act(async () => {
      await video().play();
      video().currentTime = 45;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByText('Segunda línea')).toBeInTheDocument();
  });

  it('offers every caption track, and the size and background of the words', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loadCaptions} />);
    await waitFor(() => expect(loadCaptions).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('menuitem', { name: /Captions/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Español' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Português' }));
    await waitFor(() =>
      expect(loadCaptions).toHaveBeenLastCalledWith(expect.objectContaining({ srclang: 'pt' })),
    );

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('menuitem', { name: /Caption size/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Large' }));
    expect(document.querySelector('.lk-iv-caption')).toHaveAttribute('data-size', 'large');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Caption background/ }));
    expect(document.querySelector('.lk-iv-caption')).not.toHaveAttribute('data-background');
  });

  it('shows the shortcut list, and closes it with the keyboard', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);

    await press('?');
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(sheet).getByText('Play or pause')).toBeInTheDocument();
    expect(within(sheet).getByText('Previous or next chapter or quiz')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('asks the browser for fullscreen and for a picture-in-picture window', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => undefined);
    const exit = vi.fn(async () => undefined);
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      value: null,
      writable: true,
    });
    Object.defineProperty(document, 'exitPictureInPicture', { configurable: true, value: exit });
    await mount(<InteractiveVideo group={group()} />);
    Element.prototype.requestFullscreen = request;
    HTMLVideoElement.prototype.requestPictureInPicture = vi.fn(
      async () => ({}) as PictureInPictureWindow,
    );

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Picture in picture' }));
    expect(HTMLVideoElement.prototype.requestPictureInPicture).toHaveBeenCalled();

    // The button changes with the state the browser reports.
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: shell() });
    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
    expect(shell()).toHaveAttribute('data-fullscreen', 'true');
  });

  it('leaves a picture-in-picture window before it opens a quiz over the video', async () => {
    const exit = vi.fn(async () => undefined);
    await mount(<InteractiveVideo group={group()} />);
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      value: video(),
    });
    Object.defineProperty(document, 'exitPictureInPicture', { configurable: true, value: exit });

    await act(async () => {
      await video().play();
      video().currentTime = 21;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).toBeVisible());
    expect(exit).toHaveBeenCalled();
  });

  it('skips a quiz when asked, and does not stop there again', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    await mount(<InteractiveVideo group={group()} onInteraction={onInteraction} />);
    await act(async () => {
      await video().play();
      video().currentTime = 21;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));

    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).not.toBeVisible());
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video-quiz-skipped' }),
    );
    expect(video().paused).toBe(false);
  });

  it('sends the learner back to what a quiz was about when they ask to watch it again', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);
    // Past the first quiz by seeking, then play into the second.
    await press('7');
    await act(async () => {
      await video().play();
      video().currentTime = 81;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Rewatch' }));

    // Back to the chapter that ran before this quiz, playing.
    expect(video().currentTime).toBe(40);
    expect(video().paused).toBe(false);
    expect(document.querySelector('.lk-iv-quiz')).not.toBeVisible();
  });

  it('hides its controls while the video plays, and brings them back on a move', async () => {
    await mount(<InteractiveVideo group={group()} />);
    expect(shell()).toHaveAttribute('data-chrome', 'shown');

    await act(async () => {
      await video().play();
    });
    await waitFor(() => expect(shell()).toHaveAttribute('data-chrome', 'hidden'), {
      timeout: 4000,
    });

    await act(async () => {
      (document.querySelector('.lk-iv-stage') as HTMLElement).dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true }),
      );
    });
    expect(shell()).toHaveAttribute('data-chrome', 'shown');
  });

  it('keeps the controls out of the way of a quiz', async () => {
    await mount(<InteractiveVideo group={group()} />);
    await act(async () => {
      await video().play();
      video().currentTime = 21;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).toBeVisible());

    // `inert`: not clickable, not focusable, not read out.
    expect(document.querySelector('.lk-iv-chrome')).toHaveAttribute('inert');
    expect(shell()).toHaveAttribute('data-quiz-open', 'true');
  });
});

describe('InteractiveVideo menus and panels', () => {
  it('moves through a menu with the arrows and closes it with Escape', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);
    const speed = screen.getByRole('button', { name: 'Playback speed' });

    await user.click(speed);
    // It opens on the speed in use, so the learner starts from where they are.
    expect(screen.getByRole('menuitemradio', { name: 'Normal' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: '1.25×' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: '0.75×' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitemradio', { name: '0.5×' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: '2.5×' })).toHaveFocus();
    // Past the last item it comes round to the first.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: '0.5×' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // A letter typed in a menu belongs to the menu, not to the player.
    expect(video().currentTime).toBe(0);
  });

  it('turns captions off from the menu they were chosen in', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loadCaptions} />);
    await waitFor(() => expect(screen.getByText('Primera línea')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('menuitem', { name: /Captions/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }));

    expect(screen.queryByText('Primera línea')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show captions' })).toBeInTheDocument();
  });

  it('opens a quiz from the end card, and closes the card to do it', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} />);
    await act(async () => {
      video().dispatchEvent(new Event('ended'));
    });

    await user.click(screen.getByRole('button', { name: /Otra/ }));

    await waitFor(() => expect(document.querySelector('.lk-iv-quiz')).toBeVisible());
    expect(screen.queryByText('You reached the end')).not.toBeInTheDocument();
    expect(video().currentTime).toBe(80);
  });

  it('follows the spoken line down the transcript', async () => {
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loadCaptions}
        preferences={{ panel: true }}
      />,
    );
    await waitFor(() => expect(loadCaptions).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));

    const lines = document.querySelector('.lk-iv-lines') as HTMLElement;
    lines.scrollTo = vi.fn();
    expect(screen.getByRole('button', { name: /Primera línea/ })).toHaveAttribute(
      'data-active',
      'true',
    );

    await press('4');
    await act(async () => {
      await video().play();
      video().currentTime = 45;
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(screen.getByRole('button', { name: /Segunda línea/ })).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(lines.scrollTo).toHaveBeenCalled();
  });
});
