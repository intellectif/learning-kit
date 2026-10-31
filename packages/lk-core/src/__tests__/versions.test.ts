import { describe, expect, it } from 'vitest';
import {
  aiVariantsRequest,
  canonicalJson,
  checkAiVariants,
  contentHash,
  critiqueVersions,
  listMediaRefs,
  mapMediaRefs,
  type VersionPaper,
  validateDraft,
  validateItemGroupDraft,
} from '../index.js';
import { counter, fillIn, goodVariants, listening, section, writing } from './variants-fixtures.js';

type Fields = Record<string, unknown>;

const paper = (...sections: Fields[][]): VersionPaper => ({
  sections: sections.map((entries, n) => ({ key: `s${n}`, title: `Section ${n + 1}`, entries })),
});

/** Form v2 of the fixture section, as generateVariants would write it. */
function formTwo(): Fields[] {
  const checked = checkAiVariants(
    { variants: goodVariants() },
    aiVariantsRequest({ exemplars: section(), level: 'A2' }),
    { newId: counter('v2') },
  );
  if (!checked.ok) {
    throw new Error('refused');
  }
  return checked.variants.variants.map((one) => one.entry);
}

const codes = (comparison: ReturnType<typeof critiqueVersions>) =>
  comparison.findings.map((one) => one.code);

