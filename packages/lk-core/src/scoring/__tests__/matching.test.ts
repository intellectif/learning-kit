import { describe, expect, it } from 'vitest';
import { assertRedacted, redact } from '../../redact.js';
import { getActivityTypeDescriptor } from '../../registry/index.js';
import { validateActivity } from '../../schemas/index.js';
import type { MatchingData, MatchingLearnerResponse } from '../../types/activity.js';
import { xapiDefinitionFor } from '../../xapi/index.js';
import { evaluate, score } from '../index.js';

/** IELTS matching headings: four headings for three paragraphs, each used once. */
const headings: MatchingData = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'mt1',
  title: 'The return of the tram',
  instructions: 'Choose the correct heading for each paragraph.',
  optionsTitle: 'List of Headings',
  options: [
    { id: 'i', label: 'i', text: 'A costly experiment' },
    { id: 'ii', label: 'ii', text: 'Why the trams disappeared' },
    { id: 'iii', label: 'iii', text: 'A return nobody expected' },
    { id: 'iv', label: 'iv', text: 'The view from the passengers' },
  ],
  prompts: [
    { id: 'pA', text: 'Paragraph A', correctOptionId: 'ii' },
    { id: 'pB', text: 'Paragraph B', correctOptionId: 'iii', feedback: 'The 1990s.' },
    { id: 'pC', text: 'Paragraph C', correctOptionId: 'i' },
  ],
  optionUse: 'once',
  scoringStrategy: 'partial',
};

const respond = (matches: Record<string, string>): MatchingLearnerResponse => ({
  type: 'matching',
  matches,
});

const errorsOf = (data: unknown): string[] => {
  const result = validateActivity('matching', data);
  return result.success ? [] : result.errors.map((error) => error.message);
};

describe('matching — schema guards', () => {
  it('accepts a well-formed activity', () => {
    expect(errorsOf(headings)).toEqual([]);
  });

  it('accepts options without labels, and an option that answers several prompts by default', () => {
    const { optionUse: _once, ...rest } = headings;
    const features: MatchingData = {
      ...rest,
      options: [
        { id: 'a', text: 'Anna' },
        { id: 'b', text: 'Ben' },
      ],
      prompts: [
        { id: 'q1', text: 'prefers the tram', correctOptionId: 'a' },
        { id: 'q2', text: 'drives to work', correctOptionId: 'a' },
      ],
    };
    expect(errorsOf(features)).toEqual([]);
    expect(errorsOf({ ...features, optionUse: 'many' })).toEqual([]);
  });

  it('refuses duplicate prompt ids', () => {
    const prompts = [headings.prompts[0], { ...headings.prompts[1], id: 'pA' }];
    expect(errorsOf({ ...headings, prompts })).toContain('Prompt ids must be unique.');
  });

  it('refuses duplicate option ids', () => {
    const options = [...headings.options, { id: 'i', text: 'Another' }];
    expect(errorsOf({ ...headings, options })).toContain('Option ids must be unique.');
  });

  it('refuses two options with one label, ignoring case and space', () => {
    const options = [...headings.options, { id: 'v', label: ' I ', text: 'Another' }];
    expect(errorsOf({ ...headings, options })).toContain('Option labels must be unique.');
  });

  it('refuses an answer key that names no option', () => {
    const prompts = [{ ...headings.prompts[0], correctOptionId: 'nobody' }];
    expect(errorsOf({ ...headings, prompts })).toContain(
      'Each prompt needs a `correctOptionId` that is one of the options.',
    );
  });

  it('refuses one option answering two prompts when each is used once', () => {
    const prompts = headings.prompts.map((prompt) => ({ ...prompt, correctOptionId: 'ii' }));
    expect(errorsOf({ ...headings, prompts })).toContain(
      'With `optionUse: "once"`, no option may be the answer to more than one prompt.',
    );
    expect(errorsOf({ ...headings, prompts, optionUse: 'many' })).toEqual([]);
  });

  it('refuses fewer than two options, no prompts, an unknown optionUse and an empty label', () => {
    expect(errorsOf({ ...headings, options: [headings.options[0]] })).not.toEqual([]);
    expect(errorsOf({ ...headings, prompts: [] })).not.toEqual([]);
    expect(errorsOf({ ...headings, optionUse: 'twice' })).not.toEqual([]);
    const options = [{ ...headings.options[0], label: '' }, ...headings.options.slice(1)];
    expect(errorsOf({ ...headings, options })).not.toEqual([]);
  });
});

