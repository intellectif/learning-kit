import type { ItemGroup, MediaTrack } from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { InteractiveVideo } from '../index.js';
import type { VideoPreferences } from '../prefs.js';

/**
 * Two caption languages at once: a first line and, when the learner asks, a
 * second under it. The host decides which languages exist and what the
 * defaults are; the player decides how they are chosen, remembered and drawn.
 */

const vtt = (...cues: [number, number, string][]): string =>
  [
    'WEBVTT',
    '',
    ...cues.flatMap(([start, end, text]) => [
      `00:00:${String(start).padStart(2, '0')}.000 --> 00:00:${String(end).padStart(2, '0')}.000`,
      text,
      '',
    ]),
  ].join('\n');

// The Spanish is segmented differently from the English on purpose: nothing
// may assume the two tracks share timings.
const FILES: Record<string, string> = {
  en: vtt([0, 4, 'Hello, class'], [4, 8, 'My name is Anna']),
  es: vtt([1, 3, 'Hola, clase'], [3, 9, 'Me llamo Anna']),
  pt: vtt([0, 4, 'Olá, turma'], [4, 8, 'Meu nome é Anna']),
  ar: vtt([0, 4, 'مرحبا يا صف'], [4, 8, 'اسمي آنا']),
};

const TRACKS: MediaTrack[] = [
  { kind: 'captions', src: '/en.vtt', srclang: 'en', label: 'English', default: true },
  { kind: 'subtitles', src: '/es.vtt', srclang: 'es', label: 'Español' },
  { kind: 'subtitles', src: '/pt.vtt', srclang: 'pt', label: 'Português' },
  { kind: 'subtitles', src: '/ar.vtt', srclang: 'ar', label: 'العربية' },
];

const item = {
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id: 'q1',
  title: 'q1',
  question: '¿Cuánto?',
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 'a', text: 'Tres', isCorrect: false },
    { id: 'b', text: 'Cuatro', isCorrect: true },
  ],
};

const group = (tracks: MediaTrack[] = TRACKS, navigation?: 'no-skip-ahead'): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'v',
    title: 'Vídeo',
    stimulus: {
      id: 's',
      kind: 'video',
      media: { type: 'video', url: '/v.mp4', alt: 'Vídeo', tracks },
    },
    items: [item],
    // Far from the seconds these tests watch, so no quiz interrupts them.
    timeline: {
      ...(navigation ? { navigation } : {}),
      cues: [{ id: 'c1', at: 90, title: 'Pausa', itemIds: ['q1'] }],
    },
  }) as ItemGroup;

const loader = () => vi.fn(async (track: MediaTrack) => FILES[track.srclang] ?? '');

