import { describe, expect, it } from 'vitest';
import { createReadingRouteDraft, validateItemGroupDraft } from '../../authoring/index.js';
import { redactItemGroup } from '../../redact.js';
import { validateItemGroup } from '../../schemas/index.js';
import type { ItemGroup } from '../../types/item-group.js';
import type { RouteQuestion } from '../../types/reading-route.js';
import { readingQuizzes, routeIssues } from '../check.js';
import { tramGroup } from './fixture.js';

/** The fixture with its route's question `index` changed. */
function withQuestion(
  index: number,
  change: Partial<RouteQuestion> | Record<string, unknown>,
): ItemGroup {
  const group = tramGroup();
  const route = group.route as NonNullable<ItemGroup['route']>;
  route.questions[index] = {
    ...(route.questions[index] as RouteQuestion),
    ...change,
  } as RouteQuestion;
  return group;
}

const codes = (group: unknown): string[] => routeIssues(group).map((issue) => issue.code);

describe('a reading route that keeps every rule', () => {
  it('validates, as content and as a draft', () => {
    const group = tramGroup();
    expect(routeIssues(group)).toEqual([]);
    expect(validateItemGroup(group).success).toBe(true);
    expect(validateItemGroupDraft(group)).toMatchObject({ status: 'complete', issues: [] });
  });

  it('leaves a learner copy with strategies and no evidence, key words, traps or notes', () => {
    const group = withQuestion(0, { notes: { locate: 'Look for the year.' } });
    const redacted = redactItemGroup(group);
    expect(redacted.route).toEqual({
      routeVersion: '1.0',
      paragraphLabels: ['A', 'B', 'C', 'D', 'E'],
      questions: [
        { itemId: 'tf1', strategy: 'tfng' },
        { itemId: 'tf2', strategy: 'tfng' },
        { itemId: 'tf3', strategy: 'tfng' },
        { itemId: 'mc1', strategy: 'multiple-choice' },
        { itemId: 'fib1', partId: 'b1', strategy: 'completion', wordLimit: 3 },
        { itemId: 'fib1', partId: 'b2', strategy: 'completion', wordLimit: 3 },
        { itemId: 'gs1', partId: 'g1', strategy: 'matching-headings' },
        { itemId: 'gs1', partId: 'g2', strategy: 'matching-headings' },
      ],
    });
    expect(JSON.stringify(redacted.route)).not.toMatch(/evidence|keywords|traps|notes|lure/);
    // After submit, the debrief gets the whole route back.
    const revealed = redactItemGroup(group, { reveal: 'after-submit' });
    expect(revealed.route?.questions[0]).toEqual(group.route?.questions[0]);
  });

  it('refuses an unknown field in a route, which would otherwise be lost silently', () => {
    const group = withQuestion(0, { evidense: ['By 1960'] });
    expect(validateItemGroup(group).success).toBe(false);
  });

  it('starts a new route draft incomplete, never invalid', () => {
    const ids = ['g', 's'];
    const draft = createReadingRouteDraft({ newId: () => ids.shift() as string });
    expect(draft.route).toEqual({ routeVersion: '1.0', questions: [] });
    const result = validateItemGroupDraft(draft);
    expect(result.status).toBe('incomplete');
    expect(result.issues.map((found) => found.code)).toContain('ig_route_body_required');
  });
});

