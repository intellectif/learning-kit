// @vitest-environment jsdom
// One test (or more) per finding of the 0.1.0 audit (docs/internal/interactive-activities/audit-0.1.0.md).
import {
  assertRedacted,
  createDraft,
  listMediaRefs,
  redact,
  validateDraft,
} from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSafeMediaUrl } from '../contract/read.js';
import { InteractiveActivityPlayer } from '../player/InteractiveActivityPlayer.js';
import { MIN_STAGE_SCALE, resolveLayout } from '../player/layout.js';
import { chromeLocaleFor, definedOnly } from '../player/locale.js';
import { registerTemplatePlayer } from '../player/registry.js';
import {
  registerInteractiveActivities,
  registerTemplate,
  validateInteractiveActivity,
} from '../registry/templates.js';
import { interactiveActivitiesStylesheet } from '../style/css.js';
import { localFontFaceCss, parseGoogleFontsCss } from '../style/fonts.js';
import { resolveStyleTokens } from '../style/tokens.js';
import { CINE_SCRAMBLE_AI_SPEC } from '../templates/cine-scramble/ai-spec.js';
import { CineScramblePlayer } from '../templates/cine-scramble/player/CineScramblePlayer.js';
import {
  CINE_SCRAMBLE_JSON_SCHEMA,
  cineScrambleMediaSlots,
  cineScrambleTemplate,
  createCineScrambleDraft,
  validateCineScrambleData,
} from '../templates/cine-scramble/schema.js';
import { WHAT_HAPPENS_AI_SPEC } from '../templates/what-happens/ai-spec.js';
import { voiceFor } from '../templates/what-happens/player/listen.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import { answerTextHash, isAnswerAudioCurrent } from '../templates/what-happens/rules.js';
import {
  createWhatHappensDraft,
  validateWhatHappensData,
  WHAT_HAPPENS_JSON_SCHEMA,
  whatHappensMediaSlots,
  whatHappensTemplate,
} from '../templates/what-happens/schema.js';
import type { WhatHappensData } from '../templates/what-happens/types.js';
import { matchSupportsInAnswer } from '../templates/what-happens/underline.js';
import { GOOGLE_FONTS_SAMPLE } from './fixtures/google-fonts-sample.js';
import { cineScrambleFixture, whatHappensFixture } from './player-fixtures.js';

/** A PointerEvent stand-in that keeps `pointerId`, `pointerType`, `isPrimary` and `buttons`. */
class PointerStub extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

const speak = vi.fn();
const cancel = vi.fn();
let speaking = false;
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('PointerEvent', PointerStub);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn() });
  speaking = false;
  vi.stubGlobal('speechSynthesis', {
    speak: (utterance: unknown) => {
      speaking = true;
      speak(utterance);
    },
    cancel,
    getVoices: () => [],
    get speaking() {
      return speaking;
    },
    pending: false,
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      voice: unknown = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  speak.mockClear();
  cancel.mockClear();
});

