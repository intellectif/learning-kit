import { describe, expect, it } from 'vitest';
import { planAttempt, verifyAttemptPlan } from '../attempt-plan.js';
import { createInteractiveVideoDraft, validateItemGroupDraft } from '../authoring/index.js';
import { flattenSequence } from '../item-group.js';
import { assertRedactedItemGroup, redactItemGroup } from '../redact.js';
import { validateItemGroup } from '../schemas/index.js';
import { RedactedItemGroupSchema } from '../schemas/item-group.js';
import { MediaSchema } from '../schemas/media.js';
import type { ScoredItem } from '../scoring/compose.js';
import { composeTimelineScore, readMediaProgress } from '../timeline.js';
import { INTERACTIVE_VIDEO_ITEM_TYPES, isInteractiveVideoItemType } from '../timeline-limits.js';
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  MultipleChoiceData,
  ReadAloudData,
  WrittenResponseData,
} from '../types/activity.js';
import type { ItemGroup, MediaTimeline } from '../types/item-group.js';

const mc = (id: string, question: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Question ${id}`,
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Good morning', isCorrect: true, feedback: 'Formal and polite.' },
    { id: 'b', text: 'Hey there', isCorrect: false },
  ],
});

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib',
  title: 'Complete the greeting',
  passage: 'Nice to {{a}} you.',
  blanks: [{ id: 'a', acceptedAnswers: ['meet'] }],
  scoringStrategy: 'partial',
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs',
  title: 'Prepositions',
  passage: "I'm {{a}} Spain.",
  banks: [
    {
      id: 'p',
      choices: [
        { id: 'from', text: 'from' },
        { id: 'of', text: 'of' },
      ],
    },
  ],
  gaps: [{ id: 'a', bankId: 'p', correctChoiceId: 'from' }],
  scoringStrategy: 'partial',
};

const dc: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc',
  title: 'Type what you hear',
  transcript: 'See you tomorrow.',
  media: { type: 'audio', url: 'https://cdn.example/see-you.mp3' },
};

const ra: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra',
  title: 'Read it aloud',
  referenceText: 'Nice to meet you.',
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const wr: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr',
  title: 'Write about it',
  prompt: 'Describe the conversation.',
  minWords: 10,
  maxWords: 60,
  rubric: { criteria: [{ name: 'Accuracy', weight: 1 }] },
};

const timeline: MediaTimeline = {
  cues: [
    // Authored out of time order on purpose: presentation follows the clock.
    { id: 'read', at: 240, itemIds: ['ra'], title: 'Your turn to speak' },
    { id: 'greet', at: 50, itemIds: ['q2', 'q1'], title: 'Check your understanding' },
    { id: 'blanks', at: 120, itemIds: ['fib'], required: true },
    { id: 'listen', at: 180, itemIds: ['gs', 'dc'] },
  ],
  chapters: [
    { at: 0, title: 'Greetings' },
    { at: 150, title: 'Introductions' },
  ],
  navigation: 'no-skip-ahead',
};

/** The owner's own example: a multiple-choice quiz at 0:50, fill-in-the-blanks at 2:00, read-aloud at 4:00. */
function video(over: Partial<ItemGroup> = {}): ItemGroup {
  return {
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'lesson-2',
    title: 'Lesson 2',
    slotKey: 'video',
    stimulus: {
      id: 'v',
      kind: 'video',
      media: {
        type: 'video',
        url: 'https://media.example/lesson-2.mp4',
        poster: 'https://media.example/lesson-2.jpg',
        tracks: [
          {
            kind: 'captions',
            src: 'https://media.example/lesson-2.en.vtt',
            srclang: 'en',
            label: 'English',
            default: true,
          },
        ],
      },
    },
    items: [
      mc('q1', 'Which greeting is formal?'),
      mc('q2', 'Which greeting is informal?'),
      fib,
      gs,
      dc,
      ra,
    ],
    timeline,
    ...over,
  };
}

function errorPaths(result: ReturnType<typeof validateItemGroup>): string[] {
  return result.success ? [] : result.errors.map((error) => error.path.join('.'));
}

describe('the five item types', () => {
  it('names exactly multiple choice, fill-in-the-blanks, gap select, dictation and read-aloud', () => {
    expect([...INTERACTIVE_VIDEO_ITEM_TYPES]).toEqual([
      'multiple-choice',
      'fill-in-the-blanks',
      'gap-select',
      'dictation',
      'read-aloud',
    ]);
    expect(isInteractiveVideoItemType('written-response')).toBe(false);
    expect(isInteractiveVideoItemType('item-group')).toBe(false);
    expect(isInteractiveVideoItemType(undefined)).toBe(false);
  });
});

describe('validateItemGroup with a timeline', () => {
  it('accepts an interactive video that holds each of the five types', () => {
    const result = validateItemGroup(video());
    expect(errorPaths(result)).toEqual([]);
    expect(result.success && result.data.timeline?.cues).toHaveLength(4);
  });

  it('refuses a written response, the one built-in type a video may not hold', () => {
    const result = validateItemGroup(
      video({
        items: [...video().items, wr],
        timeline: {
          ...timeline,
          cues: [...timeline.cues, { id: 'essay', at: 300, itemIds: ['wr'] }],
        },
      }),
    );
    expect(errorPaths(result)).toEqual(['items.6.type']);
  });

  it('refuses a stimulus that is not a video, and a video that is an embed', () => {
    const audio = video({
      stimulus: {
        id: 'v',
        kind: 'audio',
        media: { type: 'audio', url: 'https://media.example/a.mp3' },
      },
    });
    expect(errorPaths(validateItemGroup(audio))).toEqual(['stimulus.kind']);

    const embed = video({
      stimulus: {
        id: 'v',
        kind: 'video',
        media: { type: 'embed', url: 'https://www.youtube.com/embed/x', alt: 'Lesson' },
      },
    });
    expect(errorPaths(validateItemGroup(embed))).toEqual(['stimulus.media.type']);
  });

  it('refuses within-group shuffling: questions appear in quiz order', () => {
    expect(errorPaths(validateItemGroup(video({ shuffle: 'within-group' })))).toEqual(['shuffle']);
  });

  it('places every question in exactly one quiz', () => {
    const unplaced = video({
      timeline: { ...timeline, cues: timeline.cues.filter((cue) => cue.id !== 'read') },
    });
    expect(errorPaths(validateItemGroup(unplaced))).toEqual(['items.5']);

    const twice = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue) =>
          cue.id === 'read' ? { ...cue, itemIds: ['ra', 'q1'] } : cue,
        ),
      },
    });
    // Quizzes are walked in authored order: "read" (index 0) places q1 first, so the
    // second mention — in "greet" (index 1) — is the duplicate.
    expect(errorPaths(validateItemGroup(twice))).toEqual(['timeline.cues.1.itemIds.1']);

    const unknown = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue) =>
          cue.id === 'read' ? { ...cue, itemIds: ['ra', 'nope'] } : cue,
        ),
      },
    });
    expect(errorPaths(validateItemGroup(unknown))).toEqual(['timeline.cues.0.itemIds.1']);
  });

  it('refuses a quiz with no questions, a repeated quiz id, and chapters out of order', () => {
    const empty = video({
      timeline: { ...timeline, cues: [...timeline.cues, { id: 'none', at: 10, itemIds: [] }] },
    });
    expect(errorPaths(validateItemGroup(empty))).toEqual(['timeline.cues.4.itemIds']);

    const repeated = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue) => (cue.id === 'blanks' ? { ...cue, id: 'greet' } : cue)),
      },
    });
    expect(errorPaths(validateItemGroup(repeated))).toEqual(['timeline.cues.2.id']);

    const chapters = video({
      timeline: {
        ...timeline,
        chapters: [
          { at: 60, title: 'Two' },
          { at: 60, title: 'Also two' },
        ],
      },
    });
    expect(errorPaths(validateItemGroup(chapters))).toEqual(['timeline.chapters.1.at']);
  });

  it('refuses a negative or non-finite time and a misspelt key', () => {
    const negative = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue, i) => (i === 0 ? { ...cue, at: -1 } : cue)),
      },
    });
    expect(errorPaths(validateItemGroup(negative))).toEqual(['timeline.cues.0.at']);

    const nan = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue, i) => (i === 0 ? { ...cue, at: Number.NaN } : cue)),
      },
    });
    expect(errorPaths(validateItemGroup(nan))).toEqual(['timeline.cues.0.at']);

    const misspelt = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue, i) =>
          i === 0 ? ({ ...cue, requried: true } as unknown as typeof cue) : cue,
        ),
      },
    });
    expect(errorPaths(validateItemGroup(misspelt))).toEqual(['timeline.cues.0']);
  });

  it('requires a dictation inside a video to carry its own recording', () => {
    const { media: _media, ...silent } = dc;
    const result = validateItemGroup(
      video({
        items: video().items.map((item) => (item.id === 'dc' ? (silent as DictationData) : item)),
      }),
    );
    // The dictation's own schema accepts it (it can play a group stimulus); the timeline cannot.
    expect(errorPaths(result)).toEqual(['items.4.media']);
  });

  it('refuses data: and blob: URLs on a stored video', () => {
    const inlined = video({
      stimulus: {
        id: 'v',
        kind: 'video',
        media: { type: 'video', url: 'data:video/mp4;base64,AAAA' },
      },
    });
    expect(errorPaths(validateItemGroup(inlined))).toEqual(['stimulus.media.url']);
  });

  it('leaves a group without a timeline exactly as it was', () => {
    const listening: ItemGroup = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      stimulus: {
        id: 's',
        kind: 'audio',
        media: { type: 'audio', url: 'https://cdn.example/a.mp3' },
      },
      items: [wr, mc('q1', 'Why?')],
      shuffle: 'within-group',
    };
    expect(validateItemGroup(listening).success).toBe(true);
  });
});

describe('media tracks and poster', () => {
  const base = { type: 'video' as const, url: 'https://media.example/v.mp4' };

  it('accepts one track per kind and language, with at most one default', () => {
    const ok = MediaSchema.safeParse({
      ...base,
      tracks: [
        {
          kind: 'captions',
          src: 'https://m.example/en.vtt',
          srclang: 'en',
          label: 'English',
          default: true,
        },
        { kind: 'captions', src: 'https://m.example/es.vtt', srclang: 'es', label: 'Español' },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('refuses two defaults, a repeated language, a bad tag, a misspelt key, and tracks on an image', () => {
    const en = {
      kind: 'captions',
      src: 'https://m.example/en.vtt',
      srclang: 'en',
      label: 'English',
    };
    expect(
      MediaSchema.safeParse({
        ...base,
        tracks: [
          { ...en, default: true },
          { ...en, srclang: 'es', default: true },
        ],
      }).success,
    ).toBe(false);
    expect(MediaSchema.safeParse({ ...base, tracks: [en, { ...en, srclang: 'EN' }] }).success).toBe(
      false,
    );
    expect(
      MediaSchema.safeParse({ ...base, tracks: [{ ...en, srclang: 'english' }] }).success,
    ).toBe(false);
    expect(MediaSchema.safeParse({ ...base, tracks: [{ ...en, srclnag: 'en' }] }).success).toBe(
      false,
    );
    expect(
      MediaSchema.safeParse({ type: 'image', url: '/i.png', alt: 'x', tracks: [en] }).success,
    ).toBe(false);
  });

  it('allows a poster on a video only', () => {
    expect(MediaSchema.safeParse({ ...base, poster: '/poster.jpg' }).success).toBe(true);
    expect(MediaSchema.safeParse({ type: 'audio', url: '/a.mp3', poster: '/p.jpg' }).success).toBe(
      false,
    );
  });
});

describe('redactItemGroup with a timeline', () => {
  it('keeps the timeline and the tracks, and removes every answer key', () => {
    const projection = redactItemGroup(video());
    expect(projection.timeline).toEqual(timeline);
    expect(projection.stimulus.media?.tracks).toEqual(video().stimulus.media?.tracks);
    expect(projection.stimulus.media?.poster).toBe('https://media.example/lesson-2.jpg');
    const first = projection.items[0] as unknown as { options: Record<string, unknown>[] };
    expect(first.options[0]).not.toHaveProperty('isCorrect');
    expect(() => assertRedactedItemGroup(projection)).not.toThrow();
  });

  it('drops a key nobody classified, at every depth of the timeline', () => {
    const parked = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue) => ({ ...cue, answerHint: 'b' }) as typeof cue),
        chapters: [
          { at: 0, title: 'Intro', secret: 1 } as unknown as { at: number; title: string },
        ],
        graderNote: 'x',
      } as unknown as MediaTimeline,
    });
    const projection = redactItemGroup(parked);
    expect(JSON.stringify(projection.timeline)).not.toMatch(/answerHint|secret|graderNote/);
  });

  it('repeats the container rules in the strict redacted schema', () => {
    const projection = redactItemGroup(video());
    const withEssay = {
      ...projection,
      items: [...projection.items, { ...wr, redacted: true }],
      timeline: {
        ...timeline,
        cues: [...timeline.cues, { id: 'essay', at: 300, itemIds: ['wr'] }],
      },
    };
    const parsed = RedactedItemGroupSchema.safeParse(withEssay);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual([
      'items.6.type',
    ]);
  });
});

describe('flattenSequence with a timeline', () => {
  it('presents questions in quiz order, each carrying its quiz, with authored slot ids', () => {
    const slots = flattenSequence([video()]);
    expect(slots.map((slot) => slot.activity.id)).toEqual(['q2', 'q1', 'fib', 'gs', 'dc', 'ra']);
    // Slot ids come from the AUTHORED index, whatever the presented order.
    expect(slots.map((slot) => slot.slotId)).toEqual([
      'video.1',
      'video.0',
      'video.2',
      'video.3',
      'video.4',
      'video.5',
    ]);
    expect(slots.map((slot) => slot.group?.cue?.id)).toEqual([
      'greet',
      'greet',
      'blanks',
      'listen',
      'listen',
      'read',
    ]);
    expect(slots[0]?.group?.timeline).toEqual(timeline);
    expect(slots.every((slot) => slot.group?.timeline?.navigation === 'no-skip-ahead')).toBe(true);
  });

  it('keeps quizzes at one moment in their authored order', () => {
    const tied = video({
      timeline: {
        cues: [
          { id: 'b', at: 60, itemIds: ['fib', 'gs', 'dc', 'ra'] },
          { id: 'a', at: 60, itemIds: ['q1', 'q2'] },
        ],
      },
    });
    expect(flattenSequence([tied]).map((slot) => slot.activity.id)).toEqual([
      'fib',
      'gs',
      'dc',
      'ra',
      'q1',
      'q2',
    ]);
  });

  it('keeps a question no quiz places, after the placed ones, rather than dropping it', () => {
    const unplaced = video({ timeline: { cues: [{ id: 'a', at: 5, itemIds: ['ra'] }] } });
    const slots = flattenSequence([unplaced]);
    expect(slots.map((slot) => slot.activity.id)).toEqual(['ra', 'q1', 'q2', 'fib', 'gs', 'dc']);
    expect(slots[1]?.group?.cue).toBeUndefined();
  });

  it('throws on a timeline with within-group shuffling, as a defence behind the schema', () => {
    expect(() => flattenSequence([video({ shuffle: 'within-group' })], { seed: 's' })).toThrow(
      /timeline and shuffle/,
    );
  });

  it('adds no timeline or quiz to a group without a timeline', () => {
    const { timeline: _timeline, ...plain } = video();
    const slots = flattenSequence([plain]);
    expect(slots.every((slot) => slot.group !== undefined && !('timeline' in slot.group))).toBe(
      true,
    );
    expect(slots.every((slot) => slot.group !== undefined && !('cue' in slot.group))).toBe(true);
  });
});

describe('planAttempt and verifyAttemptPlan with a timeline', () => {
  it('freezes each question’s quiz, and reports a moved quiz as drift', () => {
    const before = planAttempt([video()]);
    expect(before.slots[0]?.group?.cue).toEqual({ id: 'greet', at: 50 });
    expect(before.slots[2]?.group?.cue).toEqual({ id: 'blanks', at: 120, required: true });

    const moved = video({
      timeline: {
        ...timeline,
        cues: timeline.cues.map((cue) => (cue.id === 'blanks' ? { ...cue, at: 150 } : cue)),
      },
    });
    const after = planAttempt([moved]);
    expect(after.planHash).not.toBe(before.planHash);
    const drift = verifyAttemptPlan(before, after);
    expect(drift.matches).toBe(false);
    expect(drift.changedCueSlotIds).toEqual(['video.2']);
    expect(drift.changedSlotIds).toEqual([]);
  });

  it('reports no cue drift for a group without a timeline', () => {
    const { timeline: _timeline, ...plain } = video();
    const plan = planAttempt([plain]);
    expect(plan.slots.every((slot) => slot.group !== undefined && !('cue' in slot.group))).toBe(
      true,
    );
    expect(verifyAttemptPlan(plan, planAttempt([plain])).changedCueSlotIds).toEqual([]);
  });
});

describe('readMediaProgress', () => {
  it('reads a stored position, and clamps what it keeps', () => {
    expect(readMediaProgress({ progressVersion: '1.0', at: 42, furthest: 90 })).toEqual({
      progressVersion: '1.0',
      at: 42,
      furthest: 90,
    });
    // `furthest` behind `at` is raised to it; a negative `at` becomes 0.
    expect(readMediaProgress({ progressVersion: '1.0', at: 42, furthest: 10 })?.furthest).toBe(42);
    expect(readMediaProgress({ progressVersion: '1.0', at: -5, furthest: -1 })).toEqual({
      progressVersion: '1.0',
      at: 0,
      furthest: 0,
    });
    // A missing `furthest` is where playback stood.
    expect(readMediaProgress({ progressVersion: '1.0', at: 7 })?.furthest).toBe(7);
  });

  it('holds both positions inside a known duration — a re-cut video must not strand the playhead', () => {
    expect(readMediaProgress({ progressVersion: '1.0', at: 900, furthest: 950 }, 300)).toEqual({
      progressVersion: '1.0',
      at: 300,
      furthest: 300,
    });
  });

  it('answers null for anything that is not a stored progress, and never throws', () => {
    const hostile = Object.defineProperty({}, 'at', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    for (const value of [
      null,
      undefined,
      42,
      'at 42',
      [],
      { at: 42 },
      { progressVersion: '2.0', at: 42 },
      { progressVersion: '1.0', at: Number.NaN },
      { progressVersion: '1.0', at: Number.POSITIVE_INFINITY },
      { progressVersion: '1.0', at: '42' },
      hostile,
    ]) {
      expect(readMediaProgress(value)).toBeNull();
    }
  });

  it('reads each field once, so an accessor cannot answer the check and the clamp differently', () => {
    let reads = 0;
    const flip = Object.defineProperty({ progressVersion: '1.0', furthest: 5 }, 'at', {
      get() {
        reads += 1;
        return reads === 1 ? 5 : -1e9;
      },
      enumerable: true,
    });
    expect(readMediaProgress(flip)?.at).toBe(5);
    expect(reads).toBe(1);
  });
});

describe('composeTimelineScore', () => {
  const graded = (slotId: string, score: number): ScoredItem => ({
    slotId,
    points: 1,
    outcome: {
      status: 'scored',
      score,
      maxScore: 1,
      passed: score >= 0.5,
      feedback: null,
      details: [],
    },
  });
  const policy = { passThreshold: 0.7, rounding: { mode: 'half-up' as const, dp: 2 } };

  it('composes the video’s own slots and ignores every other entry', () => {
    const result = composeTimelineScore(
      'video',
      [graded('video.0', 1), graded('video.1', 0), graded('other', 0), graded('video-2.0', 0)],
      policy,
    );
    expect(result.score).toBe(0.5);
    expect(result.status).toBe('final');
  });

  it('throws rather than composing nothing into a final result', () => {
    expect(() => composeTimelineScore('videoo', [graded('video.0', 1)], policy)).toThrow(
      /no scored item belongs/,
    );
  });
});

describe('interactive-video drafts', () => {
  const ids = () => {
    let next = 0;
    return {
      newId: () => {
        next += 1;
        return `id-${next}`;
      },
    };
  };

  it('starts incomplete, never complete', () => {
    const draft = createInteractiveVideoDraft(ids());
    expect(draft.stimulus.kind).toBe('video');
    expect(draft.timeline).toEqual({ cues: [] });
    expect(validateItemGroupDraft(draft).status).toBe('incomplete');
  });

  it('is complete once every question sits in a quiz at a real moment', () => {
    expect(validateItemGroupDraft(video())).toEqual(
      expect.objectContaining({ status: 'complete', issues: [] }),
    );
  });

  it.each([
    [
      'a question in no quiz',
      video({ timeline: { ...timeline, cues: timeline.cues.filter((cue) => cue.id !== 'read') } }),
      'ig_timeline_item_unplaced',
      'items.5',
      'incomplete',
    ],
    [
      'a quiz with no questions',
      video({
        timeline: { ...timeline, cues: [...timeline.cues, { id: 'e', at: 1, itemIds: [] }] },
      }),
      'ig_timeline_quiz_empty',
      'timeline.cues.4.itemIds',
      'incomplete',
    ],
    [
      'a quiz with no time',
      video({
        timeline: {
          ...timeline,
          cues: timeline.cues.map((cue, i) =>
            i === 0 ? ({ ...cue, at: undefined } as unknown as typeof cue) : cue,
          ),
        },
      }),
      'ig_timeline_quiz_time_required',
      'timeline.cues.0.at',
      'incomplete',
    ],
    [
      'a negative time',
      video({
        timeline: {
          ...timeline,
          cues: timeline.cues.map((cue, i) => (i === 0 ? { ...cue, at: -3 } : cue)),
        },
      }),
      'ig_timeline_quiz_time_invalid',
      'timeline.cues.0.at',
      'invalid',
    ],
    [
      'a written response',
      video({
        items: [...video().items, wr],
        timeline: { ...timeline, cues: [...timeline.cues, { id: 'w', at: 300, itemIds: ['wr'] }] },
      }),
      'ig_timeline_item_type',
      'items.6.type',
      'invalid',
    ],
    [
      'a shuffled video',
      video({ shuffle: 'within-group' }),
      'ig_timeline_shuffle',
      'shuffle',
      'invalid',
    ],
    [
      'an audio stimulus',
      video({
        stimulus: {
          id: 'v',
          kind: 'audio',
          media: { type: 'audio', url: 'https://m.example/a.mp3' },
        },
      }),
      'ig_timeline_stimulus_kind',
      'stimulus.kind',
      'invalid',
    ],
    [
      'a chapter without a title',
      video({ timeline: { ...timeline, chapters: [{ at: 0, title: '  ' }] } }),
      'ig_timeline_chapter_title',
      'timeline.chapters.0.title',
      'incomplete',
    ],
  ])('names %s', (_label, draft, code, path, severity) => {
    const result = validateItemGroupDraft(draft);
    const found = result.issues.filter((issue) => issue.code === code);
    expect(found).toHaveLength(1);
    expect(found[0]?.path.join('.')).toBe(path);
    expect(found[0]?.severity).toBe(severity);
    // One issue per mistake: nothing else is reported at the same path.
    expect(result.issues.filter((issue) => issue.path.join('.') === path)).toHaveLength(1);
  });
});