async function mount(ui: React.ReactElement): Promise<void> {
  render(ui);
  await act(async () => {
    (document.querySelector('video') as HTMLVideoElement).dispatchEvent(
      new Event('loadedmetadata'),
    );
    // Let the caption files resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function press(key: string, over: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    (document.querySelector('.lk-iv') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, ...over }),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/** Each caption line on screen: its role, language, direction and words. */
const lines = () =>
  [...document.querySelectorAll<HTMLElement>('.lk-iv-caption')].map((line) => [
    line.dataset.role,
    line.lang,
    line.getAttribute('dir'),
    line.textContent,
  ]);

async function openCaptionsPage(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  if (screen.queryByRole('menu') === null) {
    await user.click(screen.getByRole('button', { name: 'Settings' }));
  }
  await user.click(screen.getByRole('menuitem', { name: /^Captions/ }));
}

async function chooseSecond(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await openCaptionsPage(user);
  await user.click(screen.getByRole('menuitem', { name: /Second language/ }));
  await user.click(screen.getByRole('menuitemradio', { name }));
}

beforeEach(() => {
  stubMediaElement({ duration: 100 });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('two caption languages', () => {
  it('shows a first line alone, and a second under it when the learner picks one', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await waitFor(() => expect(lines()).toEqual([['primary', 'en', 'auto', 'Hello, class']]));

    await chooseSecond(user, 'Español');
    await press('ArrowRight', { shiftKey: true });

    // Primary on top, secondary below it, both in one container.
    expect(lines()).toEqual([
      ['primary', 'en', 'auto', 'Hello, class'],
      ['secondary', 'es', 'auto', 'Hola, clase'],
    ]);
    const container = document.querySelector('.lk-iv-captions') as HTMLElement;
    expect(container).toHaveAttribute('data-size', 'medium');
    expect(container.children).toHaveLength(2);
    // The lines keep the 15.x hooks, so a stylesheet written against them still matches.
    for (const line of container.children) {
      expect(line).toHaveClass('lk-iv-caption');
      expect(line).toHaveAttribute('data-size', 'medium');
    }
  });

  it('shows each line its own cue: two tracks need not share timings', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await chooseSecond(user, 'Español');

    // At 0:00 the Spanish has not started: the English shows alone.
    expect(lines().map(([role, , , text]) => [role, text])).toEqual([['primary', 'Hello, class']]);
    // At 0:03 the first Spanish cue has ended and the second begins, while the
    // English line runs on: each line changes on its own schedule.
    await press('ArrowRight', { shiftKey: true });
    await press('ArrowRight', { shiftKey: true });
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([role, , , text]) => [role, text])).toEqual([
      ['primary', 'Hello, class'],
      ['secondary', 'Me llamo Anna'],
    ]);
    // At 0:04 the English moves on; the Spanish runs across the change.
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([role, , , text]) => [role, text])).toEqual([
      ['primary', 'My name is Anna'],
      ['secondary', 'Me llamo Anna'],
    ]);
  });

  it('offers every pair from the menu, and swaps rather than dropping a language', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await chooseSecond(user, 'Español');

    // Back out to the main page, whose captions row names the pair.
    await user.click(screen.getByRole('menuitem', { name: 'Second language' }));
    await user.click(screen.getByRole('menuitem', { name: 'Captions' }));
    expect(screen.getByRole('menuitem', { name: /^Captions/ })).toHaveTextContent(
      'English + Español',
    );

    // Picking the second line's language as the first swaps them.
    await openCaptionsPage(user);
    await user.click(screen.getByRole('menuitemradio', { name: 'Español' }));
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([role, lang]) => [role, lang])).toEqual([
      ['primary', 'es'],
      ['secondary', 'en'],
    ]);
  });

  it('never offers the first line’s own language as the second', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await openCaptionsPage(user);
    await user.click(screen.getByRole('menuitem', { name: /Second language/ }));
    const page = screen.getByRole('menu');
    expect(
      within(page)
        .getAllByRole('menuitemradio')
        .map((radio) => radio.textContent),
    ).toEqual(['Off', 'Español', 'Português', 'العربية']);
  });

  it('returns focus to the row a page was opened from', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await openCaptionsPage(user);
    await user.click(screen.getByRole('menuitem', { name: /Second language/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Second language' }));
    expect(screen.getByRole('menuitem', { name: /Second language/ })).toHaveFocus();
    await user.click(screen.getByRole('menuitem', { name: 'Captions' }));
    expect(screen.getByRole('menuitem', { name: /^Captions/ })).toHaveFocus();
  });

  it('hides both lines with C and brings the pair back, keeping both choices', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await chooseSecond(user, 'Español');
    await user.keyboard('{Escape}');
    await press('ArrowRight', { shiftKey: true });
    expect(lines()).toHaveLength(2);

    await press('c');
    expect(lines()).toEqual([]);
    await press('c');
    expect(lines()).toHaveLength(2);
  });
});

describe('Shift + C', () => {
  it('turns the second line on and off, and back on in the last language', async () => {
    const user = userEvent.setup();
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await press('ArrowRight', { shiftKey: true });

    // Nothing chosen before: the first other language the video has.
    await press('C', { shiftKey: true });
    expect(lines().map(([role, lang]) => [role, lang])).toEqual([
      ['primary', 'en'],
      ['secondary', 'es'],
    ]);
    await press('C', { shiftKey: true });
    expect(lines().map(([role]) => role)).toEqual(['primary']);

    // A language chosen from the menu is the one it brings back.
    await chooseSecond(user, 'Português');
    await user.keyboard('{Escape}');
    await press('C', { shiftKey: true });
    expect(lines().map(([role]) => role)).toEqual(['primary']);
    await press('C', { shiftKey: true });
    expect(lines()[1]?.[1]).toBe('pt');
  });

  it('brings back the host’s suggested language first, when the learner has none', async () => {
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'ar' }}
      />,
    );
    await press('ArrowRight', { shiftKey: true });
    // The suggestion is showing: Shift + C takes it away, then brings it back.
    expect(lines()[1]?.[1]).toBe('ar');
    await press('C', { shiftKey: true });
    await press('C', { shiftKey: true });
    expect(lines()[1]?.[1]).toBe('ar');
  });

  it('says so when the video has no other language, and changes nothing', async () => {
    const onPreferencesChange = vi.fn();
    await mount(
      <InteractiveVideo
        group={group([TRACKS[0] as MediaTrack])}
        captionsLoader={loader()}
        onPreferencesChange={onPreferencesChange}
      />,
    );
    await press('C', { shiftKey: true });
    await waitFor(() =>
      expect(screen.getByText('No second language for this video.')).toBeInTheDocument(),
    );
    expect(onPreferencesChange).not.toHaveBeenCalled();
    expect(lines().map(([role]) => role)).toEqual(['primary']);
  });

  it('is listed in the shortcut sheet, and turned off with the rest', async () => {
    await mount(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await press('?');
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(sheet).getByText('Second caption language on/off')).toBeInTheDocument();
    expect(within(sheet).getByText('Shift + C')).toBeInTheDocument();
    cleanup();

    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        preferences={{ shortcuts: false }}
      />,
    );
    await press('C', { shiftKey: true });
    expect(lines().map(([role]) => role)).toEqual(['primary']);
  });
});

