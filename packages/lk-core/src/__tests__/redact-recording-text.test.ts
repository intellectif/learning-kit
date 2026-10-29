import { describe, expect, it } from 'vitest';
import { aiExplanationRequest, aiHintRequest } from '../ai.js';
import { aiCoachingRequest } from '../ai-coaching.js';
import { aiGradingRequest } from '../ai-grading.js';
import { materialFacts } from '../ai-material.js';
import { aiWritingFeedbackRequest } from '../ai-writing.js';
import { ActivitySchemaError } from '../errors.js';
import { assertRedacted, assertRedactedItemGroup, redact, redactItemGroup } from '../redact.js';
import { validateActivity } from '../schemas/index.js';
import { validateItemGroup } from '../schemas/item-group.js';
import {
  readAloudItem,
  speechAssessment,
  spoken,
} from '../scoring/__tests__/read-aloud-fixtures.js';

/**
 * A recording's `transcript` and `script` are author-only wherever they sit:
 * on an item's media, on a multiple-choice option's recording, and on a
 * group's stimulus or its media. What a listening question's recording says is
 * that question's answer, so no learner-facing payload may carry it — not the
 * redacted item, not a review's, and not a request built for a learner's AI
 * help. One sentence is planted in every such field, and searched for in each.
 */
const SECRET = 'platform four at nine fifteen';

const recording = (url: string) => ({
  type: 'audio' as const,
  url,
  transcript: `The train leaves from ${SECRET}.`,
  script: [
    { speaker: 'Guard', text: `It leaves from ${SECRET}.` },
    { speaker: 'Traveller', text: 'Thank you.' },
  ],
});

const mc = {
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id: 'mc-train',
  title: 'The train',
  question: 'Where does the train leave from?',
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  media: recording('/train.mp3'),
  options: [
    { id: 'a', text: 'Platform 4', isCorrect: true, media: recording('/a.mp3') },
    { id: 'b', text: 'Platform 9', isCorrect: false, media: recording('/b.mp3') },
  ],
};

const fib = {
  schemaVersion: '1.0' as const,
  type: 'fill-in-the-blanks' as const,
  id: 'fib-train',
  title: 'The train',
  passage: 'The train leaves from platform {{p}}.',
  scoringStrategy: 'partial' as const,
  blanks: [{ id: 'p', acceptedAnswers: ['four'] }],
  media: recording('/train.mp3'),
};

const gs = {
  schemaVersion: '1.0' as const,
  type: 'gap-select' as const,
  id: 'gs-train',
  title: 'The train',
  passage: 'It leaves {{t}} nine fifteen.',
  scoringStrategy: 'partial' as const,
  banks: [
    {
      id: 'p',
      choices: [
        { id: 'at', text: 'at' },
        { id: 'on', text: 'on' },
      ],
    },
  ],
  gaps: [{ id: 't', bankId: 'p', correctChoiceId: 'at' }],
  media: recording('/train.mp3'),
};

const wr = {
  schemaVersion: '1.0' as const,
  type: 'written-response' as const,
  id: 'wr-train',
  title: 'The announcement',
  prompt: 'Summarise the announcement.',
  minWords: 3,
  maxWords: 60,
  rubric: { criteria: [{ name: 'Content', weight: 1 }] },
  media: recording('/train.mp3'),
};

const dictation = {
  schemaVersion: '1.0' as const,
  type: 'dictation' as const,
  id: 'dc-train',
  title: 'Listen and type',
  transcript: 'The train is late.',
  media: recording('/late.mp3'),
};

const readAloud = readAloudItem({ media: recording('/model.mp3') });

const group = {
  schemaVersion: '1.0' as const,
  type: 'item-group' as const,
  id: 'part-1',
  title: 'Listening, part 1',
  stimulus: {
    id: 'st-1',
    kind: 'audio' as const,
    media: recording('/announcement.mp3'),
    transcript: `Attention, please: the train leaves from ${SECRET}.`,
    script: [{ speaker: 'Announcer', text: `The train leaves from ${SECRET}.` }],
  },
  items: [mc, fib],
};

const ITEMS = [mc, fib, gs, wr, dictation, readAloud] as const;

const carries = (value: unknown) => JSON.stringify(value).includes(SECRET);

function pathsRefused(assert: () => void): string[] {
  try {
    assert();
  } catch (error) {
    expect(error).toBeInstanceOf(ActivitySchemaError);
    return (error as ActivitySchemaError).errors.map((issue) => issue.path.join('.'));
  }
  throw new Error('expected a throw');
}

