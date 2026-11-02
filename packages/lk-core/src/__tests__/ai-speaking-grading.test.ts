import { describe, expect, it } from 'vitest';
import { aiSpeakingGradingRequest, checkAiGrading } from '../ai-grading.js';
import { gradeSpeakingResponse } from '../scoring/index.js';
import type {
  LearnerResponse,
  SpeakingResponseData,
  WrittenResponseData,
} from '../types/activity.js';
import type { AiSpeakingGradingRequest } from '../types/ai.js';
import type { SpeechAssessment } from '../types/speech.js';

/**
 * A model's grade of a spoken answer: the request built on the server from the
 * item and the take's evidence, and the reply read by the check that reads a
 * written response's — held to the criteria the judge scores, and to the
 * transcript every correction quotes.
 */

const TRANSCRIPT = 'um I think the city is uh more better for young people';
const KEY = 'answer-1';

const item = (over: Partial<SpeakingResponseData> = {}): SpeakingResponseData => ({
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sr-city',
  title: 'City or country',
  instructions: 'Answer in about a minute.',
  prompt: 'Would you rather live in a city or in the country? Say why.',
  locale: 'en-US',
  media: { type: 'image', url: 'https://example.com/street.png', alt: 'A busy street' },
  recording: { maxSeconds: 60 },
  languageTarget: 'en-B1',
  rubric: {
    criteria: [
      {
        name: 'Content',
        weight: 2,
        description: 'Gives a reason.',
        levels: [{ label: 'Not met' }, { label: 'Partly met' }, { label: 'Met' }],
      },
      { name: 'Language', weight: 1 },
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
      { name: 'Fluency', weight: 1, measure: 'fluency' },
    ],
  },
  ...over,
});

const answered = (key = KEY): LearnerResponse => ({
  type: 'speaking-response',
  recording: { key, mimeType: 'audio/wav' },
});

const evidence = (over: Partial<SpeechAssessment> = {}): SpeechAssessment => ({
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'unscripted',
  locale: 'en-US',
  recordingKey: KEY,
  assessor: { kind: 'auto', id: 'pronunciation-engine' },
  scale: 100,
  scores: { accuracy: 90, fluency: 60 },
  transcript: { text: TRANSCRIPT, source: { kind: 'auto', id: 'transcriber' } },
  miscue: 'assessor',
  words: TRANSCRIPT.split(' ').map((text) => ({ text, error: 'none' as const, accuracy: 90 })),
  ...over,
});

function requestFor(
  over: Partial<Parameters<typeof aiSpeakingGradingRequest>[0]> = {},
): AiSpeakingGradingRequest {
  const built = aiSpeakingGradingRequest({
    data: item(),
    response: answered(),
    assessment: evidence(),
    ...over,
  });
  if (!built.ok) {
    throw new Error(`no request: ${built.problem}`);
  }
  return built.request;
}

const problemOf = (over: Partial<Parameters<typeof aiSpeakingGradingRequest>[0]>) => {
  const built = aiSpeakingGradingRequest({
    data: item(),
    response: answered(),
    assessment: evidence(),
    ...over,
  });
  return built.ok ? 'built' : built.problem;
};