const video = (container: HTMLElement) => container.querySelector('video') as HTMLVideoElement;
const root = (container: HTMLElement) => container.querySelector('[data-lkia-root]') as HTMLElement;
const statusText = () => document.querySelector('[data-lkia-status]')?.textContent;
function openClip(name = /^The garden/) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function freezeClip(container: HTMLElement) {
  video(container).currentTime = 3;
  fireEvent.timeUpdate(video(container));
}
function reach(container: HTMLElement, stage: 'tell' | 'answer') {
  openClip();
  freezeClip(container);
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.ended(video(container));
  if (stage === 'answer') fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
}
/** Every property path a JSON Schema describes, `$ref`s followed one level into `$defs`. */
function schemaPaths(schema: Record<string, unknown>): Set<string> {
  const paths = new Set<string>();
  const defs = (schema.$defs ?? {}) as Record<string, Record<string, unknown>>;
  const walk = (node: Record<string, unknown>, prefix: string) => {
    if (typeof node.$ref === 'string') {
      const target = defs[node.$ref.replace('#/$defs/', '')];
      if (target) walk(target, prefix);
      return;
    }
    if (node.items && typeof node.items === 'object')
      walk(node.items as Record<string, unknown>, `${prefix}[]`);
    const properties = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, child] of Object.entries(properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      walk(child, path);
    }
  };
  walk(schema, '');
  return paths;
}
/** Every key path in a JSON value, arrays as `[]`. */
function valuePaths(value: unknown, prefix = '', paths = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) valuePaths(item, `${prefix}[]`, paths);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      valuePaths(child, path, paths);
    }
  }
  return paths;
}
function fullWhatHappens(): WhatHappensData {
  const activity = whatHappensFixture();
  activity.supportsEnabled = true;
  activity.copy = { revealButton: 'Show me' };
  activity.style = {
    presetId: 'default',
    mode: 'dark',
    motionPresetId: 'lively',
    fonts: { heading: 'Lexend', body: 'Lexend' },
  };
  const clip = activity.clips[0];
  if (!clip) throw new Error('fixture');
  Object.assign(clip, {
    thumb: { assetKey: 't.jpg', url: 'thumbs/t.jpg' },
    poster: { assetKey: 'p.jpg' },
    captions: { assetKey: 'c.vtt', url: 'captions/c.vtt', srclang: 'en', label: 'English' },
    predictPrompt: 'What next?',
    tellPrompt: 'Tell it.',
    supportsEnabled: true,
    supportsLabel: 'Help',
    audio: { assetKey: 'a.mp3', voice: 'v', textHash: answerTextHash(clip.answer.text) },
    videoPrompt: { text: 'A gate', generatedBy: 'model' },
    origin: 'generated',
  });
  return activity;
}