describe('critiqueVersions', () => {
  it('finds a form parallel to itself, and every item of it copied and its keys repeated', () => {
    const v1 = paper(section());
    const same = critiqueVersions(v1, v1);
    expect(same.summary).toEqual({ aItems: 7, bItems: 7, paired: 7, structureMismatches: 0 });
    expect(same.findings.filter((one) => one.severity === 'invalid')).toEqual([]);
    const copied = same.findings
      .filter((one) => one.code === 'versions_near_copy')
      .map((one) => one.b?.join('.'));
    expect(copied).toEqual([
      'sections.0.entries.0.stimulus.script',
      'sections.0.entries.0.items.0.question',
      'sections.0.entries.0.items.1.question',
      'sections.0.entries.1.transcript',
      'sections.0.entries.2.passage',
      'sections.0.entries.3.passage',
      'sections.0.entries.4.prompt',
      'sections.0.entries.5.referenceText',
      'sections.0.entries.0.items.0.options',
      'sections.0.entries.0.items.1.options',
    ]);
    expect(same.findings.filter((one) => one.code === 'versions_same_key')).toHaveLength(7);
    expect(
      same.findings
        .filter((one) => one.code === 'versions_shared_media')
        .map((one) => one.severity),
    ).toEqual(['warning', 'warning', 'warning']);
  });

  it('finds no invalid finding between a form and its variants', () => {
    const comparison = critiqueVersions(paper(section()), paper(formTwo()));
    expect(comparison.findings.filter((one) => one.severity === 'invalid')).toEqual([]);
    expect(comparison.findings.map((one) => [one.code, one.b?.join('.')])).toEqual([
      ['versions_same_key', 'sections.0.entries.3.blanks.1.acceptedAnswers'],
    ]);
    expect(comparison.slots.every((slot) => slot.a !== null && slot.b !== null)).toBe(true);
    // The part keeps its slotKey in the variant; its items, and the rest, pair by position.
    expect(comparison.slots.map((slot) => slot.by)).toEqual([
      'slotKey',
      'position',
      'position',
      'position',
      'position',
      'position',
      'position',
      'position',
    ]);
  });

  it('reports a different blueprint: sections, their titles, and how many entries each holds', () => {
    const comparison = critiqueVersions(paper(section(), [writing()]), {
      sections: [{ key: 's0', title: 'Listening', entries: section().slice(0, 5) }],
    });
    expect(
      codes(comparison).filter(
        (code) =>
          code !== 'versions_near_copy' &&
          code !== 'versions_same_key' &&
          code !== 'versions_shared_media',
      ),
    ).toEqual(['versions_section_mismatch', 'versions_section_mismatch', 'versions_entry_count']);
    expect(comparison.findings[1]).toMatchObject({
      a: ['sections', '0'],
      b: ['sections', '0'],
      severity: 'invalid',
      message: 'Section 1 is "Listening" in the second form and "Section 1" in the first.',
    });
    expect(
      comparison.slots.filter((slot) => slot.b === null).map((slot) => slot.a?.join('.')),
    ).toEqual(['sections.0.entries.5', 'sections.1.entries.0']);
  });

  it('reports a slot of another type, and a slot whose structure scores differently', () => {
    const two = formTwo();
    two[1] = writing();
    const blanks = two[3] as Fields;
    (blanks.blanks as Fields[])[0] = {
      id: '1',
      acceptedAnswers: ['had'],
      match: { levenshtein: 1 },
    };
    const group = two[0] as Fields;
    (group.items as Fields[]).pop();
    const comparison = critiqueVersions(paper(section()), paper(two));
    const invalid = comparison.findings.filter((one) => one.severity === 'invalid');
    expect(invalid.map((one) => [one.code, one.b?.join('.'), one.message])).toEqual([
      ['versions_entry_count', 'sections.0.entries.0.items', '1 item; the exemplar has 2.'],
      [
        'versions_type_mismatch',
        'sections.0.entries.1',
        'The second form has written-response here; the first has dictation.',
      ],
      [
        'versions_structure_mismatch',
        'sections.0.entries.3.blanks.0',
        "Blank 1 matches answers differently from the exemplar's.",
      ],
    ]);
    expect(comparison.summary.structureMismatches).toBe(3);
  });

  it('reports an item type changed inside a group as a type mismatch', () => {
    const two = formTwo();
    const group = two[0] as Fields;
    (group.items as Fields[])[1] = { ...writing(), id: 'x' };
    const comparison = critiqueVersions(paper(section()), paper(two));
    expect(
      comparison.findings
        .filter((one) => one.severity === 'invalid')
        .map((one) => [one.code, one.b?.join('.')]),
    ).toEqual([['versions_type_mismatch', 'sections.0.entries.0.items.1.type']]);
  });

  it('warns of other objectives, and of a passage outside its length band', () => {
    const two = formTwo();
    const question = ((two[0] as Fields).items as Fields[])[0] as Fields;
    question.learningObjectives = ['https://example.com/cefr/a2/listening/gist'];
    (two[3] as Fields).passage = 'If he {{1}} time, he would play. They worked {{2}} May.';
    const comparison = critiqueVersions(paper(section()), paper(two), {
      lengthTolerance: { item: 0.25 },
    });
    expect(
      comparison.findings
        .filter((one) => one.severity === 'warning')
        .map((one) => [one.code, one.b?.join('.')]),
    ).toEqual([
      ['versions_objectives_mismatch', 'sections.0.entries.0.items.0'],
      ['versions_length_out_of_band', 'sections.0.entries.3.passage'],
      ['versions_same_key', 'sections.0.entries.3.blanks.1.acceptedAnswers'],
    ]);
  });

  it('finds a near copy anywhere in the other form, not only in its pair', () => {
    const two = formTwo();
    (two[5] as Fields).referenceText =
      'My brother usually walks to school with his two best friends.';
    const comparison = critiqueVersions(paper(section()), paper(two));
    expect(comparison.findings.find((one) => one.code === 'versions_near_copy')).toMatchObject({
      a: ['sections', '0', 'entries', '1', 'transcript'],
      b: ['sections', '0', 'entries', '5', 'referenceText'],
      severity: 'warning',
      message: "This reads like the first form's text here (similarity 1.00).",
    });
  });

  it('warns of a recording both forms use, and advises of a shared picture unless pictures may not be shared', () => {
    const one = {
      ...writing(),
      media: { type: 'image', url: 'https://cdn.example.com/cat.png', alt: 'A cat.' },
    };
    const two = {
      ...writing(),
      id: 'w2',
      prompt: 'Look at the picture and describe what the cat is doing in the kitchen today.',
      media: { type: 'image', url: 'https://cdn.example.com/cat.png', alt: 'A cat.' },
    };
    const shared = (allowSharedImages?: boolean) =>
      critiqueVersions(
        paper([one]),
        paper([two]),
        allowSharedImages === undefined ? {} : { allowSharedImages },
      )
        .findings.filter((found) => found.code === 'versions_shared_media')
        .map((found) => [found.severity, found.message, found.b?.join('.')]);
    expect(shared()).toEqual([
      ['advice', 'Both forms show this picture.', 'sections.0.entries.0.media.url'],
    ]);
    expect(shared(false)).toEqual([
      ['warning', 'Both forms show this picture.', 'sections.0.entries.0.media.url'],
    ]);
  });

  it('pairs by the pairs given, then by slotKey, then by position', () => {
    const a = [{ ...fillIn(), slotKey: 'grammar' }, writing()];
    const b = [writing(), { ...fillIn(), slotKey: 'grammar' }];
    const bySlot = critiqueVersions(paper(a), paper(b));
    // Position is the same entry of the same section: what slotKey took out of order stays unpaired.
    expect(bySlot.slots).toEqual([
      { a: ['sections', '0', 'entries', '0'], b: ['sections', '0', 'entries', '1'], by: 'slotKey' },
      { a: ['sections', '0', 'entries', '1'], b: null, by: 'position' },
      { a: null, b: ['sections', '0', 'entries', '0'], by: 'position' },
    ]);
    expect(bySlot.findings.filter((one) => one.severity === 'invalid')).toEqual([]);
    expect(bySlot.summary).toEqual({ aItems: 2, bItems: 2, paired: 1, structureMismatches: 0 });
    const given = critiqueVersions(paper([fillIn(), writing()]), paper([writing(), fillIn()]), {
      pairs: [
        { a: ['sections', '0', 'entries', '0'], b: ['sections', '0', 'entries', '1'] },
        { a: ['sections', '0', 'entries', '1'], b: ['sections', '0', 'entries', '0'] },
      ],
    });
    expect(given.slots.map((slot) => slot.by)).toEqual(['pairs', 'pairs']);
    expect(given.findings.filter((one) => one.severity === 'invalid')).toEqual([]);
    const byPosition = critiqueVersions(paper([fillIn(), writing()]), paper([writing(), fillIn()]));
    expect(codes(byPosition).filter((code) => code === 'versions_type_mismatch')).toHaveLength(2);
  });

  it("pairs a group's items by their own slotKey before their position", () => {
    const a = listening();
    const b = listening();
    (a.items as Fields[])[0] = { ...((a.items as Fields[])[0] as Fields), slotKey: 'q-why' };
    (b.items as Fields[]).reverse();
    (b.items as Fields[])[1] = { ...((b.items as Fields[])[1] as Fields), slotKey: 'q-why' };
    const comparison = critiqueVersions(paper([a]), paper([b]));
    expect(comparison.slots).toEqual([
      { a: ['sections', '0', 'entries', '0'], b: ['sections', '0', 'entries', '0'], by: 'slotKey' },
      {
        a: ['sections', '0', 'entries', '0', 'items', '0'],
        b: ['sections', '0', 'entries', '0', 'items', '1'],
        by: 'slotKey',
      },
      { a: ['sections', '0', 'entries', '0', 'items', '1'], b: null, by: 'position' },
      { a: null, b: ['sections', '0', 'entries', '0', 'items', '0'], by: 'position' },
    ]);
  });

  it('reads anything without throwing', () => {
    expect(critiqueVersions({ sections: [] }, { sections: [] })).toEqual({
      findings: [],
      slots: [],
      summary: { aItems: 0, bItems: 0, paired: 0, structureMismatches: 0 },
    });
    expect(() =>
      critiqueVersions(null as never, { sections: [{ entries: [null, 3, {}] }] }),
    ).not.toThrow();
  });
});