describe('matching — scoring', () => {
  it('scores each prompt by the option matched with it', () => {
    const result = score('matching', headings, respond({ pA: 'ii', pB: 'iv', pC: 'i' }));
    expect(result.score).toBeCloseTo(2 / 3);
    expect(result.details.map((detail) => [detail.itemId, detail.outcome])).toEqual([
      ['pA', 'correct'],
      ['pB', 'incorrect'],
      ['pC', 'correct'],
    ]);
    expect(result.details[1]).toMatchObject({ learnerResponse: ['iv'], correctResponse: ['iii'] });
  });

  it('reports an unanswered prompt, an empty one and a smuggled option as omissions', () => {
    const result = score(
      'matching',
      headings,
      respond({ pB: '', pC: 'smuggled', extra: 'i' } as Record<string, string>),
    );
    expect(result.score).toBe(0);
    expect(result.details.map((detail) => detail.outcome)).toEqual([
      'incorrect-omission',
      'incorrect-omission',
      'incorrect-omission',
    ]);
  });

  it('reads a non-string match as no answer', () => {
    const result = score('matching', headings, respond({ pA: 7 as unknown as string }));
    expect(result.details[0]?.outcome).toBe('incorrect-omission');
    expect(result.details[0]?.learnerResponse).toEqual(['']);
  });

  it('gives all-or-nothing full marks only for every prompt right', () => {
    const strict = { ...headings, scoringStrategy: 'all-or-nothing' as const };
    expect(score('matching', strict, respond({ pA: 'ii', pB: 'iii', pC: 'i' })).score).toBe(1);
    expect(score('matching', strict, respond({ pA: 'ii', pB: 'iii', pC: 'iv' })).score).toBe(0);
  });

  it('scores a repeated option prompt by prompt', () => {
    const result = score('matching', headings, respond({ pA: 'ii', pB: 'ii', pC: 'i' }));
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it('evaluates to a scored outcome that passes at the threshold', () => {
    const outcome = evaluate(headings, respond({ pA: 'ii', pB: 'iii', pC: 'i' }));
    expect(outcome).toMatchObject({ status: 'scored', score: 1, passed: true });
  });

  it('counts a response as answered when any prompt holds an option', () => {
    const descriptor = getActivityTypeDescriptor('matching');
    expect(descriptor?.isAnswered?.(respond({ pA: '' }) as never)).toBe(false);
    expect(descriptor?.isAnswered?.(respond({ pA: '', pB: 'i' }) as never)).toBe(true);
    expect(descriptor?.isAnswered?.(undefined as never)).toBe(false);
  });
});

describe('matching — redaction and interop', () => {
  it('keeps the list and the prompts, and withholds the key', () => {
    const projected = redact(headings, { reveal: 'none' });
    expect(() => assertRedacted(projected)).not.toThrow();
    expect(projected).toEqual({
      redacted: true,
      schemaVersion: '1.0',
      type: 'matching',
      id: 'mt1',
      title: 'The return of the tram',
      instructions: 'Choose the correct heading for each paragraph.',
      optionsTitle: 'List of Headings',
      options: headings.options,
      prompts: headings.prompts.map(({ id, text }) => ({ id, text })),
      optionUse: 'once',
    });
  });

  it('refuses a projection that still names an answer', () => {
    const leaked = { ...redact(headings, { reveal: 'none' }), prompts: headings.prompts };
    expect(() => assertRedacted(leaked)).toThrow();
  });

  it('publishes the xAPI matching pattern, one pair per prompt', () => {
    expect(xapiDefinitionFor(headings)).toMatchObject({
      interactionType: 'matching',
      correctResponsesPattern: ['pA[.]ii[,]pB[.]iii[,]pC[.]i'],
    });
  });
});