describe('contracts', () => {
  it('K3: the JSON Schemas describe every field the contract types have', () => {
    const wh = schemaPaths(WHAT_HAPPENS_JSON_SCHEMA);
    for (const path of valuePaths(fullWhatHappens())) expect(wh, path).toContain(path);
    const cs = schemaPaths(CINE_SCRAMBLE_JSON_SCHEMA);
    const scramble = cineScrambleFixture();
    Object.assign(scramble, {
      locale: 'en',
      tagline: 'One morning',
      poster: { assetKey: 'p.jpg', url: 'p.jpg' },
      style: {
        presetId: 'cinema-dark',
        mode: 'light',
        motionPresetId: 'gentle',
        fonts: { heading: 'Lexend' },
      },
      vocabEnabled: true,
      vocab: [{ term: 'gate', definition: 'A door in a fence' }],
      copy: { checkLabel: 'Check it' },
    });
    const clip = scramble.scenes[0]?.clips[0];
    if (clip) {
      clip.video.url = 'clip.mp4';
      clip.video.durationS = 3;
      clip.videoPrompt = { text: 'A seed', generatedBy: 'model' };
    }
    expect(validateCineScrambleData(scramble).success).toBe(true);
    for (const path of valuePaths(scramble)) expect(cs, path).toContain(path);
  });
  it('K5: unknown keys are kept, at every level, in a copy detached from the input', () => {
    const input = whatHappensFixture() as WhatHappensData & Record<string, unknown>;
    input.hostRowId = 42;
    (input.clips[0] as unknown as Record<string, unknown>).hostNote = 'kept';
    (input.clips[0]?.video as unknown as Record<string, unknown>).mimeType = 'video/mp4';
    const result = validateWhatHappensData(input);
    if (!result.success) throw new Error('expected success');
    const data = result.data as WhatHappensData & Record<string, unknown>;
    expect(data.hostRowId).toBe(42);
    expect((data.clips[0] as unknown as Record<string, unknown>).hostNote).toBe('kept');
    const video = data.clips[0]?.video as unknown as Record<string, unknown> | undefined;
    expect(video?.mimeType).toBe('video/mp4');
    data.title = 'Changed';
    expect(input.title).toBe('Garden predictions');
  });
  it('K20: every issue carries a stable code', () => {
    const result = validateWhatHappensData({
      ...whatHappensFixture(),
      title: '',
      locale: 'not a tag!!',
    });
    expect(result).toMatchObject({
      success: false,
      errors: [
        { path: ['title'], code: 'empty' },
        { path: ['locale'], code: 'invalid_locale' },
      ],
    });
  });
  it('K24/K25: language tags are checked, and only safe media URLs are accepted', () => {
    expect(validateWhatHappensData({ ...whatHappensFixture(), locale: 'es-419' }).success).toBe(
      true,
    );
    expect(isSafeMediaUrl('media/clip.mp4')).toBe(true);
    expect(isSafeMediaUrl('https://cdn.example/clip.mp4?sig=1')).toBe(true);
    expect(isSafeMediaUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeMediaUrl(' JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeMediaUrl('data:text/html,<script>')).toBe(false);
    const activity = whatHappensFixture();
    if (activity.clips[0]) activity.clips[0].video.url = 'javascript:alert(1)';
    expect(validateWhatHappensData(activity)).toMatchObject({
      errors: [{ path: ['clips', 0, 'video', 'url'], code: 'unsafe_url' }],
    });
  });
  it('K8/K6: a new draft is incomplete, never complete; lk-core can create, check and walk it', () => {
    registerInteractiveActivities();
    let id = 0;
    const draft = createDraft('what-happens' as never, {
      newId: () => `id-${++id}`,
    }) as WhatHappensData;
    expect(draft.clips).toHaveLength(8);
    expect(validateDraft('what-happens' as never, draft)).toMatchObject({ status: 'incomplete' });
    expect(validateWhatHappensData(draft).success).toBe(false);
    const scramble = createDraft('cine-scramble' as never, { newId: () => `s-${++id}` });
    expect(validateDraft('cine-scramble' as never, scramble)).toMatchObject({
      status: 'incomplete',
    });
    expect(() => listMediaRefs({ type: 'what-happens', id: 'x' } as never)).not.toThrow();
    expect(() => listMediaRefs({ type: 'cine-scramble', id: 'x' } as never)).not.toThrow();
    expect(whatHappensTemplate.createDraft('a').id).toBe('a');
    expect(cineScrambleTemplate.createDraft('b').id).toBe('b');
  });
  it('K21: media slots list every file, needed or optional, filled or not', () => {
    const slots = whatHappensMediaSlots(createWhatHappensDraft());
    expect(slots).toHaveLength(8 * 5);
    expect(slots[0]).toMatchObject({
      role: 'video',
      required: true,
      present: false,
      aspect: '9:16',
    });
    expect(slots.filter((slot) => slot.required)).toHaveLength(8);
    const full = whatHappensMediaSlots(fullWhatHappens());
    expect(full.filter((slot) => slot.present).map((slot) => slot.role)).toEqual([
      'video',
      'thumb',
      'poster',
      'captions',
      'audio',
    ]);
    expect(cineScrambleMediaSlots(createCineScrambleDraft())[0]).toMatchObject({
      role: 'poster',
      present: false,
    });
    expect(whatHappensMediaSlots({} as never)).toEqual([]);
  });
  it('K16: a redacted copy passes assertRedacted; one with an authoring field fails it', () => {
    registerInteractiveActivities();
    const learner = redact(fullWhatHappens() as never);
    expect(() => assertRedacted(learner)).not.toThrow();
    expect(() =>
      assertRedacted({
        ...learner,
        clips: [{ ...fullWhatHappens().clips[0], videoPrompt: { text: 'x' } }],
      } as never),
    ).toThrow();
    expect(() => assertRedacted(redact(cineScrambleFixture() as never))).not.toThrow();
  });
  it('K7: the registry types its result, renders registered players, and protects the built-ins', () => {
    const result = validateInteractiveActivity(whatHappensFixture());
    expect(result.success && result.data.type).toBe('what-happens');
    const custom = {
      ...whatHappensTemplate,
      id: 'quiz-cards',
      activityType: 'quiz-cards',
      validate: (data: unknown) => ({ success: true as const, data }),
    };
    registerTemplate(custom as never);
    registerTemplatePlayer<{ id: string; type: string }>('quiz-cards', ({ activity }) => (
      <p>Custom player for {activity.id}</p>
    ));
    render(<InteractiveActivityPlayer activity={{ type: 'quiz-cards', id: 'deck-1' }} />);
    expect(screen.getByText('Custom player for deck-1')).toBeTruthy();
    cleanup();
    render(<InteractiveActivityPlayer activity={{ type: 'nope', id: 'x' }} />);
    expect(screen.getByRole('alert').textContent).toContain('"nope"');
    expect(() => registerTemplatePlayer('what-happens', () => null)).toThrow(/built-in/);
    expect(() => registerTemplatePlayer('quiz-cards', () => null)).toThrow(/different player/);
  });
  it('K10: AI schemas refuse empty text and duplicate supports', () => {
    const clips = (
      WHAT_HAPPENS_AI_SPEC.jsonSchema.properties as Record<string, Record<string, unknown>>
    ).clips;
    const clipSchema = (clips?.items as Record<string, Record<string, Record<string, unknown>>>)
      ?.properties;
    expect(clipSchema?.predictPrompt).toMatchObject({ minLength: 1 });
    expect(clipSchema?.supports).toMatchObject({ uniqueItems: true });
    expect(
      (CINE_SCRAMBLE_AI_SPEC.jsonSchema.properties as Record<string, unknown>).tagline,
    ).toMatchObject({ minLength: 1 });
    expect(WHAT_HAPPENS_AI_SPEC.rules.join(' ')).toMatch(/Strict structured-output modes/);
  });
  it('K12: a preset brings its own motion, and no mode means the system setting', () => {
    expect(interactiveActivitiesStylesheet({ presetId: 'cinema-dark' })).toContain(
      '--lkia-duration: 420ms;',
    );
    expect(
      interactiveActivitiesStylesheet({ presetId: 'cinema-dark', motionPresetId: 'lively' }),
    ).toContain('--lkia-duration: 200ms;');
    expect(resolveStyleTokens({ presetId: 'cinema-dark' }, true).bg).toBe('#0A0A0B');
    expect(resolveStyleTokens({ presetId: 'cinema-dark' }, false).bg).toBe('#EBEBEE');
  });
  it('K14: the answer hash ignores spacing and accents written two ways, and spots a changed answer', () => {
    expect(answerTextHash(' Café  ole ')).toBe(answerTextHash('Café ole'));
    expect(answerTextHash('One')).not.toBe(answerTextHash('Two'));
    expect(answerTextHash('One')).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    const clip = fullWhatHappens().clips[0];
    if (!clip) throw new Error('fixture');
    expect(isAnswerAudioCurrent(clip)).toBe(true);
    expect(isAnswerAudioCurrent({ ...clip, answer: { text: 'Changed.' } })).toBe(false);
    expect(isAnswerAudioCurrent({ ...clip, audio: undefined } as never)).toBe(false);
  });
  it('K22: every occurrence of a support is underlined, first item first on overlaps', () => {
    expect(matchSupportsInAnswer('the gate, the gate', ['the gate'])).toHaveLength(2);
    expect(
      matchSupportsInAnswer('opens the gate', ['the gate', 'opens the']).map(
        (match) => match.support,
      ),
    ).toEqual(['the gate']);
  });
  it('K4: Google Fonts CSS reads into one face per rule, with each file once and its range', () => {
    const faces = parseGoogleFontsCss(GOOGLE_FONTS_SAMPLE);
    expect(faces).toHaveLength(18);
    expect(new Set(faces.map((face) => face.url)).size).toBe(6);
    expect(faces[0]).toMatchObject({
      family: 'Bricolage Grotesque',
      subset: 'vietnamese',
      format: 'woff2',
    });
    expect(faces.every((face) => face.unicodeRange?.startsWith('U+'))).toBe(true);
    const local = localFontFaceCss(faces);
    expect(local).toContain('unicode-range: U+0000-00FF');
    expect(local).not.toContain('fonts.gstatic.com');
    expect(parseGoogleFontsCss('nothing here')).toEqual([]);
  });
});

describe('players: runtime', () => {
  it('R2: a freeze the player makes by itself never takes focus from the host page', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openClip();
    input.focus();
    freezeClip(container);
    expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
    input.remove();
  });
  it('R6: a host that swaps the activity starts the player afresh', () => {
    const { container, rerender } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openClip();
    freezeClip(container);
    const other = { ...whatHappensFixture(), id: 'other', title: 'Other' };
    rerender(<WhatHappensPlayer activity={other} />);
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
  });
  it('R10: going back cancels no speech the player did not start', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openClip();
    fireEvent.click(screen.getByRole('button', { name: 'All clips' }));
    expect(cancel).not.toHaveBeenCalled();
    reach(container, 'answer');
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    return waitFor(() => expect(speak).toHaveBeenCalled()).then(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(cancel).toHaveBeenCalled();
    });
  });
  it('R11: the Play fallback leaves once the clip plays some other way', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    openClip();
    await screen.findByRole('button', { name: /Play/ });
    fireEvent.playing(video(container));
    expect(screen.queryByRole('button', { name: /Play/ })).toBeNull();
  });
  it('R14/A8: a failed spoken answer says so in its own words', async () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    reach(container, 'answer');
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0]?.[0] as { onerror: (event: { error: string }) => void };
    act(() => utterance.onerror({ error: 'interrupted' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => utterance.onerror({ error: 'synthesis-failed' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'The answer could not be read aloud on this device.',
    );
  });
  it('K15: the spoken answer prefers a voice on the device', () => {
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [
        { lang: 'es-ES', localService: false, name: 'Cloud' },
        { lang: 'es-MX', localService: true, name: 'Local' },
      ],
    });
    expect(voiceFor('es-ES')?.name).toBe('Local');
  });
  it('K14: a recording made for an older answer is not played', async () => {
    const activity = whatHappensFixture();
    if (activity.clips[0])
      activity.clips[0].audio = {
        assetKey: 'old.mp3',
        textHash: answerTextHash('An older answer'),
      };
    const { container } = render(<WhatHappensPlayer activity={activity} />);
    reach(container, 'answer');
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(container.querySelector('audio')?.getAttribute('src')).toBeNull();
  });
});