describe('aiSpeakingGradingRequest', () => {
  it('gives the model the task, the transcript verbatim, and the criteria it scores', () => {
    const request = requestFor({ learnerLocale: 'es-MX' });

    expect(request).toEqual({
      feature: 'speaking-grading',
      facts: {
        activityType: 'speaking-response',
        activityId: 'sr-city',
        title: 'City or country',
        locale: 'en-US',
        instructions: 'Answer in about a minute.',
        prompt: 'Would you rather live in a city or in the country? Say why.',
        media: { type: 'image', alt: 'A busy street' },
        text: TRANSCRIPT,
        wordCount: 12,
        rubric: [
          {
            name: 'Content',
            description: 'Gives a reason.',
            weight: 2,
            levels: [{ label: 'Not met' }, { label: 'Partly met' }, { label: 'Met' }],
          },
          { name: 'Language', weight: 1, levels: null },
        ],
        measured: [
          { name: 'Pronunciation', measure: 'pronunciation', weight: 1, score: 90 },
          { name: 'Fluency', measure: 'fluency', weight: 1, score: 60 },
        ],
        languageTarget: 'en-B1',
      },
      learnerLocale: 'es-MX',
    });
  });

  it('leaves out what the item does not have, and a score the engine did not give', () => {
    const { instructions: _i, media: _m, languageTarget: _l, ...bare } = item();
    const request = requestFor({
      data: { ...bare, prompt: 7 } as unknown as SpeakingResponseData,
      assessment: evidence({ scores: { accuracy: 90 } }),
    });

    expect(request.facts).not.toHaveProperty('instructions');
    expect(request.facts).not.toHaveProperty('media');
    expect(request.facts).not.toHaveProperty('languageTarget');
    expect(request.facts.prompt).toBe('');
    expect(request.facts.measured[1]).toEqual({ name: 'Fluency', measure: 'fluency', weight: 1 });
    expect(request).not.toHaveProperty('material');
    expect(request).not.toHaveProperty('learnerLocale');

    const unlabelled = requestFor({
      data: item({ media: { type: 'image', url: 'https://example.com/a.png' } as never }),
    });
    expect(unlabelled.facts.media).toEqual({ type: 'image' });
  });

  it('asks the judge for the measured criteria too with judgeMeasures, naming each measure', () => {
    const request = requestFor({ judgeMeasures: true });

    expect(request.facts.rubric.map((one) => [one.name, one.measure])).toEqual([
      ['Content', undefined],
      ['Language', undefined],
      ['Pronunciation', 'pronunciation'],
      ['Fluency', 'fluency'],
    ]);
    expect(request.facts.measured).toEqual([]);
  });

  it('carries the material of the group the task sits in', () => {
    const request = requestFor({
      group: { stimulus: { kind: 'text', text: 'Cities are growing.' } } as never,
    });

    expect(request.material).toBeDefined();
  });

  it.each([
    ['not-speaking-response', { data: { ...item(), type: 'read-aloud' } as never }],
    ['redacted', { data: { ...item(), redacted: true } as never }],
    ['no-rubric', { data: item({ rubric: { criteria: [] } }) }],
    [
      'no-rubric',
      {
        data: item({
          rubric: { criteria: [{ name: 'Content', weight: 1, measure: 'grammar' as never }] },
        }),
      },
    ],
    [
      'duplicate-criteria',
      {
        data: item({
          rubric: {
            criteria: [
              { name: 'Content', weight: 1 },
              { name: 'content ', weight: 1 },
            ],
          },
        }),
      },
    ],
    [
      'unreadable-levels',
      {
        data: item({
          rubric: { criteria: [{ name: 'Content', weight: 1, levels: [{ label: 'Only' }] }] },
        }),
      },
    ],
    [
      'nothing-to-judge',
      {
        data: item({
          rubric: { criteria: [{ name: 'Fluency', weight: 1, measure: 'fluency' }] },
        }),
      },
    ],
    ['empty-response', { response: { type: 'speaking-response', recording: null } as never }],
    ['empty-response', { response: null }],
    [
      'empty-response',
      { response: { type: 'written-response', text: 'x', wordCount: 1 } as never },
    ],
    ['empty-response', { assessment: evidence({ status: 'no_speech' }) }],
    ['invalid-assessment', { assessment: null }],
    ['invalid-assessment', { assessment: evidence({ scale: 50 as never }) }],
    ['evidence-mismatch', { assessment: evidence({ task: 'scripted', referenceText: 'x' }) }],
    ['evidence-mismatch', { assessment: evidence({ locale: 'en-GB' }) }],
    ['evidence-mismatch', { response: answered('answer-2') }],
    ['no-transcript', { assessment: (({ transcript: _t, ...rest }) => rest)(evidence()) }],
  ] as const)('builds no request: %s', (problem, over) => {
    expect(problemOf(over as Partial<Parameters<typeof aiSpeakingGradingRequest>[0]>)).toBe(
      problem,
    );
  });

  it('names the criterion whose measure is not one of the engine’s', () => {
    const built = aiSpeakingGradingRequest({
      data: item({
        rubric: {
          criteria: [
            { name: 'Content', weight: 1 },
            { name: 'Grammar', weight: 1, measure: 'grammar' as never },
          ],
        },
      }),
      response: answered(),
      assessment: evidence(),
    });

    expect(built).toEqual({
      ok: false,
      problem: 'no-rubric',
      path: ['rubric', 'criteria', 1, 'measure'],
    });
  });
});

describe('checkAiGrading on a spoken answer', () => {
  const reply = (over: Record<string, unknown> = {}) => ({
    criteria: [
      { name: 'Content', level: 'Met' },
      { name: 'Language', score: 0.5 },
    ],
    feedback: 'You gave a reason.',
    corrections: [{ original: 'more better', corrected: 'better' }],
    requiresHumanReview: false,
    provenance: { model: 'grader-1', promptHash: 'p1' },
    ...over,
  });

  it('holds the reply to the criteria the judge scores and to the transcript', () => {
    const request = requestFor();
    const checked = checkAiGrading(reply(), request);

    expect(checked.ok).toBe(true);
    const misquoted = checkAiGrading(
      reply({ corrections: [{ original: 'much better', corrected: 'better' }] }),
      request,
    );
    expect(misquoted).toEqual({ ok: false, refusal: 'misquotes-answer' });
    const scoredAMeasure = checkAiGrading(
      reply({
        criteria: [
          { name: 'Content', level: 'Met' },
          { name: 'Language', score: 0.5 },
          { name: 'Fluency', score: 0.5 },
        ],
      }),
      request,
    );
    expect(scoredAMeasure).toEqual({ ok: false, refusal: 'misses-criteria' });
  });

  it('is graded by gradeSpeakingResponse with the engine’s measures', () => {
    const request = requestFor();
    const checked = checkAiGrading(reply(), request);
    if (!checked.ok) {
      throw new Error(checked.refusal);
    }

    const grade = gradeSpeakingResponse(
      item(),
      answered() as never,
      { assessment: evidence(), judgement: checked.judgement },
      {
        measured: { durationMs: 12000, voicedMs: 8000 },
        plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
      },
    );

    expect(grade).toMatchObject({
      score: (2 * 1 + 0.5 + 0.9 + 0.6) / 5,
      grader: { kind: 'ai', model: 'grader-1', promptHash: 'p1' },
      corrections: [{ original: 'more better', corrected: 'better' }],
    });
  });

  it('builds no request for a written response', () => {
    const written: WrittenResponseData = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'wr',
      title: 'Write',
      prompt: 'Write.',
      minWords: 1,
      maxWords: 10,
      rubric: { criteria: [{ name: 'Task', weight: 1 }] },
    };

    expect(
      aiSpeakingGradingRequest({ data: written, response: answered(), assessment: evidence() }),
    ).toEqual({ ok: false, problem: 'not-speaking-response' });
  });
});
