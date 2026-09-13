import { describe, expect, it } from 'vitest';
import { redact } from '../../redact.js';
import { validateActivity } from '../../schemas/index.js';
import type { GapSelectData, GapSelectLearnerResponse } from '../../types/activity.js';
import { evaluate, score } from '../index.js';

/** The shape the Moodle "select missing words" question produces, as SDK content. */
const activity: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'Prepositions',
  passage: "Where are you {{a}}? I'm {{b}} Spain.",
  banks: [
    {
      id: 'prep',
      choices: [
        { id: 'of', text: 'of' },
        { id: 'from', text: 'from' },
        { id: 'to', text: 'to' },
        { id: 'on', text: 'on' },
      ],
    },
  ],
  gaps: [
    { id: 'a', bankId: 'prep', correctChoiceId: 'from' },
    { id: 'b', bankId: 'prep', correctChoiceId: 'from' },
  ],
  scoringStrategy: 'partial',
};

const respond = (selections: Record<string, string>): GapSelectLearnerResponse => ({
  type: 'gap-select',
  selections,
});

describe('gap-select — schema guards', () => {
  it('accepts a well-formed activity, banks and all', () => {
    expect(validateActivity('gap-select', activity).success).toBe(true);
  });

  it('accepts a gap carrying its own choices instead of a bank', () => {
    const { banks: _unused, ...withoutBanks } = activity;
    const own: GapSelectData = {
      ...withoutBanks,
      passage: 'The sky is {{a}}.',
      gaps: [
        {
          id: 'a',
          choices: [
            { id: 'blue', text: 'blue' },
            { id: 'green', text: 'green' },
          ],
          correctChoiceId: 'blue',
        },
      ],
    };
    expect(validateActivity('gap-select', own).success).toBe(true);
  });

  it.each([
    [
      'a gap with no choice source',
      { gaps: [{ id: 'a', correctChoiceId: 'from' }], passage: 'One {{a}}.' },
    ],
    [
      'a gap with both a bank and its own choices',
      {
        passage: 'One {{a}}.',
        gaps: [
          {
            id: 'a',
            bankId: 'prep',
            choices: [
              { id: 'of', text: 'of' },
              { id: 'to', text: 'to' },
            ],
            correctChoiceId: 'of',
          },
        ],
      },
    ],
    [
      'a bankId no bank defines',
      { passage: 'One {{a}}.', gaps: [{ id: 'a', bankId: 'nope', correctChoiceId: 'from' }] },
    ],
    [
      'an answer key naming a choice the gap does not offer',
      { passage: 'One {{a}}.', gaps: [{ id: 'a', bankId: 'prep', correctChoiceId: 'ghost' }] },
    ],
    [
      'two gaps sharing an id',
      {
        passage: 'One {{a}} two {{a}}.',
        gaps: [
          { id: 'a', bankId: 'prep', correctChoiceId: 'of' },
          { id: 'a', bankId: 'prep', correctChoiceId: 'to' },
        ],
      },
    ],
    [
      'a gap that is not in the passage',
      { passage: 'Only {{a}}.', gaps: [{ id: 'z', bankId: 'prep', correctChoiceId: 'of' }] },
    ],
    [
      'a placeholder with no gap',
      {
        passage: 'One {{a}} and {{ghost}}.',
        gaps: [{ id: 'a', bankId: 'prep', correctChoiceId: 'of' }],
      },
    ],
    [
      'the same placeholder twice',
      {
        passage: 'One {{a}} again {{a}}.',
        gaps: [{ id: 'a', bankId: 'prep', correctChoiceId: 'of' }],
      },
    ],
    [
      'two word banks sharing an id',
      {
        passage: 'One {{a}}.',
        gaps: [{ id: 'a', bankId: 'prep', correctChoiceId: 'of' }],
        banks: [
          {
            id: 'prep',
            choices: [
              { id: 'of', text: 'of' },
              { id: 'to', text: 'to' },
            ],
          },
          {
            id: 'prep',
            choices: [
              { id: 'on', text: 'on' },
              { id: 'at', text: 'at' },
            ],
          },
        ],
      },
    ],
    ['a presentation the SDK does not render', { presentation: 'drag' as unknown as 'dropdown' }],
  ])('rejects %s', (_name, patch) => {
    expect(validateActivity('gap-select', { ...activity, ...patch }).success).toBe(false);
  });

  it('preserves consumer sidecar fields, like every other loose schema', () => {
    const result = validateActivity('gap-select', { ...activity, houseId: 'abc' });
    expect(result.success && (result.data as unknown as Record<string, unknown>).houseId).toBe(
      'abc',
    );
  });
});

