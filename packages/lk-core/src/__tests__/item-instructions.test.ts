import { describe, expect, it } from 'vitest';
import { aiExplanationRequest, aiHintRequest } from '../ai.js';
import { aiDraftsRequest, checkAiDrafts } from '../ai-drafts.js';
import { validateDraft } from '../authoring/index.js';
import {
  assertRedacted,
  assertRedactedItemGroup,
  redact,
  redactItemGroup,
  withoutAuthorOnly,
} from '../redact.js';
import { validateActivity } from '../schemas/index.js';
import { contentJsonSchema, jsonSchemaFor } from '../schemas/json-schema.js';
import { score } from '../scoring/index.js';
import type { FillInTheBlanksData, GapSelectData, MultipleChoiceData } from '../types/activity.js';
import type { ItemGroup } from '../types/item-group.js';

/**
 * A question's own instructions: the task the learner reads before answering,
 * on an item served alone — an adaptive test's, or a bank shuffled across
 * forms — where no group could hold it. Learner-visible wherever the item
 * goes, read by every AI request about the item, and never part of a grade.
 */

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-greeting',
  title: 'Greetings',
  instructions: 'Choose the correct option to complete the conversation.',
  question: 'Leo: _____ are you today?\nNora: I’m fine, thanks.',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'how', text: 'How', isCorrect: true },
    { id: 'what', text: 'What', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-mei',
  title: 'Introductions',
  instructions: 'Complete the sentence. Use ONE word.',
  passage: 'Hi! I’m Mei, and I {{b1}} from Japan.',
  blanks: [{ id: 'b1', acceptedAnswers: ['am', '’m'] }],
  scoringStrategy: 'all-or-nothing',
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs-weather',
  title: 'The weather',
  instructions: 'Choose the word that completes the sentence.',
  passage: 'It is {{g1}} today, so take an umbrella.',
  gaps: [
    {
      id: 'g1',
      choices: [
        { id: 'rainy', text: 'rainy' },
        { id: 'sunny', text: 'sunny' },
      ],
      correctChoiceId: 'rainy',
    },
  ],
  scoringStrategy: 'all-or-nothing',
};

const items = [mc, fib, gs] as const;

describe('validation', () => {
  it.each(items)('accepts a $type item with instructions, and returns them', (item) => {
    const result = validateActivity(item.type, item);
    expect(result.success).toBe(true);
    expect(result.success && result.data.instructions).toBe(item.instructions);
  });

  it.each([fib, gs])(
    'refuses a placeholder in the instructions of a $type item, at `instructions`',
    (item) => {
      const result = validateActivity(item.type, {
        ...item,
        instructions: 'Write one word in {{ g1 }}.',
      });
      expect(result.success).toBe(false);
      expect(!result.success && result.errors).toEqual([
        expect.objectContaining({ path: ['instructions'], code: 'custom' }),
      ]);
      expect(!result.success && result.errors[0]?.message).toContain('{{id}}');
    },
  );

  it('reports a placeholder in the instructions beside the passage’s own errors', () => {
    const result = validateActivity('fill-in-the-blanks', {
      ...fib,
      instructions: 'Use {{b1}}.',
      title: '',
    });
    expect(!result.success && result.errors.map((error) => error.path.join('.')).sort()).toEqual([
      'instructions',
      'title',
    ]);
  });

  it('takes a multiple-choice instruction as plain text, braces and all', () => {
    expect(
      validateActivity('multiple-choice', { ...mc, instructions: 'Fill {{this}}.' }).success,
    ).toBe(true);
  });

  it.each(items)('refuses instructions that are not text on a $type item', (item) => {
    const result = validateActivity(item.type, { ...item, instructions: 42 });
    expect(!result.success && result.errors).toEqual([
      expect.objectContaining({ path: ['instructions'], code: 'invalid_type' }),
    ]);
  });

  it('refuses a placeholder in a drafted item’s instructions, at the same path', () => {
    const drafted = validateDraft('fill-in-the-blanks', { ...fib, instructions: 'Use {{b1}}.' });
    expect(drafted.status).toBe('invalid');
    expect(drafted.issues.map((issue) => issue.path)).toContainEqual(['instructions']);
  });
});

