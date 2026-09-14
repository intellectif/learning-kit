import { describe, expect, it } from 'vitest';
import { validateItemGroup } from '../../schemas/index.js';
import type { MultipleChoiceData } from '../../types/activity.js';
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
