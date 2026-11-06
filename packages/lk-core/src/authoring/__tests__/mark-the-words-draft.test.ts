import { describe, expect, it } from 'vitest';
import { createDraft, critiqueDraft, validateDraft } from '../index.js';

const complete = {
  schemaVersion: '1.0',
  type: 'mark-the-words',
  id: 'mw1',
  title: 'The past',
  text: 'Yesterday she went to the market and bought bread. She had never gone there before.',
  targets: [{ text: 'went' }, { text: 'bought' }, { text: 'had never gone' }],
  scoringStrategy: 'partial',
};

const codesOf = (draft: unknown): [string, string, string][] =>
  validateDraft('mark-the-words', draft).issues.map((found) => [
    found.code,
    found.severity,
    found.path.join('.'),
  ]);

const findingsOf = (draft: unknown): [string, string][] =>
  critiqueDraft('mark-the-words', draft).map((found) => [found.code, found.path.join('.')]);

describe('mark-the-words drafts', () => {
  it('starts incomplete', () => {
    const draft = createDraft('mark-the-words', { newId: () => 'id-1' });
    expect(draft).toEqual({
      schemaVersion: '1.0',
      type: 'mark-the-words',
      id: 'id-1',
      title: '',
      text: '',
      targets: [],
      scoringStrategy: 'all-or-nothing',
    });
    expect(codesOf(draft)).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['mw_text_required', 'incomplete', 'text'],
      ['mw_targets_required', 'incomplete', 'targets'],
    ]);
  });

  it('is complete once every target falls on the text', () => {
    expect(validateDraft('mark-the-words', complete).status).toBe('complete');
  });

  it('calls a text with no word unfinished, and one too long invalid', () => {
    expect(codesOf({ ...complete, text: '— …' })).toEqual([
      ['mw_text_required', 'incomplete', 'text'],
    ]);
    expect(codesOf({ ...complete, text: 'went bought had never gone '.repeat(400) })).toEqual([
      ['mw_text_too_long', 'invalid', 'text'],
    ]);
  });

  it('reports each target at its own field', () => {
    expect(
      codesOf({
        ...complete,
        targets: [
          { text: ' ' },
          { text: '?!' },
          { text: 'flew' },
          { text: 'went', occurrence: 0 },
          { text: 'bought', occurrence: 2 },
          null,
          'went',
        ],
      }),
    ).toEqual([
      ['mw_target_text_required', 'incomplete', 'targets.0.text'],
      ['mw_target_no_words', 'invalid', 'targets.1.text'],
      ['mw_target_not_found', 'invalid', 'targets.2.text'],
      ['mw_target_occurrence_invalid', 'invalid', 'targets.3.occurrence'],
      ['mw_target_occurrence_invalid', 'invalid', 'targets.4.occurrence'],
      ['null_not_allowed', 'invalid', 'targets.5'],
      ['invalid_type', 'invalid', 'targets.6'],
    ]);
  });

  it('asks which appearance a repeated word is, and refuses one shared by two targets', () => {
    const text = 'She went home and he went out.';
    expect(codesOf({ ...complete, text, targets: [{ text: 'went' }] })).toEqual([
      ['mw_target_ambiguous', 'incomplete', 'targets.0.text'],
    ]);
    expect(
      validateDraft('mark-the-words', { ...complete, text, targets: [{ text: 'went' }] }).issues[0]
        ?.message,
    ).toContain('appears 2 times');
    expect(
      codesOf({
        ...complete,
        text,
        targets: [{ text: 'went', occurrence: 1 }, { text: 'went home' }],
      }),
    ).toEqual([['mw_target_overlap', 'invalid', 'targets.1']]);
    expect(
      validateDraft('mark-the-words', {
        ...complete,
        text: 'went',
        targets: [{ text: 'went' }, { text: 'went', occurrence: 1 }],
      }).issues[0]?.message,
    ).toContain('with target 1');
  });

  it('leaves a targets value that is not a list to the schema', () => {
    expect(codesOf({ ...complete, targets: 'went' }).map(([code]) => code)).toEqual([
      'invalid_type',
    ]);
  });
});

describe('mark-the-words critic', () => {
  it('finds nothing to say about a good item', () => {
    expect(findingsOf(complete)).toEqual([]);
  });

  it('points out a title that names a target', () => {
    expect(findingsOf({ ...complete, title: 'had never gone' })).toEqual([
      ['mw_title_reveals_answer', 'title'],
    ]);
  });

  it('warns when marking every word would score, and says how much', () => {
    const dense = {
      ...complete,
      text: 'She went and bought.',
      targets: [{ text: 'went' }, { text: 'bought' }, { text: 'She' }],
    };
    expect(findingsOf(dense)).toEqual([['mw_targets_dense', 'targets']]);
    expect(critiqueDraft('mark-the-words', dense)[0]?.message).toContain('scores 67%');
  });

  it('advises when a target also appears untargeted', () => {
    const text = 'She went home and he went out.';
    expect(findingsOf({ ...complete, text, targets: [{ text: 'went', occurrence: 2 }] })).toEqual([
      ['mw_target_elsewhere', 'targets.0'],
    ]);
    expect(
      findingsOf({
        ...complete,
        text,
        targets: [
          { text: 'went', occurrence: 1 },
          { text: 'went', occurrence: 2 },
        ],
      }),
    ).toEqual([]);
    expect(
      findingsOf({
        ...complete,
        text: 'He had gone; she had gone.',
        targets: [{ text: 'had gone', occurrence: 1 }],
      }),
    ).toEqual([['mw_target_elsewhere', 'targets.0']]);
  });

  it('reads an unfinished draft without throwing', () => {
    expect(findingsOf({ type: 'mark-the-words', text: 7, targets: 'x' })).toEqual([]);
    expect(
      findingsOf({ type: 'mark-the-words', title: 4, text: 'a b', targets: [null, { text: 3 }] }),
    ).toEqual([]);
  });
});