describe('the learner sees them', () => {
  it.each(items)(
    'redact() keeps the instructions of a $type item at every reveal level',
    (item) => {
      for (const reveal of ['none', 'after-submit'] as const) {
        expect(redact(item, { reveal }).instructions).toBe(item.instructions);
      }
      // The learner-safe shape, before submit, accepts them.
      expect(() => assertRedacted(redact(item))).not.toThrow();
    },
  );

  it.each(items)('withoutAuthorOnly() keeps them on a $type item', (item) => {
    expect(withoutAuthorOnly(item).instructions).toBe(item.instructions);
  });

  it('keeps them on a question inside a redacted group', () => {
    const group: ItemGroup = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'part-1',
      title: 'Part 1',
      stimulus: { id: 'part-1-text', kind: 'text', body: 'Read the conversation.' },
      items: [mc, fib],
    };
    const redacted = redactItemGroup(group);
    expect(() => assertRedactedItemGroup(redacted)).not.toThrow();
    expect(redacted.items.map((item) => (item as { instructions?: string }).instructions)).toEqual([
      mc.instructions,
      fib.instructions,
    ]);
  });
});

describe('AI help reads them', () => {
  it('puts them in the facts of an ungrouped question, for a hint and an explanation', () => {
    const hint = aiHintRequest({
      data: fib,
      response: { type: 'fill-in-the-blanks', answers: {} },
      previousHints: [],
    });
    expect(hint?.facts).toMatchObject({ instructions: fib.instructions });
    expect(hint).not.toHaveProperty('material');

    const explanation = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['what'] },
    });
    expect(explanation?.facts).toMatchObject({ instructions: mc.instructions });

    const gapHint = aiHintRequest({
      data: gs,
      response: { type: 'gap-select', selections: {} },
      previousHints: [],
    });
    expect(gapHint?.facts).toMatchObject({ instructions: gs.instructions });
  });

  it('gives a grouped question both: its group’s material and its own instructions', () => {
    const request = aiHintRequest({
      data: fib,
      response: { type: 'fill-in-the-blanks', answers: {} },
      previousHints: [],
      group: {
        title: 'Part 2 — Introductions',
        stimulus: { id: 's', kind: 'text', body: 'Read about four students.' },
      },
    });
    expect(request?.material).toMatchObject({ text: 'Read about four students.' });
    expect(request?.facts).toMatchObject({ instructions: fib.instructions });
  });

  it('trims them, and leaves blank ones out, as a learner never sees those', () => {
    const facts = (instructions: string) => {
      const data: FillInTheBlanksData = { ...fib, instructions };
      return aiHintRequest({
        data,
        response: { type: 'fill-in-the-blanks', answers: {} },
        previousHints: [],
      })?.facts;
    };
    expect(facts('  Use ONE word.\n')).toMatchObject({ instructions: 'Use ONE word.' });
    expect(facts(' \n ')).not.toHaveProperty('instructions');
    expect(facts('')).not.toHaveProperty('instructions');
  });

  it('carries them on a redacted question too: they are what the learner read', () => {
    const request = aiExplanationRequest({
      data: redact(mc) as never,
      response: { type: 'multiple-choice', selectedOptionIds: ['what'] },
      outcome: {
        status: 'scored',
        score: 0,
        maxScore: 1,
        passed: false,
        details: [],
      } as never,
    });
    expect(request?.facts).toMatchObject({ instructions: mc.instructions });
  });
});