describe('players: accessibility', () => {
  it('A4: each step focuses its heading, and back on the board, the card the learner left', () => {
    const activity = whatHappensFixture();
    activity.clips.push({
      ...activity.clips[0],
      id: 'second',
      title: 'The second garden',
    } as never);
    const { container } = render(<WhatHappensPlayer activity={activity} />);
    openClip(/^The second garden/);
    expect(document.activeElement?.textContent).toBe('Watch closely. The clip will pause.');
    freezeClip(container);
    expect(document.activeElement?.textContent).toBe('What happens next?');
    fireEvent.keyDown(root(container), { key: 'Escape' });
    expect(document.activeElement?.textContent).toContain('The second garden');
  });
  it('A5: shortcuts can be turned off; Enter and Escape still work', () => {
    const { container } = render(
      <WhatHappensPlayer activity={whatHappensFixture()} shortcuts={false} />,
    );
    openClip();
    freezeClip(container);
    fireEvent.keyDown(root(container), { key: 'r' });
    expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reveal' }).hasAttribute('aria-keyshortcuts')).toBe(
      false,
    );
    fireEvent.keyDown(root(container), { key: 'Enter' });
    expect(container.querySelector('[data-stage="reveal"]')).not.toBeNull();
  });
  it('A6: a clip with captions plays them as a captions track', () => {
    const { container } = render(<WhatHappensPlayer activity={fullWhatHappens()} />);
    openClip();
    const track = container.querySelector('track');
    expect(track).toMatchObject({ kind: 'captions', srclang: 'en', label: 'English' });
    expect(track?.getAttribute('src')).toBe('captions/c.vtt');
    expect(video(container).getAttribute('crossorigin')).toBe('anonymous');
  });
  it('A7: N moves on from a clip with no sample answer', () => {
    const activity = whatHappensFixture();
    if (activity.clips[0]) activity.clips[0].answer = { text: '' };
    const { container } = render(<WhatHappensPlayer activity={activity} />);
    reach(container, 'tell');
    fireEvent.keyDown(root(container), { key: 'n' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
  });
  it('A13: every step has an h1', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    openClip();
    expect(container.querySelector('h1')?.textContent).toContain('Clip 1 of 1');
  });
  it('A14: the chrome is marked in the language it is written in', () => {
    expect(chromeLocaleFor('pt-BR', undefined)).toBe('en');
    expect(chromeLocaleFor('es-CO', undefined)).toBe('es-CO');
    expect(chromeLocaleFor('pt-BR', { nextButton: 'Próximo' })).toBe('pt-BR');
    expect(chromeLocaleFor('pt-BR', { nextButton: undefined })).toBe('en');
    expect(chromeLocaleFor(undefined, undefined)).toBe('en');
    const { container } = render(
      <WhatHappensPlayer activity={whatHappensFixture()} locale="pt-BR" />,
    );
    expect(root(container).getAttribute('lang')).toBe('en');
  });
  it('K23: an undefined host string never blanks the chrome', () => {
    expect(definedOnly({ a: 'x', b: undefined, c: '' })).toEqual({ a: 'x' });
    const { container } = render(
      <WhatHappensPlayer
        activity={whatHappensFixture()}
        strings={{ revealButton: undefined as never }}
      />,
    );
    openClip();
    freezeClip(container);
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeTruthy();
  });
  it('A2: below the minimum scale the player stacks', () => {
    expect(MIN_STAGE_SCALE).toBe(0.55);
    expect(resolveLayout(1000, 562)).toBe('portrait');
    expect(resolveLayout(1100, 620)).toBe('landscape');
  });
});