describe('the rules of a route', () => {
  it('needs a text, no timeline and no shuffle', () => {
    const video = tramGroup();
    video.stimulus = {
      id: 'v',
      kind: 'video',
      media: { type: 'video', url: 'https://example.org/v.mp4' },
    };
    expect(codes(video)).toContain('ig_route_stimulus_kind');
    const empty = tramGroup();
    empty.stimulus = { id: 's', kind: 'text', body: '  ' };
    expect(codes(empty)).toContain('ig_route_body_required');
    const shuffled = tramGroup();
    shuffled.shuffle = 'within-group';
    expect(codes(shuffled)).toEqual(['ig_route_shuffle']);
  });

  it('holds only the three reading item types', () => {
    const group = tramGroup();
    group.items.push({
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'wr',
      title: 'Essay',
      prompt: 'Discuss.',
      minWords: 1,
      maxWords: 10,
    } as never);
    expect(codes(group)).toEqual(['ig_route_item_type']);
  });

  it('matches each entry to exactly one question of the items', () => {
    expect(codes(withQuestion(0, { itemId: 'nope' }))).toEqual([
      'ig_route_question_item_unknown',
      'ig_route_question_missing',
    ]);
    expect(codes(withQuestion(0, { partId: 'x' }))).toEqual([
      'ig_route_question_part_not_allowed',
      'ig_route_question_missing',
    ]);
    expect(codes(withQuestion(4, { partId: undefined }))).toEqual([
      'ig_route_question_part_required',
      'ig_route_question_missing',
    ]);
    expect(codes(withQuestion(4, { partId: 'b9' }))).toEqual([
      'ig_route_question_part_unknown',
      'ig_route_question_missing',
    ]);
    expect(codes(withQuestion(5, { partId: 'b1' }))).toEqual([
      'ig_route_question_duplicate',
      'ig_route_question_missing',
    ]);
    const missing = tramGroup();
    missing.route?.questions.splice(6, 2);
    expect(routeIssues(missing).map((issue) => issue.message)).toEqual([
      'Blank or gap "g1" of "gs1" has no route entry.',
      'Blank or gap "g2" of "gs1" has no route entry.',
    ]);
  });

  it('needs a strategy the item can be written in', () => {
    expect(codes(withQuestion(0, { strategy: '' as never }))).toEqual([
      'ig_route_strategy_required',
    ]);
    expect(codes(withQuestion(0, { strategy: 'speed-reading' as never }))).toEqual([
      'ig_route_strategy_unknown',
    ]);
    expect(codes(withQuestion(0, { strategy: 'completion' }))).toEqual([
      'ig_route_strategy_item_type',
    ]);
  });

  it('needs evidence, quoted once and exactly', () => {
    expect(codes(withQuestion(0, { evidence: [] }))).toEqual(['ig_route_evidence_required']);
    expect(codes(withQuestion(0, { evidence: ['By 1970'] }))).toEqual(['ig_route_quote_not_found']);
    expect(codes(withQuestion(0, { evidence: ['tram'] }))).toEqual(['ig_route_quote_ambiguous']);
    expect(codes(withQuestion(0, { evidence: [{ text: 'tram', occurrence: 2 }] }))).toEqual([]);
    expect(
      routeIssues(withQuestion(0, { evidence: [{ text: 'Manchester', occurrence: 3 }] })),
    ).toEqual([
      {
        code: 'ig_route_quote_not_found',
        path: ['route', 'questions', 0, 'evidence', 0],
        message: '"Manchester" appears only 1 time in the passage.',
      },
    ]);
    // Copying from a document changes spaces and quotation marks, and that is all a quote forgives.
    expect(codes(withQuestion(0, { evidence: ['called  this the “rail factor”'] }))).toEqual([]);
  });

  it('checks key words against the question and the passage', () => {
    expect(codes(withQuestion(0, { keywords: [{ question: 'In 1950' }] }))).toEqual([
      'ig_route_keyword_not_in_question',
    ]);
    expect(
      codes(withQuestion(0, { keywords: [{ question: 'by 1960', passage: 'In 1950' }] })),
    ).toEqual(['ig_route_quote_not_found']);
    expect(codes(withQuestion(0, { links: [{ from: 'Planners began', to: 'In 1950' }] }))).toEqual([
      'ig_route_quote_not_found',
    ]);
  });

  it('accepts a trap only on a wrong option it can find', () => {
    expect(codes(withQuestion(0, { traps: [{ optionId: 'zz', kind: 'opposite' }] }))).toEqual([
      'ig_route_trap_option_unknown',
    ]);
    expect(codes(withQuestion(0, { traps: [{ optionId: 't', kind: 'opposite' }] }))).toEqual([
      'ig_route_trap_on_answer',
    ]);
    expect(codes(withQuestion(7, { traps: [{ optionId: 'h2', kind: 'too-general' }] }))).toEqual([
      'ig_route_trap_on_answer',
    ]);
    expect(
      codes(withQuestion(7, { traps: [{ optionId: 'h3', kind: 'too-general', lure: 'In 1950' }] })),
    ).toEqual(['ig_route_quote_not_found']);
  });

  it('keeps notes to the strategy, short, and free of the answer', () => {
    expect(codes(withQuestion(0, { notes: { cohesion: 'Follow the pronoun.' } }))).toEqual([
      'ig_route_note_move_unknown',
    ]);
    expect(codes(withQuestion(0, { notes: { survey: 'Skim first.' } }))).toEqual([
      'ig_route_note_move_unknown',
    ]);
    expect(codes(withQuestion(0, { notes: { locate: 'x'.repeat(281) } }))).toEqual([
      'ig_route_note_too_long',
    ]);
    expect(codes(withQuestion(0, { notes: { decide: 'This one is True.' } }))).toEqual([
      'ig_route_note_reveals_answer',
    ]);
    // Naming every label is the rule, not the answer.
    expect(
      codes(
        withQuestion(0, {
          notes: { decide: 'True if it agrees, False if not, Not Given if silent.' },
        }),
      ),
    ).toEqual([]);
    expect(
      codes(withQuestion(4, { notes: { predict: 'The answer is old railway lines.' } })),
    ).toEqual(['ig_route_note_reveals_answer']);
    expect(
      codes(
        withQuestion(6, { notes: { locate: 'Why passengers came back to rails, of course.' } }),
      ),
    ).toEqual(['ig_route_note_reveals_answer']);
  });

  it('holds a word limit to the questions a learner writes, and every accepted answer to it', () => {
    expect(codes(withQuestion(0, { wordLimit: 2 }))).toEqual(['ig_route_word_limit_type']);
    expect(routeIssues(withQuestion(4, { wordLimit: 2 }))).toEqual([
      {
        code: 'ig_route_answer_over_limit',
        path: ['route', 'questions', 4, 'wordLimit'],
        message:
          'The accepted answer "old railway lines" is longer than 2 words: a learner who writes it would lose the mark.',
      },
    ]);
  });

  it('fits paragraph labels and sections to the passage', () => {
    const labels = tramGroup();
    (labels.route as NonNullable<ItemGroup['route']>).paragraphLabels = ['A', 'B'];
    expect(codes(labels)).toEqual(['ig_route_paragraph_labels']);
    const sections = tramGroup();
    (sections.route as NonNullable<ItemGroup['route']>).sections = [
      { label: 'Text 1', paragraphs: 2 },
    ];
    expect(codes(sections)).toEqual(['ig_route_sections']);
    (sections.route as NonNullable<ItemGroup['route']>).sections = [
      { label: 'Text 1', paragraphs: 2 },
      { label: 'Text 2', paragraphs: 3 },
    ];
    expect(codes(sections)).toEqual([]);
  });

  it('reports a draft issue at its path with its severity', () => {
    const result = validateItemGroupDraft(withQuestion(0, { evidence: ['By 1970'] }));
    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ig_route_quote_not_found',
        path: ['route', 'questions', '0', 'evidence', '0'],
        severity: 'invalid',
      }),
    ]);
    const incomplete = validateItemGroupDraft(withQuestion(0, { evidence: [] }));
    expect(incomplete.status).toBe('incomplete');
  });

  it('checks only what a learner copy carries', () => {
    const redacted = redactItemGroup(tramGroup());
    expect(routeIssues(redacted, 'redacted')).toEqual([]);
    expect(routeIssues({ route: 'nope' })).toEqual([]);
    expect(routeIssues(null)).toEqual([]);
  });
});

