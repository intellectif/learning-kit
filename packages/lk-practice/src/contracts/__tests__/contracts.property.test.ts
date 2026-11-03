import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CandidateItem, CandidateProof, PracticeItem } from '../../types.js';
import {
  admitCandidate,
  checkCandidates,
  checkDecomposition,
  checkGradeResult,
  decompositionRequest,
  generationRequest,
} from '../index.js';
import { BASE, GOAL, OPTIONS } from './appendix.js';
import { compositeTarget, DAY, KIT, NOW, practice, state } from './fixtures.js';

const RUNS = { numRuns: 150 };
const target = compositeTarget();
const request = generationRequest(target, { graph: KIT, state, now: NOW }, { count: 6, seed: 'p' });

/** A proof: a complete one of each kind, an incomplete one, or none. */
const proofs: fc.Arbitrary<CandidateProof | undefined> = fc.constantFrom(
  undefined,
  { kind: 'executable', at: NOW, referencePassed: true, wrongSolutionsFailed: 2 },
  { kind: 'executable', at: NOW, referencePassed: false, wrongSolutionsFailed: 1 } as never,
  { kind: 'executable', at: NOW, referencePassed: true, wrongSolutionsFailed: 0 },
  { kind: 'reviewed', at: NOW, reviewerId: 'r1' },
  { kind: 'model-checked', at: NOW, model: 'm', agreed: true },
);

/** A generated candidate for the composite target, valid or not, with a proof or none. */
const drafts = fc.record({
  weight: fc.double({ min: 0.5, max: 0.9, noNaN: true }),
  offset: fc.double({ min: -0.6, max: 0.6, noNaN: true }),
  criteria: fc.boolean(),
  stage: fc.constantFrom('complete', 'complete', 'write'),
  content: fc.jsonValue({ maxDepth: 2 }),
  proof: proofs,
  forge: fc.constantFrom('none', 'foreign-proof'),
});

describe('contracts', () => {
  it('property: an unproven item is never planned or recorded (generate, check, admit, plan, record)', () => {
    let planned = 0;
    let recorded = 0;
    fc.assert(
      fc.property(fc.array(drafts, { minLength: 1, maxLength: 6 }), (list) => {
        const raw = list.map((draft, i) => ({
          id: `c${i}`,
          skills: [
            { skillId: 'k', weight: draft.weight },
            { skillId: 'x', weight: 1 - draft.weight },
          ],
          stage: draft.stage,
          difficulty: request.target.targetDifficulty + draft.offset,
          ...(draft.criteria
            ? {
                criteria: [
                  { name: 'k1', skillId: 'k' },
                  { name: 'x1', skillId: 'x' },
                ],
              }
            : {}),
          content: { task: draft.content },
        }));
        const checked = checkCandidates(request, raw);
        expect(checked.accepted.length + checked.rejected.length).toBe(raw.length);
        const admitted = new Map<string, PracticeItem>();
        const unproven: PracticeItem[] = [];
        for (const candidate of checked.accepted) {
          const draft = list[Number(candidate.id.slice(1))] as (typeof list)[number];
          const result =
            draft.proof === undefined ? undefined : admitCandidate(candidate, draft.proof);
          if (result?.ok) {
            expect(result.item.status).toBe('proven');
            admitted.set(result.item.id, result.item);
          } else {
            unproven.push(forged(candidate, draft.forge));
          }
        }
        const pool = [...unproven, ...admitted.values()];
        const plan = practice.plan(state, KIT, {
          now: NOW,
          seed: 's',
          budget: {},
          dueBy: NOW + 60 * DAY,
          limits: { maxSkillsPerTarget: 3 },
          pool,
        });
        for (const planned_ of plan.targets) {
          if (planned_.item === undefined) continue;
          planned += 1;
          expect(admitted.has(planned_.item.itemId)).toBe(true);
        }
        for (const item of pool) {
          const result = practice.record(state, {
            graph: KIT,
            evidence: {
              id: `g-${item.id}`,
              itemId: item.id,
              at: NOW,
              source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
            },
            item,
          });
          if (admitted.has(item.id)) {
            expect(result.kind).toBe('applied');
            recorded += 1;
          } else {
            expect(result).toMatchObject({ kind: 'rejected' });
            const codes = result.kind === 'rejected' ? result.issues.map((i) => i.code) : [];
            expect(codes).toContain('ITEM_UNPROVEN');
          }
        }
      }),
      RUNS,
    );
    expect(planned).toBeGreaterThan(0);
    expect(recorded).toBeGreaterThan(0);
  });

  it('property: the checks are total (checkCandidates, checkGradeResult, checkDecomposition never throw)', () => {
    const decomposition = decompositionRequest(GOAL, BASE, OPTIONS);
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), fc.anything({ withSparseArray: true })), (raw) => {
        const candidates = checkCandidates(request, raw);
        if (Array.isArray(raw)) {
          expect(candidates.accepted.length + candidates.rejected.length).toBe(raw.length);
        }
        expect(Object.isFrozen(candidates)).toBe(true);
        expect(checkCandidates(request, [raw]).accepted).toHaveLength(0);
        expect(checkGradeResult(raw).ok).toBe(false);
        expect(checkDecomposition(decomposition, BASE, raw).ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * The candidate as a host might store it without a proof the engine accepts:
 * `unproven` (R9.3), or `proven` with a proof kind outside `acceptProofs`.
 */
function forged(candidate: CandidateItem, forge: string): PracticeItem {
  const { content: _content, ...item } = candidate;
  if (forge === 'foreign-proof') {
    return {
      ...item,
      status: 'proven',
      proof: { kind: 'model-checked', at: NOW, model: 'm', agreed: true },
    } as never;
  }
  return item;
}