describe('contract confirmations for 1.8', () => {
  it('reports a recording or a picture with no file as media_url_required, incomplete', () => {
    const recording = validateDraft('dictation', {
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'd',
      title: 'Listen',
      transcript: 'Words to write.',
      media: { type: 'audio', url: null },
    });
    expect(recording.status).toBe('incomplete');
    expect(recording.issues).toEqual([
      expect.objectContaining({
        code: 'media_url_required',
        path: ['media', 'url'],
        severity: 'incomplete',
      }),
    ]);
    const picture = validateDraft('written-response', {
      ...writing(),
      media: { type: 'image', url: null, alt: 'A dog in a garden.' },
    });
    expect(picture.issues.map((one) => [one.code, one.severity])).toEqual([
      ['media_url_required', 'incomplete'],
    ]);
  });

  it("keeps a script turn's own fields through validation, hashing and re-pointing", () => {
    const group = listening();
    const validated = validateItemGroupDraft(group);
    expect(validated.status).toBe('complete');
    const turn = (
      validated.status === 'complete' ? validated.data.stimulus.script?.[0] : undefined
    ) as Fields | undefined;
    expect(turn?.voiceId).toBe('v-anna');
    expect(canonicalJson(group)).toContain('"voiceId":"v-anna"');
    const repointed = mapMediaRefs(group, () => 'https://cdn.example.com/v2/part1.mp3') as Fields;
    expect(((repointed.stimulus as Fields).script as Fields[])[0]?.voiceId).toBe('v-anna');
  });

  it('lists a picture slot with no file, with its description on the holder', () => {
    const entry = { ...writing(), media: { type: 'image', url: null, alt: 'A dog in a garden.' } };
    expect(listMediaRefs(entry)).toEqual([
      {
        activityId: 'v1-wr',
        kind: 'image',
        path: ['media', 'url'],
        url: null,
        holder: { type: 'image', url: null, alt: 'A dog in a garden.' },
      },
    ]);
  });

  it('hashes ids with the content, so two variants that differ only in ids hash apart', () => {
    expect(contentHash({ ...writing(), id: 'a' })).not.toBe(contentHash({ ...writing(), id: 'b' }));
  });
});