describe('loading', () => {
  it('loads each language once for the life of the video, however often it is picked', async () => {
    const user = userEvent.setup();
    const load = loader();
    await mount(<InteractiveVideo group={group()} captionsLoader={load} />);
    await chooseSecond(user, 'Español');
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Español' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Português' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Español' }));

    const calls = load.mock.calls.map(([track]) => track.srclang);
    expect(calls.filter((language) => language === 'es')).toHaveLength(1);
    expect(calls.filter((language) => language === 'pt')).toHaveLength(1);
    expect(calls.filter((language) => language === 'en')).toHaveLength(1);
  });

  it('never lets a slow file land in a line that has moved on to another language', async () => {
    const user = userEvent.setup();
    let finishSpanish: (text: string) => void = () => {};
    const load = vi.fn((track: MediaTrack) =>
      track.srclang === 'es'
        ? new Promise<string>((resolve) => {
            finishSpanish = resolve;
          })
        : Promise.resolve(FILES[track.srclang] ?? ''),
    );
    await mount(<InteractiveVideo group={group()} captionsLoader={load} />);
    await chooseSecond(user, 'Español');
    await user.click(screen.getByRole('menuitemradio', { name: 'Português' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(lines()[1]?.slice(1)).toEqual(['pt', 'auto', 'Olá, turma']);

    // The Spanish file arrives late.
    await act(async () => {
      finishSpanish(FILES.es as string);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await press('ArrowRight', { shiftKey: true });
    expect(lines()[1]?.slice(1)).toEqual(['pt', 'auto', 'Olá, turma']);
  });

  it('keeps the first line when the second language fails, and says which failed', async () => {
    const user = userEvent.setup();
    const load = vi.fn(async (track: MediaTrack) => {
      if (track.srclang === 'es') {
        throw new Error('403');
      }
      return FILES[track.srclang] ?? '';
    });
    await mount(<InteractiveVideo group={group()} captionsLoader={load} />);
    await chooseSecond(user, 'Español');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(lines().map(([role, lang]) => [role, lang])).toEqual([['primary', 'en']]);
    expect(screen.getByText('The second language could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Captions could not be loaded.')).not.toBeInTheDocument();
  });
});

describe('preferences', () => {
  it('starts from the host’s pair until the learner changes it, and remembers the change', async () => {
    const user = userEvent.setup();
    const pair = { captionLanguage: 'en', secondaryCaptionLanguage: 'es' };
    await mount(
      <InteractiveVideo group={group()} captionsLoader={loader()} defaultPreferences={pair} />,
    );
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([, lang]) => lang)).toEqual(['en', 'es']);

    await openCaptionsPage(user);
    await user.click(screen.getByRole('menuitem', { name: /Second language/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }));
    cleanup();

    // The next video, same host, same suggestion: the learner's own choice wins.
    await mount(
      <InteractiveVideo group={group()} captionsLoader={loader()} defaultPreferences={pair} />,
    );
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([, lang]) => lang)).toEqual(['en']);
  });

  it('applies suggestions that arrive after the video opened, to fields nobody chose', async () => {
    const { rerender } = render(<InteractiveVideo group={group()} captionsLoader={loader()} />);
    await act(async () => {
      (document.querySelector('video') as HTMLVideoElement).dispatchEvent(
        new Event('loadedmetadata'),
      );
    });
    // The host's account settings load late.
    rerender(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'pt' }}
      />,
    );
    await press('ArrowRight', { shiftKey: true });
    expect(lines().map(([, lang]) => lang)).toEqual(['en', 'pt']);
  });

  it('reports each learner change once, with what changed, and never on opening', async () => {
    const user = userEvent.setup();
    const onPreferencesChange = vi.fn();
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ captionLanguage: 'en' }}
        onPreferencesChange={onPreferencesChange}
      />,
    );
    expect(onPreferencesChange).not.toHaveBeenCalled();

    await chooseSecond(user, 'Español');
    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    const [next, change] = onPreferencesChange.mock.calls[0] as [
      VideoPreferences,
      Partial<VideoPreferences>,
    ];
    expect(change).toEqual({ secondaryCaptionLanguage: 'es', captions: true });
    expect(next).toMatchObject({ captionLanguage: 'en', secondaryCaptionLanguage: 'es' });

    await press('m');
    expect(onPreferencesChange).toHaveBeenCalledTimes(2);
    expect(onPreferencesChange.mock.calls[1]?.[1]).toEqual({ muted: true });
  });

  it('reports the captions on screen whenever either line changes', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    await mount(
      <InteractiveVideo group={group()} captionsLoader={loader()} onInteraction={onInteraction} />,
    );
    const reported = () =>
      onInteraction.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === 'video-captions-changed')
        .map((event) => event.payload);

    await chooseSecond(user, 'Español');
    await user.click(screen.getByRole('menuitemradio', { name: 'Off' }));
    await user.keyboard('{Escape}');
    await press('c');
    expect(reported()).toEqual([
      { srclang: 'en', secondary: 'es' },
      { srclang: 'en', secondary: null },
      { srclang: null, secondary: null },
    ]);
  });
});