describe('gap-select — scoring', () => {
  it('scores every gap correct', () => {
    const result = score('gap-select', activity, respond({ a: 'from', b: 'from' }));
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.details?.map((detail) => detail.outcome)).toEqual(['correct', 'correct']);
  });

  it('gives partial credit per gap', () => {
    const result = score('gap-select', activity, respond({ a: 'from', b: 'to' }));
    expect(result.score).toBe(0.5);
  });

  it('gives all or nothing when that is the strategy', () => {
    const strict = { ...activity, scoringStrategy: 'all-or-nothing' as const };
    expect(score('gap-select', strict, respond({ a: 'from', b: 'to' })).score).toBe(0);
    expect(score('gap-select', strict, respond({ a: 'from', b: 'from' })).score).toBe(1);
  });

  it('tells an unanswered gap apart from a wrong one', () => {
    const result = score('gap-select', activity, respond({ a: 'to' }));
    const outcomes = result.details?.map((detail) => detail.outcome);
    // `a` was answered and wrong; `b` was never touched. Both score 0, and the
    // difference survives into the detail — which is the point of the blank
    // first entry in the selector.
    expect(outcomes).toEqual(['incorrect', 'incorrect-omission']);
    expect(result.score).toBe(0);
  });

  it('reads an empty string as unanswered, the way a placeholder <select> submits', () => {
    const result = score('gap-select', activity, respond({ a: '', b: 'from' }));
    expect(result.details?.[0]?.outcome).toBe('incorrect-omission');
    expect(result.score).toBe(0.5);
  });

  it('treats a selection the gap never offered as unanswered rather than wrong', () => {
    const result = score('gap-select', activity, respond({ a: 'smuggled', b: 'from' }));
    expect(result.details?.[0]?.outcome).toBe('incorrect-omission');
    expect(result.score).toBe(0.5);
  });

  it('scores a gap that carries its own choices, with no bank in sight', () => {
    // The other half of the choice-source rule. Every fixture above draws from
    // a shared bank, so without this the inline path was validated but never
    // actually marked.
    const { banks: _unused, ...withoutBanks } = activity;
    const inline: GapSelectData = {
      ...withoutBanks,
      passage: 'The sky is {{a}} and the grass is {{b}}.',
      gaps: [
        {
          id: 'a',
          choices: [
            { id: 'blue', text: 'blue' },
            { id: 'red', text: 'red' },
          ],
          correctChoiceId: 'blue',
        },
        {
          id: 'b',
          choices: [
            { id: 'green', text: 'green' },
            { id: 'purple', text: 'purple' },
          ],
          correctChoiceId: 'green',
        },
      ],
    };
    expect(score('gap-select', inline, respond({ a: 'blue', b: 'green' })).score).toBe(1);
    expect(score('gap-select', inline, respond({ a: 'blue', b: 'purple' })).score).toBe(0.5);
    // Each gap is scored against its OWN list: `green` answers b, not a.
    expect(score('gap-select', inline, respond({ a: 'green', b: 'green' })).score).toBe(0.5);
    expect(
      score('gap-select', inline, respond({ a: 'green', b: 'green' })).details?.[0]?.outcome,
    ).toBe('incorrect-omission');
  });

  it('scores nothing rather than throwing when a bank has gone missing', () => {
    const orphaned = { ...activity, banks: [] };
    const result = score('gap-select', orphaned, respond({ a: 'from', b: 'from' }));
    expect(result.score).toBe(0);
  });

  it('scores nothing rather than throwing when the banks array is gone entirely', () => {
    // Distinct from the empty-array case above: content edited after an attempt
    // can drop `banks` altogether while the gaps still name one. Marking must
    // still produce a paper — a grade of zero is defensible at an appeal, a
    // thrown scorer is not.
    const { banks: _unused, ...noBanks } = activity;
    const result = score('gap-select', noBanks as GapSelectData, respond({ a: 'from', b: 'from' }));
    expect(result.score).toBe(0);
    expect(result.details?.every((detail) => detail.outcome === 'incorrect-omission')).toBe(true);
  });

  it('never reports a choice id the learner could not have picked as the key', () => {
    const result = score('gap-select', activity, respond({ a: 'from', b: 'from' }));
    expect(result.details?.map((detail) => detail.correctResponse)).toEqual([['from'], ['from']]);
  });

  it('evaluates to a scored outcome', () => {
    const outcome = evaluate(activity, respond({ a: 'from', b: 'from' }));
    expect(outcome.status).toBe('scored');
  });
});

describe('gap-select — redaction', () => {
  it('keeps every choice and removes only the answer key', () => {
    const redacted = redact(activity) as Record<string, unknown>;
    const banks = redacted.banks as { choices: { id: string }[] }[];
    // The learner has to see all four prepositions, or the item is unanswerable.
    expect(banks[0]?.choices).toHaveLength(4);
    for (const gap of redacted.gaps as Record<string, unknown>[]) {
      expect(gap).not.toHaveProperty('correctChoiceId');
    }
    expect(redacted).not.toHaveProperty('scoringStrategy');
  });

  it('refuses to score a redacted projection instead of inventing a mark', () => {
    const redacted = redact(activity);
    const outcome = evaluate(redacted as never, respond({ a: 'from', b: 'from' }));
    expect(outcome.status).toBe('unscorable');
  });
});
