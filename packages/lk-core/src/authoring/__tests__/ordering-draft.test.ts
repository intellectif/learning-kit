import { describe, expect, it } from 'vitest';
import { createDraft, critiqueDraft, validateDraft } from '../index.js';

const complete = {
  schemaVersion: '1.0',
  type: 'ordering',
  id: 'or1',
  title: 'Making pasta',
  items: [
    { id: 'k7f', text: 'Fill a pot with water.' },
    { id: 'zq2', text: 'Bring it to the boil.' },
    { id: 'm4w', text: 'Add the pasta.' },
  ],
  scoringStrategy: 'partial',
};

const codesOf = (draft: unknown): [string, string, string][] =>
  validateDraft('ordering', draft).issues.map((found) => [
    found.code,
    found.severity,
    found.path.join('.'),
  ]);

const findingsOf = (draft: unknown): [string, string][] =>
  critiqueDraft('ordering', draft).map((found) => [found.code, found.path.join('.')]);

describe('ordering drafts', () => {
  it('starts incomplete, with two empty items whose ids come from newId', () => {
    const ids = ['id-1', 'id-2', 'id-3'];
    const draft = createDraft('ordering', { newId: () => ids.shift() as string });
    expect(draft).toEqual({
      schemaVersion: '1.0',
      type: 'ordering',
      id: 'id-1',
      title: '',
      items: [
        { id: 'id-2', text: '' },
        { id: 'id-3', text: '' },
      ],
      scoringStrategy: 'all-or-nothing',
    });
    expect(codesOf(draft)).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['or_item_text_required', 'incomplete', 'items.0.text'],
      ['or_item_text_required', 'incomplete', 'items.1.text'],
    ]);
  });

  it('is complete once every item is written', () => {
    expect(validateDraft('ordering', complete).status).toBe('complete');
  });

  it('asks for a second item, and refuses more than thirty', () => {
    expect(codesOf({ ...complete, items: complete.items.slice(0, 1) })).toEqual([
      ['or_items_required', 'incomplete', 'items'],
    ]);
    expect(codesOf({ ...complete, items: undefined })).toEqual([
      ['or_items_required', 'incomplete', 'items'],
    ]);
    const many = Array.from({ length: 31 }, (_, index) => ({ id: `i${index}`, text: `${index}` }));
    expect(codesOf({ ...complete, items: many })).toEqual([
      ['or_items_too_many', 'invalid', 'items'],
    ]);
  });

  it('reports each item at its own field', () => {
    expect(
      codesOf({
        ...complete,
        items: [
          { id: 'k7f', text: 'Fill a pot with water.' },
          { id: '', text: 'Bring it to the boil.' },
          { id: 'k7f', text: '  ' },
          { id: 'p9', text: 'Fill a pot  with water. ' },
        ],
      }),
    ).toEqual([
      ['or_item_id_required', 'invalid', 'items.1.id'],
      ['or_item_id_duplicate', 'invalid', 'items.2.id'],
      ['or_item_text_required', 'incomplete', 'items.2.text'],
      ['or_item_text_duplicate', 'invalid', 'items.3.text'],
    ]);
  });

  it('leaves an items value that is not a list, and an item that is not an object, to the schema', () => {
    expect(validateDraft('ordering', { ...complete, items: 'three' }).status).toBe('invalid');
    expect(
      validateDraft('ordering', { ...complete, items: [...complete.items, 'four'] }).status,
    ).toBe('invalid');
  });
});

describe('ordering critic', () => {
  it('finds nothing to say about a good item', () => {
    expect(findingsOf(complete)).toEqual([]);
  });

  it('warns when the ids count up in the right order', () => {
    for (const ids of [
      ['s1', 's2', 's10'],
      ['a', 'b', 'c'],
      ['step-1-x', 'step-2-x', 'step-3-x'],
      ['10', '11', '12'],
    ]) {
      const items = complete.items.map((item, index) => ({ ...item, id: ids[index] }));
      expect(findingsOf({ ...complete, items })).toEqual([['or_ids_reveal_order', 'items']]);
    }
    for (const ids of [
      ['s2', 's1', 's3'],
      ['c', 'b', 'a'],
      ['k7f', 'zq2', 'm4w'],
      ['a', 'ab', 'abc'],
    ]) {
      const items = complete.items.map((item, index) => ({ ...item, id: ids[index] }));
      expect(findingsOf({ ...complete, items })).toEqual([]);
    }
  });

  it('warns when the items are numbered, naming them', () => {
    const items = [
      { id: 'k7f', text: '1. Fill a pot with water.' },
      { id: 'zq2', text: 'Bring it to the boil.' },
      { id: 'm4w', text: '(c) Add the pasta.' },
    ];
    const found = critiqueDraft('ordering', { ...complete, items });
    expect(found.map((one) => one.code)).toEqual(['or_items_numbered']);
    expect(found[0]?.message).toMatch(/^Items 1 and 3 start with/);
  });

  it('advises that two items are a coin toss', () => {
    expect(findingsOf({ ...complete, items: complete.items.slice(0, 2) })).toEqual([
      ['or_items_too_few', 'items'],
    ]);
  });

  it('reads an unfinished draft without throwing', () => {
    const ids = ['x1', 'x2', 'x3'];
    expect(findingsOf(createDraft('ordering', { newId: () => ids.shift() as string }))).toEqual([]);
    expect(findingsOf({ ...complete, items: 'none' })).toEqual([]);
    expect(findingsOf({ ...complete, items: [null, { id: 'a', text: 'b' }] })).toEqual([]);
  });
});