/**
 * The fixture as an interactive video: the passage is the video's text, the
 * three True/False/Not Given statements are one reading quiz, and a check on
 * the video is an ordinary quiz the route does not cover.
 */
function videoGroup(): ItemGroup {
  const group = tramGroup();
  const route = group.route as NonNullable<ItemGroup['route']>;
  group.stimulus = {
    id: 'clip',
    kind: 'video',
    media: { type: 'video', url: 'https://example.org/trams.mp4' },
    body: group.stimulus.body as string,
  };
  group.items = [
    ...group.items.slice(0, 3),
    {
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'heard',
      title: 'Heard',
      media: { type: 'audio', url: 'https://example.org/heard.mp3' },
      transcript: 'Trams came back.',
      scoringStrategy: 'partial',
    } as never,
  ];
  route.questions = route.questions.slice(0, 3);
  group.timeline = {
    cues: [
      { id: 'read', at: 10, itemIds: ['tf1', 'tf2', 'tf3'] },
      { id: 'check', at: 20, itemIds: ['heard'] },
    ],
  };
  return group;
}

describe('a reading route in an interactive video', () => {
  it('reads the video text in the quizzes it covers, and leaves the others alone', () => {
    const group = videoGroup();
    expect(routeIssues(group)).toEqual([]);
    expect(validateItemGroup(group).success).toBe(true);
    expect(readingQuizzes(group)).toEqual(['read']);
    // A learner copy keeps its strategies, and the video's other quizzes.
    expect(routeIssues(redactItemGroup(group), 'redacted')).toEqual([]);
  });

  it('refuses a quiz the route covers only part of, and a video with no text', () => {
    const mixed = videoGroup();
    (mixed.timeline as NonNullable<ItemGroup['timeline']>).cues = [
      { id: 'read', at: 10, itemIds: ['tf1', 'tf2', 'tf3', 'heard'] },
    ];
    expect(codes(mixed)).toEqual(['ig_route_quiz_mixed', 'ig_route_item_type']);
    const silent = videoGroup();
    silent.stimulus = { ...silent.stimulus, body: '' };
    expect(routeIssues(silent).map((issue) => issue.message)).toEqual([
      "Add the passage the video's reading quizzes are about, as the stimulus's text.",
    ]);
    // A video without a timeline is no reading route.
    const plain = videoGroup();
    delete plain.timeline;
    expect(codes(plain)).toContain('ig_route_stimulus_kind');
    expect(readingQuizzes(plain)).toEqual([]);
    expect(readingQuizzes(null)).toEqual([]);
  });
});
