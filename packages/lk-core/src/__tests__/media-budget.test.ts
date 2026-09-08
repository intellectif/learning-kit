import { describe, expect, it } from 'vitest';
import { planAttempt } from '../attempt-plan.js';
import {
  entryKeyOf,
  planMediaBudgets,
  resolvePlaybackPolicy,
  restoreMediaPlayLedger,
  serializeMediaPlayLedger,
  slotMediaKey,
  stimulusMediaKey,
} from '../media-budget.js';
import type { ActivityMedia } from '../types/activity.js';
import type { ItemGroup, SequenceEntry } from '../types/item-group.js';
import type { MediaPlayLedger } from '../types/media-budget.js';

interface Item {
  id: string;
  type: 'multiple-choice';
  question?: string;
  media?: ActivityMedia;
}

const RECORDING = 'https://cdn.example.com/part2.mp3';

const item = (id: string, media?: ActivityMedia): Item => ({
  id,
  type: 'multiple-choice',
  question: `${id}?`,
  ...(media !== undefined ? { media } : {}),
});

const budgeted = (maxPlays: number, url: string = RECORDING): ActivityMedia => ({
  type: 'audio',
  url,
  playback: { maxPlays },
});

/** Six questions over one recording — the shape the budget keying exists for. */
const listening = (media: ActivityMedia): ItemGroup<Item> => ({
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'g-listening',
  stimulus: { id: 's1', kind: 'audio', media },
  items: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((id) => item(id)),
});

describe('media budget keys', () => {
  it('reads the authored entry out of a slot id of either shape', () => {
    expect(entryKeyOf('3')).toBe('3');
    expect(entryKeyOf('3.1')).toBe('3');
    expect(entryKeyOf('reading.q1')).toBe('reading');
  });

  it('gives every question of one group the SAME stimulus key', () => {
    // One recording serves the whole group, so the budget belongs to the entry.
    expect(stimulusMediaKey('3.0')).toBe(stimulusMediaKey('3.5'));
    expect(stimulusMediaKey('3.0')).toBe('stimulus:3');
  });

  it('gives each slot its own key for the media it owns', () => {
    // A slot's own `data.media` is its own recording, even inside a group.
    expect(slotMediaKey('3.0')).not.toBe(slotMediaKey('3.1'));
    expect(slotMediaKey('3.0')).toBe('slot:3.0');
  });
});

describe('planMediaBudgets', () => {
  it('budgets a six-question listening group ONCE, not once per question', () => {
    // The central regression: keying a stimulus budget by slot would hand a
    // `maxPlays: 2` group twelve plays of the one recording it is built on,
    // while the paper — and the invigilator — say two.
    const plan = planAttempt<Item>([listening(budgeted(2))]);
    const budgets = planMediaBudgets(plan);

    expect(plan.slots).toHaveLength(6);
    expect(budgets).toEqual({ 'stimulus:0': 2 });
    expect(Object.values(budgets).reduce((sum, plays) => sum + plays, 0)).toBe(2);
    expect(plan.slots.every((slot) => slot.mediaBudgets?.length === 1)).toBe(true);
  });

  it("budgets a slot's own media separately from its group's stimulus", () => {
    const own = budgeted(1, 'https://cdn.example.com/q1-only.mp3');
    const group = listening(budgeted(2));
    group.items[0] = item('q1', own);

    expect(planMediaBudgets(planAttempt<Item>([group]))).toEqual({
      'stimulus:0': 2,
      'slot:0.0': 1,
    });
  });

  it('returns the maxPlays FROZEN at plan time, not a live read of content', () => {
    // A plan is a historical fact. Re-publishing the paper with a different
    // budget must not retroactively change what the learner was granted.
    const media: ActivityMedia & { playback: { maxPlays: number } } = {
      type: 'audio',
      url: RECORDING,
      playback: { maxPlays: 2 },
    };
    const plan = planAttempt<Item>([listening(media)]);

    media.playback.maxPlays = 9;

    expect(planMediaBudgets(plan)).toEqual({ 'stimulus:0': 2 });
  });

  it('refuses a paper that splits one recording across several budgets', () => {
    // Questions each carrying the same file with `maxPlays: 2` are two plays
    // EACH wearing the label "two". The fix is authoring — an item group — so
    // the paper is rejected rather than quietly over-granted.
    const entries: SequenceEntry<Item>[] = [item('q1', budgeted(2)), item('q2', budgeted(2))];
    expect(() => planAttempt<Item>(entries)).toThrow(/budgeted under 2 separate keys/);
  });

  it('allows the same recording on two slots when neither is budgeted', () => {
    const unbudgeted: ActivityMedia = { type: 'audio', url: RECORDING };
    const entries: SequenceEntry<Item>[] = [item('q1', unbudgeted), item('q2', unbudgeted)];
    expect(planMediaBudgets(planAttempt<Item>(entries))).toEqual({});
  });
});

