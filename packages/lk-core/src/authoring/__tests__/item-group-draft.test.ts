import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { DeferredScoringError, UnknownActivityTypeError } from '../../errors.js';
import { defineActivityType, registerActivityType } from '../../registry/index.js';
import { validateItemGroup } from '../../schemas/index.js';
import type { ActivityType, MultipleChoiceData } from '../../types/activity.js';
import { validateDraft } from '../index.js';
import { createItemGroupDraft, validateItemGroupDraft } from '../item-group.js';

const counter = () => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const question = (over: Record<string, unknown> = {}): MultipleChoiceData =>
  ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'q1',
    title: 'Comprehension',
    question: 'What did the writer do?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'Left', isCorrect: true },
      { id: 'b', text: 'Stayed', isCorrect: false },
    ],
    ...over,
  }) as MultipleChoiceData;

const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'g1',
  stimulus: { id: 's1', kind: 'text', body: 'Yesterday I left early.' },
  items: [question()],
  ...over,
});

describe('createItemGroupDraft', () => {
  it('starts incomplete — never invalid, never storable', () => {
    const draft = createItemGroupDraft({ newId: counter() });
    const result = validateItemGroupDraft(draft);
    // The failure this exists to prevent: a freshly added testlet reported as
    // an error, which disables a whole form and blanks its preview.
    expect(result.status).toBe('incomplete');
    expect(result.issues.every((found) => found.severity === 'incomplete')).toBe(true);
    expect(validateItemGroup(draft).success).toBe(false);
  });

  it('takes both ids from newId and invents none', () => {
    const draft = createItemGroupDraft({ newId: counter() });
    expect(draft.id).toBe('id-1');
    expect(draft.stimulus.id).toBe('id-2');
  });

  it('starts on the one kind that needs no uploaded file', () => {
    const draft = createItemGroupDraft({ newId: counter() });
    expect(draft.stimulus.kind).toBe('text');
    expect(draft.items).toEqual([]);
  });

  it('refuses an id generator that repeats itself', () => {
    expect(() => createItemGroupDraft({ newId: () => 'same' })).toThrow(/twice/);
    expect(() => createItemGroupDraft({ newId: () => '' })).toThrow(/non-empty/);
  });
});

describe('validateItemGroupDraft — the group itself', () => {
  it('accepts a finished testlet', () => {
    const result = validateItemGroupDraft(group());
    expect(result.status).toBe('complete');
    expect(result.issues).toEqual([]);
  });

  it('asks for questions before it asks for anything else to be fixed', () => {
    const result = validateItemGroupDraft(group({ items: [] }));
    expect(result.status).toBe('incomplete');
    expect(result.issues.map((found) => found.code)).toContain('ig_items_required');
  });

  it('reports a missing passage as unfinished, not wrong', () => {
    const result = validateItemGroupDraft(
      group({ stimulus: { id: 's1', kind: 'text', body: '   ' } }),
    );
    expect(result.status).toBe('incomplete');
    expect(result.issues.map((found) => found.code)).toContain('ig_stimulus_body_required');
  });

  it('reports media that does not fit the kind as wrong', () => {
    const result = validateItemGroupDraft(
      group({
        stimulus: {
          id: 's1',
          kind: 'image',
          media: { type: 'audio', url: '/a.mp3' },
        },
      }),
    );
    expect(result.status).toBe('invalid');
    const kind = result.issues.find((found) => found.code === 'ig_stimulus_media_kind');
    expect(kind?.message).toContain('cannot carry audio');
  });

  it('asks for the recording a listening group has not been given yet', () => {
    const result = validateItemGroupDraft(group({ stimulus: { id: 's1', kind: 'audio' } }));
    expect(result.status).toBe('incomplete');
    expect(result.issues.map((found) => found.code)).toContain('ig_stimulus_media_required');
  });

  it('reports the stimulus media under the codes media already uses', () => {
    const result = validateItemGroupDraft(
      group({
        stimulus: { id: 's1', kind: 'image', media: { type: 'image', url: '/x.png', alt: '' } },
      }),
    );
    expect(result.issues.map((found) => found.code)).toContain('media_alt_required');
    expect(result.issues.map((found) => found.path.join('.'))).toContain('stimulus.media.alt');
  });

  it('refuses a nested group', () => {
    const result = validateItemGroupDraft(group({ items: [group()] }));
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => found.code)).toContain('ig_item_nested_group');
  });

  it('refuses two questions sharing an id', () => {
    const result = validateItemGroupDraft(group({ items: [question(), question()] }));
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => found.code)).toContain('ig_item_id_duplicate');
  });

  it('leaves an items field that is not a list to the schema', () => {
    // A string where the array goes is the wrong KIND of value, not an empty
    // group: saying "add a question" would send an author to fix the wrong
    // thing, so no ig_ code claims it.
    const result = validateItemGroupDraft(group({ items: 'q1, q2' }));
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => found.code)).not.toContain('ig_items_required');
  });

  it('leaves an item type that is not a string to the schema', () => {
    const result = validateItemGroupDraft(
      group({ items: [{ schemaVersion: '1.0', type: 7, id: 'q1' }] }),
    );
    expect(result.status).toBe('invalid');
    const codes = result.issues.map((found) => found.code);
    expect(codes).not.toContain('ig_item_type_required');
    expect(codes).not.toContain('ig_item_type_unknown');
  });

  it('never throws on any shape, including one that is not an object', () => {
    for (const shape of [null, undefined, 42, 'group', [], { type: 'item-group' }]) {
      expect(['complete', 'incomplete', 'invalid']).toContain(validateItemGroupDraft(shape).status);
    }
  });
});

