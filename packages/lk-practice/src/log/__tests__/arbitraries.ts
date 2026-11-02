/** fast-check generators of record and act steps over the fixture graph. */

import fc from 'fast-check';
import type { Evidence, EvidenceSource, HostAction, ReviewLogEntry } from '../../types.js';
import { DAY, evidence, fail, host, human, item, lowAi, pass, type Step, T0 } from './fixtures.js';

type Context = 'practice' | 'exam' | 'diagnostic' | 'pretest';

const heldSources: fc.Arbitrary<EvidenceSource> = fc.constantFrom<EvidenceSource>(
  lowAi,
  { kind: 'pending', reason: 'deferred' },
  {
    kind: 'ai',
    score: 1,
    maxScore: 1,
    passed: true,
    confidence: 'high',
    requiresHumanReview: true,
  },
);

const sources: fc.Arbitrary<EvidenceSource> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(pass, fail) },
  { weight: 1, arbitrary: heldSources },
  { weight: 1, arbitrary: fc.constant<EvidenceSource>({ kind: 'exposure' }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom<EvidenceSource>(
      { kind: 'self', rating: 'again' },
      { kind: 'self', rating: 'hard' },
      { kind: 'self', rating: 'good' },
      { kind: 'self', rating: 'easy' },
    ),
  },
  {
    weight: 2,
    arbitrary: fc
      .integer({ min: 0, max: 4 })
      .map((score): EvidenceSource => ({ kind: 'auto', score, maxScore: 4, passed: score >= 3 })),
  },
);

interface EvidenceDraft {
  readonly kind: 'evidence';
  readonly skill: 'a' | 'b' | 'c';
  readonly stage: string;
  readonly source: EvidenceSource;
  readonly item: number;
  readonly sure: boolean;
  readonly attempts: number;
  readonly durationMs: number | null;
  readonly context: Context;
}

/** One step before ids and instants are fixed. */
type Draft =
  | EvidenceDraft
  | { readonly kind: 'confirm'; readonly target: number; readonly passed: boolean }
  | { readonly kind: 'host'; readonly action: HostAction | 'discard' };

const skillStage = fc.oneof(
  fc.record({
    skill: fc.constantFrom<'a' | 'b'>('a', 'b'),
    stage: fc.constantFrom('recall', 'produce'),
  }),
  fc.record({
    skill: fc.constant<'c'>('c'),
    stage: fc.constantFrom('recognise', 'recall', 'produce', 'apply'),
  }),
);

const hostActions: fc.Arbitrary<HostAction | 'discard'> = fc.oneof(
  fc.constant<'discard'>('discard'),
  fc.record({
    kind: fc.constant<'prior'>('prior'),
    skillId: fc.constantFrom('a', 'b', 'c'),
    theta: fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
    pseudoCount: fc.integer({ min: 0, max: 5 }),
  }),
  fc.record({
    kind: fc.constant<'place'>('place'),
    skillId: fc.constantFrom('a', 'b'),
    stage: fc.constantFrom('recall', 'produce'),
    credited: fc.boolean(),
  }),
  fc.record({
    kind: fc.constantFrom<'suspend' | 'unsuspend' | 'reset-skill'>(
      'suspend',
      'unsuspend',
      'reset-skill',
    ),
    skillId: fc.constantFrom('a', 'b', 'c'),
  }),
);

const evidenceDrafts: fc.Arbitrary<EvidenceDraft> = fc
  .record({
    kind: fc.constant<'evidence'>('evidence'),
    source: sources,
    item: fc.integer({ min: 0, max: 5 }),
    sure: fc.boolean(),
    attempts: fc.integer({ min: 1, max: 3 }),
    durationMs: fc.option(fc.integer({ min: 1000, max: 120_000 })),
    context: fc.constantFrom<Context>(
      'practice',
      'practice',
      'practice',
      'exam',
      'diagnostic',
      'pretest',
    ),
  })
  .chain((base) => skillStage.map((target) => ({ ...base, ...target })));