describe('Cine-Scramble: drags, focus and status', () => {
  const card = (container: HTMLElement, number: number) =>
    container.querySelector(`[data-lkia-clip="${number}"]`) as HTMLElement;
  const startScramble = () => fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  it('R3: a second finger never takes over a drag, and its cancel does not end it', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    startScramble();
    const first = card(container, 1);
    fireEvent.pointerDown(first, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(first, { pointerId: 1, buttons: 1, clientX: 30, clientY: 0 });
    expect(first.getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerDown(card(container, 2), { button: 0, pointerId: 2, isPrimary: false });
    fireEvent.pointerCancel(first, { pointerId: 2 });
    expect(first.getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerCancel(first, { pointerId: 1 });
    expect(first.getAttribute('data-dragging')).toBe('false');
  });
  it('R4: a mouse drag whose button was let go elsewhere ends on the next move', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    startScramble();
    const first = card(container, 1);
    fireEvent.pointerDown(first, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(first, { pointerId: 1, buttons: 0, clientX: 40, clientY: 0 });
    expect(first.getAttribute('data-dragging')).toBe('false');
    fireEvent.pointerMove(first, { pointerId: 1, buttons: 0, clientX: 80, clientY: 0 });
    expect(container.querySelector('[data-drag-active="true"]')).toBeNull();
  });
  it('R5: a clip marks its entrance as played, so later moves do not replay it', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    startScramble();
    const first = card(container, 1);
    // jsdom has no AnimationEvent, so React listens for the prefixed name there.
    fireEvent.animationEnd(first);
    fireEvent(first, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(first.hasAttribute('data-entered')).toBe(true);
  });
  it('R7: a clicked placement keeps focus in the board, on the placed clip', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    startScramble();
    const clipButton = card(container, 1).querySelector('[data-lkia-clip-button]') as HTMLElement;
    clipButton.focus();
    fireEvent.click(clipButton, { detail: 1 });
    const drop = screen.getByRole('button', { name: /Slot 2/ });
    drop.focus();
    fireEvent.click(drop, { detail: 1 });
    expect(document.activeElement?.closest('[data-lkia-slot="1"]')).not.toBeNull();
  });
  it('R8: leaving the board mid-drag clears drag mode for the next attempt', () => {
    const activity = cineScrambleFixture();
    activity.scenes.push({ ...activity.scenes[0], id: 'evening', title: 'Evening' } as never);
    const { container } = render(<CineScramblePlayer activity={activity} />);
    fireEvent.click(screen.getByRole('button', { name: /Morning/ }));
    const first = card(container, 1);
    fireEvent.pointerDown(first, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(first, { pointerId: 1, buttons: 1, clientX: 40, clientY: 0 });
    fireEvent.click(screen.getByRole('button', { name: /All scenes/ }));
    fireEvent.click(screen.getByRole('button', { name: /Evening/ }));
    expect(container.querySelector('[data-drag-active="true"]')).toBeNull();
    expect(container.querySelector('[data-dragging="true"]')).toBeNull();
  });
  it('A10/A11: Escape clears a selection and its status; an empty slot asks for a clip first', async () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    startScramble();
    fireEvent.click(screen.getByRole('button', { name: /Slot 1/ }));
    await waitFor(() => expect(statusText()).toBe('Select a clip first, then a slot.'));
    fireEvent.click(card(container, 1).querySelector('[data-lkia-clip-button]') as HTMLElement);
    await waitFor(() => expect(statusText()).toBe('Clip 1 selected. Choose a slot.'));
    fireEvent.keyDown(root(container), { key: 'Escape' });
    await waitFor(() => expect(statusText()).toBe(''));
    const drop = screen.getByRole('button', { name: /Slot 1/ });
    expect(document.getElementById(drop.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Step 1.',
    );
  });
  it('A21: the activity behind the glossary is inert while it is open, and focus comes back', () => {
    const activity = cineScrambleFixture();
    activity.vocab = [{ term: 'gate', definition: 'A door in a fence' }];
    const { container } = render(<CineScramblePlayer activity={activity} />);
    const open = screen.getByRole('button', { name: /Vocabulary/ });
    fireEvent.click(open);
    expect(container.querySelector('[data-lkia-content]')?.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(container.querySelector('[data-lkia-content]')?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(open);
  });
  it('K13: completing every scene completes the activity once', () => {
    const onEvent = vi.fn();
    const activity = cineScrambleFixture(3);
    render(<CineScramblePlayer activity={activity} onEvent={onEvent} />);
    startScramble();
    const scene = activity.scenes[0];
    const order = scene ? scene.clips : [];
    for (const clip of order) {
      const number = Number(
        [...document.querySelectorAll('[data-lkia-pool] [data-lkia-clip]')]
          .find(
            (element) =>
              element.querySelector('video')?.getAttribute('src') === `clip-${clip.id}.mp4`,
          )
          ?.getAttribute('data-lkia-clip'),
      );
      fireEvent.keyDown(
        document.querySelector(
          `[data-lkia-clip="${number}"] [data-lkia-clip-button]`,
        ) as HTMLElement,
        { key: String(clip.id + 1) },
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(screen.getByRole('button', { name: /Start over/ }));
    expect(
      onEvent.mock.calls.filter(([event]) => event.type === 'activity.completed'),
    ).toHaveLength(1);
  });
});