describe('validateItemGroupDraft — the items inside it', () => {
  it('reports an unfinished question with its own type’s codes, re-pathed', () => {
    const result = validateItemGroupDraft(group({ items: [question({ title: '' })] }));
    expect(result.status).toBe('incomplete');
    const found = result.issues.find((each) => each.code === 'title_required');
    // The whole point of recursing rather than re-implementing: the same code a
    // standalone question reports, under the path it occupies in the group.
    expect(found?.path).toEqual(['items', '0', 'title']);
  });

  it('is invalid when an item is invalid, even if the group is only unfinished', () => {
    const result = validateItemGroupDraft(
      group({
        items: [
          question({
            title: '',
            options: [
              { id: 'a', text: 'Left', isCorrect: true },
              { id: 'b', text: 'Stayed', isCorrect: true },
            ],
          }),
        ],
      }),
    );
    // `mc_single_mode_one_correct` is invalid; a blank title is incomplete.
    // One invalid item makes the whole group invalid.
    expect(result.status).toBe('invalid');
  });

  it('reports an unregistered item type instead of throwing', () => {
    // An author fixing a six-item group wants all six problems listed, not the
    // first one that blew up — the choice validateItemGroup already makes.
    const result = validateItemGroupDraft(
      group({ items: [{ schemaVersion: '1.0', type: 'matching', id: 'q1' }] }),
    );
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => found.code)).toContain('ig_item_type_unknown');
  });

  it('asks for a type nobody has chosen yet rather than calling it unknown', () => {
    const result = validateItemGroupDraft(
      group({ items: [{ schemaVersion: '1.0', type: '', id: 'q1' }] }),
    );
    expect(result.issues.map((found) => found.code)).toContain('ig_item_type_required');
    expect(result.issues.map((found) => found.code)).not.toContain('ig_item_type_unknown');
  });

  it('lists every item’s problems, not just the first item’s', () => {
    const result = validateItemGroupDraft(
      group({
        items: [question({ id: 'q1', title: '' }), question({ id: 'q2', question: '' })],
      }),
    );
    const paths = result.issues.map((found) => found.path.join('.'));
    expect(paths).toContain('items.0.title');
    expect(paths).toContain('items.1.question');
  });

  it('is complete only when every item is complete too', () => {
    const nearly = group({ items: [question(), question({ id: 'q2', title: '' })] });
    expect(validateItemGroupDraft(nearly).status).toBe('incomplete');
    expect(
      validateItemGroupDraft(group({ items: [question(), question({ id: 'q2' })] })).status,
    ).toBe('complete');
  });
});