describe('a recording’s transcript and script are content', () => {
  it('validate on every type that has media, and on a stimulus', () => {
    for (const item of ITEMS) {
      expect(validateActivity(item.type, item).success, item.type).toBe(true);
    }
    expect(validateItemGroup(group).success).toBe(true);
  });

  it('refuse a script turn without a speaker or words, and keep a host’s own fields on a turn', () => {
    const turns = (script: unknown) =>
      validateActivity('dictation', {
        ...dictation,
        media: { type: 'audio', url: '/a.mp3', script },
      });
    expect(turns([{ speaker: ' ', text: 'Hi.' }]).success).toBe(false);
    expect(turns([{ speaker: 'Anna', text: '' }]).success).toBe(false);
    expect(turns([{ speakr: 'Anna', text: 'Hi.' }]).success).toBe(false);
    expect(turns([]).success).toBe(false);
    expect(turns([{ speaker: 'x'.repeat(61), text: 'Hi.' }]).success).toBe(false);
    const kept = turns([{ speaker: 'Anna', text: 'Hi.', voice: 'host-voice-7' }]);
    expect(kept.success && kept.data.media?.script?.[0]).toEqual({
      speaker: 'Anna',
      text: 'Hi.',
      voice: 'host-voice-7',
    });
  });
});

describe('redaction removes them everywhere', () => {
  it('from every item, at both reveal levels', () => {
    for (const item of ITEMS) {
      expect(carries(item), item.type).toBe(true);
      for (const reveal of ['none', 'after-submit'] as const) {
        const projected = redact(item, { reveal });
        expect(carries(projected), `${item.type} at ${reveal}`).toBe(false);
        expect(projected.media).toEqual({
          type: 'audio',
          url: (item.media as { url: string }).url,
        });
      }
    }
    const options = redact(mc, { reveal: 'after-submit' }).options as { media?: unknown }[];
    expect(options.map((option) => option.media)).toEqual([
      { type: 'audio', url: '/a.mp3' },
      { type: 'audio', url: '/b.mp3' },
    ]);
  });

  it('from a group: its stimulus, its stimulus’s media, and every item', () => {
    expect(carries(group)).toBe(true);
    const projected = redactItemGroup(group);
    expect(carries(projected)).toBe(false);
    expect(projected.stimulus).toEqual({
      id: 'st-1',
      kind: 'audio',
      media: { type: 'audio', url: '/announcement.mp3' },
    });
  });

  it('and a payload that still carries one is refused as unsafe', () => {
    const leaked = {
      ...redact(mc),
      media: { type: 'audio', url: '/train.mp3', transcript: SECRET },
    };
    expect(pathsRefused(() => assertRedacted(leaked))).toContain('media');
    const redactedMc = redact(mc);
    const optionScript = {
      ...redactedMc,
      options: (redactedMc.options as Record<string, unknown>[]).map((option) => ({
        ...option,
        media: { type: 'audio', url: '/a.mp3', script: [{ speaker: 'Guard', text: SECRET }] },
      })),
    };
    expect(() => assertRedacted(optionScript)).toThrow(ActivitySchemaError);
    const safe = redactItemGroup(group);
    expect(() =>
      assertRedactedItemGroup({
        ...safe,
        stimulus: { ...safe.stimulus, script: group.stimulus.script },
      }),
    ).toThrow(ActivitySchemaError);
    expect(() =>
      assertRedactedItemGroup({
        ...safe,
        stimulus: {
          ...safe.stimulus,
          media: { type: 'audio', url: '/announcement.mp3', transcript: SECRET },
        },
      }),
    ).toThrow(ActivitySchemaError);
  });
});

describe('no request for a learner’s AI help reads them', () => {
  it('explanations, hints, writing feedback, coaching, assisted grading and group material', () => {
    const requests: unknown[] = [
      aiExplanationRequest({
        data: mc,
        response: { type: 'multiple-choice', selectedOptionIds: ['b'] },
        group,
      }),
      aiHintRequest({ data: mc, response: null, previousHints: [], group }),
      aiHintRequest({
        data: fib,
        response: { type: 'fill-in-the-blanks', answers: { p: 'nine' } },
        previousHints: [],
      }),
      aiExplanationRequest({
        data: dictation,
        response: { type: 'dictation', text: 'the train is' },
      }),
      aiWritingFeedbackRequest({
        data: wr,
        response: { type: 'written-response', text: 'The train is late today.', wordCount: 5 },
        group,
      }),
      aiCoachingRequest({
        data: readAloud,
        assessment: speechAssessment({
          words: [
            spoken('the', { accuracy: 95 }),
            spoken('cat', { accuracy: 40, error: 'mispronunciation' }),
            spoken('sat', { accuracy: 92 }),
            spoken('on', { accuracy: 90 }),
            spoken('the', { accuracy: 94 }),
            spoken('mat', { accuracy: 90 }),
          ],
        }),
      }),
      materialFacts(group),
    ];
    const grading = aiGradingRequest({
      data: wr,
      response: { type: 'written-response', text: 'The train is late today.', wordCount: 5 },
      group,
    });
    expect(grading.ok).toBe(true);
    requests.push(grading.ok ? grading.request : null);
    requests.forEach((request, index) => {
      expect(request, `request ${index}`).not.toBeNull();
      expect(carries(request), `request ${index}`).toBe(false);
    });
  });
});
