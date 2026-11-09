// @vitest-environment jsdom
import { redact, validateActivity, withoutAuthorOnly } from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillTemplate, languageAttributes, primaryLanguage } from '../player/locale.js';
import { Stage } from '../player/Stage.js';
import {
  registerInteractiveActivities,
  validateInteractiveActivity,
} from '../registry/templates.js';
import { cineScrambleChrome } from '../templates/cine-scramble/copy.js';
import { validateCineScrambleData } from '../templates/cine-scramble/schema.js';
import { whatHappensChrome } from '../templates/what-happens/copy.js';
import { reachesFreeze } from '../templates/what-happens/player/machine.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import { validateWhatHappensData, type WhatHappensData } from '../templates/what-happens/schema.js';
import { cineScrambleFixture, whatHappensFixture } from './player-fixtures.js';

const speak = vi.fn();
let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('speechSynthesis', {
    speak,
    cancel: vi.fn(),
    getVoices: () => [
      { lang: 'en-US', name: 'English' },
      { lang: 'es-MX', name: 'Spanish' },
    ],
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      voice: unknown = null;
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  speak.mockClear();
});

const video = (container: HTMLElement) => container.querySelector('video') as HTMLVideoElement;
const root = (container: HTMLElement) => container.querySelector('[data-lkia-root]') as HTMLElement;
function openFirst() {
  fireEvent.click(screen.getByRole('button', { name: /^The garden/ }));
}
function toTell(container: HTMLElement) {
  openFirst();
  video(container).currentTime = 3;
  fireEvent.timeUpdate(video(container));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.ended(video(container));
}

describe('locale helpers', () => {
  it('reads the primary language of any tag, and fills placeholders', () => {
    expect(['es', 'es-CO', 'es_419', 'ES'].map(primaryLanguage)).toEqual(['es', 'es', 'es', 'es']);
    expect(primaryLanguage(undefined)).toBe('');
    expect(whatHappensChrome('es-CO').showAnswer).toBe('Mostrar respuesta');
    expect(cineScrambleChrome('es-419').checkLabel).toBe('Comprobar');
    expect(whatHappensChrome('pt-BR').showAnswer).toBe('Show answer');
    expect(languageAttributes('ar')).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(languageAttributes(' ')).toEqual({});
    expect(fillTemplate('{a} of {b} {c}', { a: 1, b: 'two' })).toBe('1 of two {c}');
  });
});

describe('What Happens: getting back, shortcuts and the freeze', () => {
  it('returns to the cards from every stage, by button or Escape, even from a broken clip', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openFirst();
    fireEvent.error(video(container));
    expect(screen.getByRole('alert').textContent).toBe('This clip could not be played.');
    fireEvent.click(screen.getByRole('button', { name: 'All clips' }));
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
    toTell(container);
    fireEvent.keyDown(root(container), { key: 'Escape' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
    fireEvent.keyDown(root(container), { key: 'Escape' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Garden predictions' })).toBeTruthy();
  });
  it('never takes a shortcut with Ctrl, Cmd or Alt held', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'])
      fireEvent.keyDown(root(container), { key: 'a', [modifier]: true });
    expect(container.querySelector('[data-stage="tell"]')).not.toBeNull();
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(container.querySelector('[data-stage="answer"]')).not.toBeNull();
  });
  it('stops one frame before the freeze point with requestVideoFrameCallback', () => {
    const callbacks: Array<(now: number, meta: { mediaTime: number }) => void> = [];
    const cancel = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      configurable: true,
      value(callback: (now: number, meta: { mediaTime: number }) => void) {
        callbacks.push(callback);
        return callbacks.length;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
      configurable: true,
      value: cancel,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get: () => false,
    });
    try {
      const onEvent = vi.fn();
      const { container } = render(
        <WhatHappensPlayer activity={whatHappensFixture()} onEvent={onEvent} />,
      );
      openFirst();
      // 30 fps frames: 2.9 and 2.933 do not reach 3.0; the next frame would pass it.
      act(() => callbacks.at(-1)?.(0, { mediaTime: 2.9 }));
      act(() => callbacks.at(-1)?.(0, { mediaTime: 2.9333 }));
      expect(container.querySelector('[data-stage="watch"]')).not.toBeNull();
      act(() => callbacks.at(-1)?.(0, { mediaTime: 2.9667 }));
      expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
      expect(video(container).currentTime).toBe(3);
      // The timeupdate backstop does not freeze a second time.
      fireEvent.timeUpdate(video(container));
      expect(onEvent.mock.calls.filter(([event]) => event.type === 'clip.frozen')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'All clips' }));
      openFirst();
      fireEvent.click(screen.getByRole('button', { name: 'All clips' }));
      expect(cancel).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
      Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
      Reflect.deleteProperty(HTMLMediaElement.prototype, 'paused');
    }
  });
  it('falls back to animation frames where requestVideoFrameCallback is missing', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get: () => false,
    });
    try {
      const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
      openFirst();
      video(container).currentTime = 1;
      act(() => frames.at(-1)?.(0));
      expect(container.querySelector('[data-stage="watch"]')).not.toBeNull();
      video(container).currentTime = 2.99;
      act(() => frames.at(-1)?.(0));
      expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
      expect(cancel).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLMediaElement.prototype, 'paused');
    }
    expect(reachesFreeze(2.9, 1 / 30, 3)).toBe(false);
    expect(reachesFreeze(2.97, 1 / 30, 3)).toBe(true);
  });
});