/**
 * A group turns exactly one error into an issue: the one `validateDraft` throws
 * for a type nobody registered. Whatever a REGISTERED type's own code throws is
 * a fault in that code, and reporting it as an unknown type sent an author after
 * a mistake the draft did not have.
 */
describe('validateItemGroupDraft — an item type whose own code throws', () => {
  interface ProbeData {
    type: string;
    id: string;
  }
  const probeSchema = (type: string) =>
    z.looseObject({ type: z.literal(type), id: z.string().min(1) });
  const probe = (type: string): Record<string, unknown> => ({
    schemaVersion: '1.0',
    type,
    id: 'q1',
  });

  /** What `run` threw, so a test can check it is the very error it planted. */
  const thrownBy = (run: () => unknown): unknown => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error('Expected the call to throw, but it returned.');
  };

  it('rethrows what a registered type’s checkDraft throws, as validateDraft does', () => {
    const failure = new SyntaxError('Invalid regular expression: regular expression too large');
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'ig-probe-check-throws',
        schema: probeSchema('ig-probe-check-throws') as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: () => {
            throw failure;
          },
        },
      }),
    );
    const item = probe('ig-probe-check-throws');
    expect(thrownBy(() => validateDraft('ig-probe-check-throws' as ActivityType, item))).toBe(
      failure,
    );
    expect(thrownBy(() => validateItemGroupDraft(group({ items: [item] })))).toBe(failure);
  });

  it('rethrows what a registered type’s schema throws, as validateItemGroup does', () => {
    const failure = new RangeError('The schema gave up.');
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'ig-probe-schema-throws',
        schema: probeSchema('ig-probe-schema-throws').refine(() => {
          throw failure;
        }) as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
      }),
    );
    const item = probe('ig-probe-schema-throws');
    const finished = group({ items: [item] });
    expect(thrownBy(() => validateItemGroup(finished))).toBe(failure);
    expect(thrownBy(() => validateItemGroupDraft(finished))).toBe(failure);

    // A container that is not finished stops validateItemGroup before any item
    // schema runs, so here the draft check alone decides what the author sees.
    const unfinished = group({ stimulus: undefined, items: [item] });
    expect(validateItemGroup(unfinished).success).toBe(false);
    expect(thrownBy(() => validateItemGroupDraft(unfinished))).toBe(failure);
  });

  it('does not pin an unknown-type error for some other type on the item', () => {
    // A type that checks a part of itself as another type, one nobody
    // registered: the error names that other type, and this item's type is fine.
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'ig-probe-check-delegates',
        schema: probeSchema('ig-probe-check-delegates') as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: (draft) =>
            validateDraft('ig-probe-never-registered' as ActivityType, draft).issues,
        },
      }),
    );
    const thrown = thrownBy(() =>
      validateItemGroupDraft(group({ items: [probe('ig-probe-check-delegates')] })),
    );
    expect(thrown).toBeInstanceOf(UnknownActivityTypeError);
    expect((thrown as UnknownActivityTypeError).activityType).toBe('ig-probe-never-registered');
  });

  it('rethrows another SDK error that names the item’s own type', () => {
    // UnknownActivityTypeError is not the only error that carries an
    // `activityType`: a check that scores a sample answer against its own
    // deferred type gets a DeferredScoringError naming this item's type, and the
    // type is registered all the same. The class decides, not the name.
    const failure = new DeferredScoringError('ig-probe-check-scores');
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'ig-probe-check-scores',
        schema: probeSchema('ig-probe-check-scores') as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: () => {
            throw failure;
          },
        },
      }),
    );
    expect(
      thrownBy(() => validateItemGroupDraft(group({ items: [probe('ig-probe-check-scores')] }))),
    ).toBe(failure);
  });

  it('still reports an unregistered type at its own path, and goes on to the next item', () => {
    const result = validateItemGroupDraft(
      group({ items: [probe('ig-probe-never-registered'), question({ id: 'q2', title: '' })] }),
    );
    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual([
      {
        code: 'ig_item_type_unknown',
        severity: 'invalid',
        path: ['items', '0', 'type'],
        message: '"ig-probe-never-registered" is not a registered activity type.',
      },
      expect.objectContaining({ code: 'title_required', path: ['items', '1', 'title'] }),
    ]);
  });
});