describe('the transcript', () => {
  it('shows the second language under each row, paired by overlap, and searches both', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'es' }}
        preferences={{ panel: true }}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    const rows = () =>
      [...document.querySelectorAll('.lk-iv-line')].map((row) => [
        row.querySelector('[lang="en"]')?.textContent,
        row.querySelector('.lk-iv-line-secondary')?.textContent ?? null,
      ]);
    // "Me llamo Anna" (3 → 9) overlaps the second English line (4 → 8) most.
    expect(rows()).toEqual([
      ['Hello, class', 'Hola, clase'],
      ['My name is Anna', 'Me llamo Anna'],
    ]);

    await user.type(screen.getByRole('searchbox'), 'llamo');
    expect(rows()).toEqual([['My name is Anna', 'Me llamo Anna']]);
  });

  it('holds the spoiler limit for the second language too', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo
        group={group(TRACKS, 'no-skip-ahead')}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'es' }}
        preferences={{ panel: true }}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    // At 0:00 the first English line has begun; its Spanish has not.
    const only = document.querySelector('.lk-iv-line') as HTMLElement;
    expect(document.querySelectorAll('.lk-iv-line')).toHaveLength(1);
    expect(only).toHaveTextContent('Hello, class');
    expect(only).not.toHaveTextContent('Hola');
  });

  it('is exactly as before with no second language', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo group={group()} captionsLoader={loader()} preferences={{ panel: true }} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    expect(document.querySelector('.lk-iv-line-text')).toBeNull();
    expect(document.querySelector('.lk-iv-line-secondary')).toBeNull();
  });
});

describe('right-to-left captions', () => {
  it('gives an Arabic line its own language and direction everywhere it appears', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'ar' }}
        preferences={{ panel: true }}
      />,
    );
    await press('ArrowRight', { shiftKey: true });
    expect(lines()[1]).toEqual(['secondary', 'ar', 'auto', 'مرحبا يا صف']);

    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    const secondary = document.querySelector('.lk-iv-line-secondary') as HTMLElement;
    expect(secondary).toHaveAttribute('lang', 'ar');
    expect(secondary).toHaveAttribute('dir', 'auto');

    await openCaptionsPage(user);
    const radio = screen.getByRole('menuitemradio', { name: 'العربية' });
    expect(radio).toHaveAttribute('lang', 'ar');
    expect(radio.querySelector('[dir="auto"]')).not.toBeNull();
  });

  it('passes axe on every captions page and the paired transcript', async () => {
    const user = userEvent.setup();
    await mount(
      <InteractiveVideo
        group={group()}
        captionsLoader={loader()}
        defaultPreferences={{ secondaryCaptionLanguage: 'ar' }}
        preferences={{ panel: true }}
      />,
    );
    const shell = document.querySelector('.lk-iv') as HTMLElement;
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    expect(await checkA11y(shell)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await checkA11y(shell)).toHaveNoViolations();
    await user.click(screen.getByRole('menuitem', { name: /^Captions/ }));
    expect(await checkA11y(shell)).toHaveNoViolations();
    await user.click(screen.getByRole('menuitem', { name: /Second language/ }));
    expect(await checkA11y(shell)).toHaveNoViolations();
  });
});