describe('drafts', () => {
  const request = () => {
    const built = aiDraftsRequest({
      types: ['multiple-choice', 'fill-in-the-blanks', 'gap-select'],
      source: { kind: 'passage', text: 'Mei is from Japan. She is a student in Leeds.' },
    });
    if (built === null) {
      throw new Error('no request');
    }
    return built;
  };

  it('lets a model write instructions for each of the three types', () => {
    const { shape } = request();
    const item = (shape as { properties: { drafts: { items: Record<string, unknown> } } })
      .properties.drafts.items as { properties: Record<string, unknown>; required: string[] };
    expect(item.properties).toHaveProperty('instructions');
    expect(item.required).not.toContain('instructions');
    const typeField = item.properties.type as { description: string };
    expect(typeField.description).toContain('multiple-choice: instructions, question');
    expect(typeField.description).toContain('fill-in-the-blanks: instructions, passage');
    expect(typeField.description).toContain('gap-select: instructions, passage');
  });

  it('keeps the instructions a model wrote on each type, and drops blank ones', () => {
    const asked = request();
    let next = 0;
    const checked = checkAiDrafts(
      {
        drafts: [
          {
            type: 'fill-in-the-blanks',
            title: 'Mei',
            instructions: 'Complete the sentence. Use ONE word.',
            passage: 'Mei {{1}} from Japan.',
            blanks: [{ acceptedAnswers: ['is'] }],
          },
          {
            type: 'multiple-choice',
            title: 'Leeds',
            instructions: 'Choose the correct answer.',
            question: 'Where does Mei study?',
            mode: 'single',
            options: [
              { text: 'Leeds', isCorrect: true },
              { text: 'Tokyo', isCorrect: false },
            ],
          },
          {
            type: 'gap-select',
            title: 'Student',
            instructions: '   ',
            passage: 'Mei {{1}} a student.',
            gaps: [
              {
                choices: [
                  { text: 'is', isCorrect: true },
                  { text: 'are', isCorrect: false },
                ],
              },
            ],
          },
        ],
      },
      asked,
      {
        newId: () => {
          next += 1;
          return `id-${next}`;
        },
      },
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) {
      return;
    }
    const of = (type: string) => checked.drafts.drafts.find((one) => one.type === type);
    expect(of('fill-in-the-blanks')?.draft.instructions).toBe(
      'Complete the sentence. Use ONE word.',
    );
    expect(of('multiple-choice')?.draft.instructions).toBe('Choose the correct answer.');
    expect(of('gap-select')?.draft).not.toHaveProperty('instructions');
    for (const one of checked.drafts.drafts) {
      expect(one.validation.status).toBe('complete');
    }
  });
});

describe('schemas', () => {
  it.each(items)('jsonSchemaFor describes the instructions of $type, in both drafts', (item) => {
    for (const target of ['draft-7', 'draft-2020-12'] as const) {
      const schema = jsonSchemaFor(item.type, { target }) as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties.instructions).toEqual({ type: 'string' });
      expect(schema.required).not.toContain('instructions');
    }
  });

  it('contentJsonSchema describes them on the three types', () => {
    const text = JSON.stringify(contentJsonSchema());
    for (const item of items) {
      expect(text).toContain(`"${item.type}"`);
    }
    const defs = (contentJsonSchema() as { $defs: Record<string, { properties?: object }> }).$defs;
    const described = Object.values(defs).filter(
      (def) => def.properties !== undefined && 'instructions' in def.properties,
    );
    // Read aloud's, and the three new ones.
    expect(described).toHaveLength(4);
  });
});

describe('grades', () => {
  it.each(items)('a $type item grades the same with or without instructions', (item) => {
    const response =
      item.type === 'multiple-choice'
        ? { type: 'multiple-choice' as const, selectedOptionIds: ['how'] }
        : item.type === 'fill-in-the-blanks'
          ? { type: 'fill-in-the-blanks' as const, answers: { b1: 'am' } }
          : { type: 'gap-select' as const, selections: { g1: 'rainy' } };
    const { instructions: _, ...without } = item;
    expect(score(item.type as never, item as never, response)).toEqual(
      score(item.type as never, without as never, response),
    );
  });
});