describe('media play ledger', () => {
  const plan = planAttempt<Item>([listening(budgeted(2))]);
  const key = stimulusMediaKey('0');

  it('refuses a play recorded against a recording the plan does not budget', () => {
    // Caught at the moment the client and the plan disagree about which paper
    // this is — not when a learner tries to resume and the counts make no sense.
    expect(() => serializeMediaPlayLedger(plan, { 'slot:0': { plays: 1 } })).toThrow(
      /does not\s+budget/,
    );
  });

  it.each([
    ['NaN, the shape Number(a NULL column) takes', Number.NaN],
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('refuses %s', (_label, plays) => {
    expect(() => serializeMediaPlayLedger(plan, { [key]: { plays } })).toThrow(
      /non-negative integer/,
    );
  });

  it('refuses a non-finite position', () => {
    expect(() =>
      serializeMediaPlayLedger(plan, { [key]: { plays: 1, at: Number.POSITIVE_INFINITY } }),
    ).toThrow(/finite number of seconds/);
  });

  it('accepts a count ABOVE the budget rather than clamping it away', () => {
    // An invigilator override and a race the server resolved both legitimately
    // produce this. Clamping would hide the only evidence either happened.
    expect(serializeMediaPlayLedger(plan, { [key]: { plays: 5 } }).entries[key]).toEqual({
      plays: 5,
    });
  });

  it('round-trips through restore, position included', () => {
    const ledger = serializeMediaPlayLedger(
      plan,
      { [key]: { plays: 1, at: 12.5 } },
      { savedAt: '2026-01-01T00:00:00.000Z' },
    );

    expect(ledger.entries[key]).toEqual({ plays: 1, at: 12.5 });
    expect(restoreMediaPlayLedger(plan, ledger)).toEqual(ledger);
  });

  it('carries savedAt only when the caller supplies one (the SDK reads no clock)', () => {
    expect(
      serializeMediaPlayLedger(plan, {}, { savedAt: '2026-01-01T00:00:00.000Z' }).savedAt,
    ).toBe('2026-01-01T00:00:00.000Z');
    expect(Object.hasOwn(serializeMediaPlayLedger(plan, {}), 'savedAt')).toBe(false);
  });

  it('refuses a ledger from a different paper', () => {
    // Budget keys are short and repeat across papers (`slot:0`, `stimulus:1`),
    // so a foreign ledger would hold a learner to a budget from an exam they
    // never sat, and look entirely plausible doing it.
    const foreign = { ...serializeMediaPlayLedger(plan, {}), planHash: 'ffffffffffffffff' };
    expect(() => restoreMediaPlayLedger(plan, foreign)).toThrow(/different paper/);
  });

  it('refuses a ledger version this build does not understand', () => {
    const future = {
      ...serializeMediaPlayLedger(plan, {}),
      ledgerVersion: '1.1',
    } as unknown as MediaPlayLedger;
    expect(() => restoreMediaPlayLedger(plan, future)).toThrow(/unsupported ledgerVersion "1\.1"/);
  });
});

describe('grade stability: a paper with no playback policy', () => {
  it('resolves to exactly the pre-0.8.0 behaviour', () => {
    expect(resolvePlaybackPolicy({ type: 'audio', url: RECORDING })).toEqual({
      controls: 'native',
      maxPlays: null,
      seek: 'allow',
      rate: 'allow',
      nativeControlHints: [],
    });
  });

  it('leaves the mediaBudgets key OFF the planned slot entirely', () => {
    // Not `undefined`, not `[]`: the serialized slot has to stay byte-identical
    // to what every pre-0.8.0 paper produced, or `planHash` moves under stored
    // attempts and every one of them reports as drift.
    const plan = planAttempt<Item>([item('q1', { type: 'audio', url: RECORDING })]);

    expect(Object.hasOwn(plan.slots[0], 'mediaBudgets')).toBe(false);
    expect(planMediaBudgets(plan)).toEqual({});
  });
});