const drafts: fc.Arbitrary<Draft> = fc.oneof(
  { weight: 6, arbitrary: evidenceDrafts },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant<'confirm'>('confirm'),
      target: fc.nat(),
      passed: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant<'host'>('host'), action: hostActions }) },
);

export interface StepOptions {
  /** Gaps may be negative: evidence that arrives late. */
  readonly late?: boolean;
  /** Only evidence and host actions that need no earlier entry. */
  readonly independent?: boolean;
  /** Strictly increasing instants. */
  readonly distinct?: boolean;
  readonly maxLength?: number;
}

/** The evidence of earlier steps that the built-in mapper holds. */
function heldCandidates(list: readonly Step[]): Evidence[] {
  return list.flatMap((step) => {
    if (!('evidence' in step) || step.evidence.confirms !== undefined) return [];
    const { source } = step.evidence;
    const held =
      source.kind === 'pending' ||
      (source.kind === 'ai' &&
        (source.confidence === 'low' || source.requiresHumanReview === true));
    return held ? [step.evidence] : [];
  });
}

function evidenceStep(draft: EvidenceDraft, id: string, at: number): Step {
  const itemId = `i${draft.item}-${draft.skill}-${draft.stage}`;
  return {
    evidence: evidence(id, itemId, at, draft.source, {
      ...(draft.sure ? { learnerConfidence: 'sure' as const } : {}),
      ...(draft.attempts > 1 ? { attempts: draft.attempts } : {}),
      ...(draft.durationMs === null ? {} : { durationMs: draft.durationMs }),
      ...(draft.context === 'practice' ? {} : { context: draft.context }),
    }),
    item: item(itemId, draft.skill, draft.stage, { fluentSeconds: 10, slowSeconds: 60 }),
  };
}

/** Steps with unique ids `s0`, `s1`, ...; confirmations and discards target earlier held evidence. */
export function steps(options: StepOptions = {}): fc.Arbitrary<Step[]> {
  const min = options.distinct ? 1 : 0;
  const gap = options.late
    ? fc.oneof(
        { weight: 4, arbitrary: fc.integer({ min, max: 3 * DAY }) },
        { weight: 1, arbitrary: fc.integer({ min: -3 * DAY, max: -1 }) },
      )
    : fc.integer({ min, max: 3 * DAY });
  const kinds = options.independent
    ? drafts.filter(
        (d) =>
          (d.kind === 'evidence' && d.source.kind !== 'pending' && d.source !== lowAi) ||
          (d.kind === 'host' && d.action !== 'discard'),
      )
    : drafts;
  return fc
    .array(fc.tuple(kinds, gap), { minLength: 1, maxLength: options.maxLength ?? 25 })
    .map((list) => {
      let at = T0;
      const out: Step[] = [];
      list.forEach(([draft, delta], i) => {
        at += delta;
        const id = `s${i}`;
        if (draft.kind === 'evidence') {
          out.push(evidenceStep(draft, id, at));
          return;
        }
        const held = heldCandidates(out);
        if (draft.kind === 'confirm') {
          const target = held.length === 0 ? undefined : held[draft.target % held.length];
          out.push({
            evidence: evidence(id, target?.itemId ?? 'i0', at, human(draft.passed), {
              confirms: target?.id ?? 'none',
            }),
          });
        } else if (draft.action === 'discard') {
          const target = held.length === 0 ? 'none' : (held[i % held.length] as Evidence).id;
          out.push({ host: host(id, at, { kind: 'discard-held', evidenceId: target }) });
        } else {
          out.push({ host: host(id, at, draft.action) });
        }
      });
      return out;
    });
}

/** The entries in a random array order. */
export function shuffled(entries: readonly ReviewLogEntry[]): fc.Arbitrary<ReviewLogEntry[]> {
  return fc.shuffledSubarray([...entries], {
    minLength: entries.length,
    maxLength: entries.length,
  });
}
