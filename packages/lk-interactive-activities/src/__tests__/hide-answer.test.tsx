// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerEventToXapi } from '../events/xapi.js';
import { nextWhatHappensStage } from '../templates/what-happens/player/machine.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import { validateWhatHappensData } from '../templates/what-happens/schema.js';
import { whatHappensFixture } from './player-fixtures.js';

const cancel = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('speechSynthesis', {
    speak: vi.fn(),
    cancel,
    speaking: true,
    pending: false,
    getVoices: () => [{ lang: 'en-US', name: 'English', localService: true }],
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cancel.mockClear();
});

const video = (container: HTMLElement) => container.querySelector('video') as HTMLVideoElement;
const root = (container: HTMLElement) => container.querySelector('[data-lkia-root]') as HTMLElement;
const stageOf = (container: HTMLElement) => root(container).getAttribute('data-stage');
const toggle = (container: HTMLElement) =>
  container.querySelector('[data-lkia-answer-toggle]') as HTMLButtonElement;
const status = async (container: HTMLElement) => {
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  return container.querySelector('[data-lkia-status]')?.textContent ?? '';
};
function toTell(container: HTMLElement) {
  fireEvent.click(screen.getByRole('button', { name: /^The garden/ }));
  video(container).currentTime = 3;
  fireEvent.timeUpdate(video(container));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.ended(video(container));
}

describe('What Happens: hiding the answer again', () => {
  it('turns Show answer into Hide answer in place, keeping focus, and back', async () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    const button = toggle(container);
    button.focus();
    fireEvent.click(button);
    expect(stageOf(container)).toBe('answer');
    // The same element, relabelled, still has focus; the answer is announced.
    expect(toggle(container)).toBe(button);
    expect(button.textContent).toBe('Hide answer');
    expect(button.getAttribute('aria-keyshortcuts')).toBe('A');
    expect(document.activeElement).toBe(button);
    expect(await status(container)).toBe('Sample answer: She opens the gate and smiles.');

    fireEvent.click(button);
    expect(stageOf(container)).toBe('tell');
    expect(toggle(container)).toBe(button);
    expect(button.textContent).toBe('Show answer');
    expect(document.activeElement).toBe(button);
    expect(await status(container)).toBe('Answer hidden. Your turn again.');
  });

  it('brings the supports back exactly as they were, open or closed', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    const supports = () => container.querySelector('[data-lkia-supports]');
    // Closed before: closed after.
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(supports()).toBeNull();
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(supports()?.getAttribute('data-open')).toBe('false');
    // Open before: open after, and marked so the chips spring back in.
    fireEvent.keyDown(root(container), { key: 'h' });
    fireEvent.keyDown(root(container), { key: 'a' });
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(supports()?.getAttribute('data-open')).toBe('true');
    expect(container.querySelector('[data-lkia-tell]')?.hasAttribute('data-returning')).toBe(true);
    expect(screen.getByText('a hint not in the answer')).toBeTruthy();
  });

  it('focuses the step heading when A is pressed away from the button', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    root(container).focus();
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(document.activeElement?.textContent).toBe('Sample answer');
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(document.activeElement?.tagName).toBe('H2');
    expect(stageOf(container)).toBe('tell');
  });

  it('never traps the learner: after the answer was seen, Next is offered with it hidden', () => {
    const onEvent = vi.fn();
    const { container } = render(
      <WhatHappensPlayer activity={whatHappensFixture()} onEvent={onEvent} />,
    );
    toTell(container);
    // Before the first reveal, telling comes first: no Next yet, N does nothing.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.keyDown(root(container), { key: 'n' });
    expect(stageOf(container)).toBe('tell');
    fireEvent.keyDown(root(container), { key: 'a' });
    fireEvent.keyDown(root(container), { key: 'a' });
    const next = screen.getByRole('button', { name: 'Next' });
    // Show answer stays the main action; Next sits beside it.
    expect(toggle(container).hasAttribute('data-lkia-primary')).toBe(true);
    expect(next.hasAttribute('data-lkia-primary')).toBe(false);
    fireEvent.keyDown(root(container), { key: 'n' });
    expect(stageOf(container)).toBe('board');
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(
      expect.arrayContaining(['answer.shown', 'answer.hidden', 'clip.completed']),
    );
  });

  it('starts every clip with the answer unseen again', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    fireEvent.keyDown(root(container), { key: 'a' });
    fireEvent.keyDown(root(container), { key: 'Escape' });
    toTell(container);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(container.querySelector('[data-lkia-tell]')?.hasAttribute('data-returning')).toBe(false);
  });

  it('stops the spoken answer when it is hidden', async () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    toTell(container);
    fireEvent.keyDown(root(container), { key: 'a' });
    await act(async () => {
      fireEvent.keyDown(root(container), { key: 'l' });
    });
    cancel.mockClear();
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(cancel).toHaveBeenCalled();
  });

  it('lets the editor rename Hide answer, and offers Spanish', () => {
    const activity = whatHappensFixture();
    activity.copy = { hideAnswer: 'Cover it up' };
    expect(validateWhatHappensData(activity).success).toBe(true);
    const { container } = render(<WhatHappensPlayer activity={activity} />);
    toTell(container);
    fireEvent.keyDown(root(container), { key: 'a' });
    expect(toggle(container).textContent).toBe('Cover it up');
    cleanup();
    const spanish = render(<WhatHappensPlayer activity={whatHappensFixture()} locale="es" />);
    fireEvent.click(screen.getByRole('button', { name: /^The garden/ }));
    video(spanish.container).currentTime = 3;
    fireEvent.timeUpdate(video(spanish.container));
    fireEvent.click(screen.getByRole('button', { name: 'Revelar' }));
    fireEvent.ended(video(spanish.container));
    fireEvent.keyDown(root(spanish.container), { key: 'a' });
    expect(toggle(spanish.container).textContent).toBe('Ocultar respuesta');
  });

  it('refuses an empty Hide answer label', () => {
    const activity = whatHappensFixture();
    activity.copy = { hideAnswer: '' };
    const result = validateWhatHappensData(activity);
    expect(result.success).toBe(false);
  });

  it('moves answer → tell only by hide, and maps answer.hidden to interacted', () => {
    expect(nextWhatHappensStage('answer', 'hide')).toBe('tell');
    expect(nextWhatHappensStage('tell', 'hide')).toBe('tell');
    const statement = playerEventToXapi(
      { type: 'answer.hidden', activityId: 'a', clipId: 'c' },
      {
        actor: { objectType: 'Agent', account: { homePage: 'https://example.org', name: 'x' } },
        object: { id: 'https://example.org/a' },
      },
    );
    expect(statement.verb.id).toBe('http://adlnet.gov/expapi/verbs/interacted');
    expect(statement.result?.score).toBeUndefined();
  });
});