describe('What Happens: answers, speech and copy', () => {
  it("reads the answer aloud in the activity's language, with a matching voice", async () => {
    const activity = { ...whatHappensFixture(), locale: 'es-CO' };
    const { container } = render(<WhatHappensPlayer activity={activity} />);
    toTell(container);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(container.querySelector('[data-lkia-answer]')?.getAttribute('lang')).toBe('es-CO');
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'es-CO', voice: { lang: 'es-MX' } });
  });
  it("plays the learner copy from redact(): the sample answer is public, the video prompt isn't", () => {
    registerInteractiveActivities();
    const activity: WhatHappensData = whatHappensFixture();
    activity.clips[0].videoPrompt = { text: 'author only' };
    activity.clips[0].origin = 'generated';
    const learner = redact(activity as never) as unknown as WhatHappensData;
    expect(learner.clips[0]?.answer.text).toBe('She opens the gate and smiles.');
    expect(learner.clips[0]).not.toHaveProperty('videoPrompt');
    expect(withoutAuthorOnly(activity as never)).not.toHaveProperty('clips.0.origin');
    const { container } = render(<WhatHappensPlayer activity={learner} />);
    toTell(container);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(container.querySelector('mark')?.textContent).toBe('opens the gate');
  });
  it('finishes a clip without a sample answer from the tell stage', () => {
    const activity = whatHappensFixture();
    activity.clips[0].answer = undefined as never;
    const onEvent = vi.fn();
    const { container } = render(<WhatHappensPlayer activity={activity} onEvent={onEvent} />);
    toTell(container);
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    // A shows and hides an answer; with none, it does nothing. N goes on.
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(container.querySelector('[data-stage="tell"]')).not.toBeNull();
    fireEvent.keyDown(root(container), { key: 'n' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
    expect(onEvent.mock.calls.map(([event]) => event.type)).toContain('board.completed');
    expect(screen.getByRole('button', { name: /^The garden/ }).textContent).toContain('Done');
  });
  it("lets the editor's copy win over host strings, and host strings over the built-in chrome", () => {
    const activity = whatHappensFixture();
    activity.copy = { revealButton: 'Show me' };
    const { container } = render(
      <WhatHappensPlayer
        activity={activity}
        locale="es"
        strings={{ revealButton: 'Host reveal', replayToFreeze: 'Host replay' }}
      />,
    );
    openFirst();
    video(container).currentTime = 3;
    fireEvent.timeUpdate(video(container));
    expect(screen.getByRole('button', { name: 'Show me' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Host replay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todos los clips' })).toBeTruthy();
    expect(root(container).getAttribute('lang')).toBe('es');
  });
  it('restarts nothing when the host re-renders with fresh activity data', () => {
    const { container, rerender } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openFirst();
    const calls = play.mock.calls.length;
    rerender(<WhatHappensPlayer activity={whatHappensFixture()} />);
    expect(play.mock.calls.length).toBe(calls);
    expect(container.querySelector('[data-stage="watch"]')).not.toBeNull();
  });
});

describe('validation fixes', () => {
  const clip = whatHappensFixture().clips[0];
  const withClip = (patch: Record<string, unknown>) =>
    validateWhatHappensData({ ...whatHappensFixture(), clips: [{ ...clip, ...patch }] });
  it('refuses empty labels and prompts, and duplicate supports', () => {
    expect(
      validateWhatHappensData({ ...whatHappensFixture(), copy: { revealButton: '' } }),
    ).toMatchObject({
      success: false,
      errors: [{ path: ['copy', 'revealButton'] }],
    });
    for (const key of ['predictPrompt', 'tellPrompt', 'supportsLabel'])
      expect(withClip({ [key]: ' ' }).success).toBe(false);
    expect(withClip({ supports: ['a', ''] }).success).toBe(false);
    expect(withClip({ supports: ['The gate', 'the gate '] })).toMatchObject({
      success: false,
      errors: [
        { path: ['clips', 0, 'supports', 1], message: 'Duplicate support item "the gate ".' },
      ],
    });
  });
  it('refuses duplicate vocabulary, empty Cine-Scramble copy, a bad mode or duration', () => {
    const base = cineScrambleFixture();
    expect(
      validateCineScrambleData({
        ...base,
        vocab: [
          { term: 'Gate', definition: 'a' },
          { term: 'gate', definition: 'b' },
        ],
      }),
    ).toMatchObject({ success: false, errors: [{ path: ['vocab', 1, 'term'] }] });
    expect(validateCineScrambleData({ ...base, copy: { checkLabel: '' } }).success).toBe(false);
    expect(validateCineScrambleData({ ...base, tagline: '' }).success).toBe(false);
    expect(
      validateCineScrambleData({ ...base, style: { presetId: 'default', mode: 'sepia' } }),
    ).toMatchObject({ success: false, errors: [{ path: ['style', 'mode'] }] });
    const clips = base.scenes[0].clips.map((item, index) =>
      index === 0 ? { ...item, video: { ...item.video, durationS: 0 } } : item,
    );
    expect(
      validateCineScrambleData({ ...base, scenes: [{ ...base.scenes[0], clips }] }).success,
    ).toBe(false);
    const prompt = base.scenes[0].clips.map((item) => ({
      ...item,
      videoPrompt: { text: 'A gate', generatedBy: 'model' },
    }));
    const kept = validateCineScrambleData({
      ...base,
      scenes: [{ ...base.scenes[0], clips: prompt }],
    });
    expect(kept.success && kept.data.scenes[0]?.clips[0]?.videoPrompt?.generatedBy).toBe('model');
  });
  it('validates any template by its type, with a clear error for an unknown one', () => {
    expect(validateInteractiveActivity(whatHappensFixture()).success).toBe(true);
    expect(validateInteractiveActivity(cineScrambleFixture()).success).toBe(true);
    expect(validateInteractiveActivity({ type: 'reveal' })).toEqual({
      success: false,
      errors: [
        {
          path: ['type'],
          code: 'unknown_template',
          message: 'Unknown template "reveal". Known: "what-happens", "cine-scramble".',
        },
      ],
    });
    expect(validateInteractiveActivity([]).success).toBe(false);
    expect(
      validateInteractiveActivity({ ...whatHappensFixture(), schemaVersion: '2.0' }),
    ).toMatchObject({
      success: false,
      errors: [{ path: ['schemaVersion'] }],
    });
    expect(validateActivity('what-happens' as never, whatHappensFixture()).success).toBe(true);
  });
});

describe('embed resize', () => {
  it("posts the player's rendered size as it changes", () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    let notify: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 640.4, height: 900.2 } as DOMRect);
    const { unmount } = render(
      <Stage
        style={{ presetId: 'default' }}
        template="t"
        stage="s"
        label="Activity"
        chromeLocale="en"
        viewport={{ width: 400, height: 700 }}
        embed={{ postResize: true }}
      >
        Content
      </Stage>,
    );
    expect(post).toHaveBeenLastCalledWith(
      { type: 'lk-interactive-activity:resize', width: 641, height: 901 },
      '*',
    );
    rect.mockReturnValue({ width: 640, height: 1200 } as DOMRect);
    notify();
    expect(post).toHaveBeenLastCalledWith(
      { type: 'lk-interactive-activity:resize', width: 640, height: 1200 },
      '*',
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('What Happens: the help the teacher shows', () => {
  it('starts hidden, opens and closes by button or H, and closes again on the next clip', () => {
    const activity = whatHappensFixture();
    activity.clips.push({ ...activity.clips[0], id: 'second', title: 'The second garden' });
    const onEvent = vi.fn();
    const { container } = render(<WhatHappensPlayer activity={activity} onEvent={onEvent} />);
    toTell(container);
    const help = screen.getByRole('button', { name: 'To help you' });
    const body = document.getElementById(help.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(help.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[data-lkia-supports]')?.getAttribute('data-open')).toBe(
      'false',
    );
    fireEvent.click(help);
    expect(body.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('[data-lkia-supports]')?.getAttribute('data-open')).toBe('true');
    expect(
      Array.from(body.querySelectorAll('li'), (li) => li.style.getPropertyValue('--i')),
    ).toEqual(['0', '1', '2']);
    fireEvent.keyDown(root(container), { key: 'h' });
    expect(help.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(root(container), { key: 'h', ctrlKey: true });
    expect(help.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(root(container), { key: 'H' });
    expect(help.getAttribute('aria-expanded')).toBe('true');
    expect(
      onEvent.mock.calls.map(([event]) => event.type).filter((type) => type.startsWith('supports')),
    ).toEqual(['supports.shown', 'supports.hidden', 'supports.shown']);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.queryByRole('button', { name: 'To help you' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /^The second garden/ }));
    video(container).currentTime = 3;
    fireEvent.timeUpdate(video(container));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    fireEvent.ended(video(container));
    expect(screen.getByRole('button', { name: 'To help you' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
  it('labels the toggle with the editor’s own words, and has no toggle without supports', () => {
    const activity = whatHappensFixture();
    activity.clips[0].supportsLabel = 'Help';
    const { container, unmount } = render(<WhatHappensPlayer activity={activity} />);
    toTell(container);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    fireEvent.keyDown(root(container), { key: 'h' });
    expect(screen.getByRole('button', { name: 'Help' }).getAttribute('aria-expanded')).toBe('true');
    unmount();
    const bare = whatHappensFixture();
    bare.clips[0].supports = [];
    const second = render(<WhatHappensPlayer activity={bare} />);
    toTell(second.container);
    fireEvent.keyDown(root(second.container), { key: 'h' });
    expect(second.container.querySelector('[data-lkia-supports]')).toBeNull();
  });
});
