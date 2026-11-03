import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '../../config.js';
import { fnv1a64 } from '../../determinism/fnv.js';
import { deepFreeze } from '../../determinism/freeze.js';
import { createPractice } from '../../practice.js';
import { practiceStateSchema, reviewLogEntrySchema } from '../../schema/index.js';
import type {
  CandidateItem,
  CandidateProof,
  GenerationRequest,
  PracticeTarget,
  ResolvedPracticeConfig,
} from '../../types.js';
import { admitCandidate, checkCandidates, generationRequest } from '../index.js';
import { compositeTarget, DAY, KIT, NOW, practice, state, T0 } from './fixtures.js';

const composite = deepFreeze(compositeTarget());
const context = deepFreeze({ graph: KIT, state, now: NOW });
const options = { count: 3, seed: 'g' };

/** The composite widened to `w`, which has forms and lapsed, with avoid lists of its own. */
const wide: PracticeTarget = deepFreeze({
  ...composite,
  skillIds: ['k', 'w', 'x'],
  constraints: {
    ...composite.constraints,
    forms: ['cloze', 'short'],
    avoidItemIds: ['zz', 'e1-item'],
    avoidContentHashes: ['h2', 'h1', 'h2'],
  },
});

describe('generationRequest', () => {
  it('gives the target and per-skill facts, and no prompt (R9.1)', () => {
    const request = generationRequest(composite, context, options);
    expect(request).toEqual({
      version: 1,
      target: {
        id: composite.id,
        kind: 'review',
        stage: 'complete',
        targetDifficulty: composite.targetDifficulty,
        difficultyTolerance: 0.5,
        expectedSuccess: 0.85,
        expectedSeconds: 180,
        context: 'practice',
      },
      skills: [
        {
          id: 'k',
          role: 'primary',
          knowledge: 'procedural',
          ladder: ['complete', 'write'],
          stage: 'complete',
          expectedSuccess: expect.closeTo(0.85, 9),
          referenceDifficulty: 0,
          label: 'Kit',
        },
        {
          id: 'x',
          role: 'component',
          knowledge: 'declarative',
          ladder: ['recall', 'produce'],
          stage: 'recall',
          expectedSuccess: expect.any(Number),
          referenceDifficulty: 0,
        },
      ],
      needsSkillOutcomes: true,
      avoid: { itemIds: ['e1-item', 'e2-item', 'e3-item'], contentHashes: [] },
      learner: {
        recentLapses: [],
        weakest: [
          { skillId: 'k', theta: expect.any(Number) },
          { skillId: 'x', theta: expect.any(Number) },
        ],
      },
      count: 3,
      seed: 'g',
    });
    expect(Object.isFrozen(request.skills[0]?.ladder)).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/prompt/i);
  });

  it('gives forms, hints, lapses and the weakest first for a wider target', () => {
    const request = generationRequest(wide, context, options);
    const w = request.skills[1];
    expect(w).toEqual({
      id: 'w',
      role: 'component',
      knowledge: 'declarative',
      ladder: ['recall', 'produce'],
      stage: 'recall',
      forms: ['cloze', 'short'],
      expectedSuccess: expect.any(Number),
      referenceDifficulty: 0.25,
      criteriaHint: 'one check per part',
      label: 'W',
      description: 'The w part',
      tags: ['t1'],
    });
    expect(request.forms).toEqual(['cloze', 'short']);
    expect(request.avoid).toEqual({
      itemIds: ['e1-item', 'e2-item', 'e3-item', 'zz'],
      contentHashes: ['h1', 'h2'],
    });
    expect(request.learner.recentLapses).toEqual([{ skillId: 'w', at: T0 + 3 * DAY }]);
    expect(request.learner.weakest[0]?.skillId).toBe('w');
    const thetas = request.learner.weakest.map((entry) => entry.theta);
    expect(thetas).toEqual([...thetas].sort((a, b) => a - b));
    // A lapse is no longer recent once the window has passed, nor before it happened.
    const window = defaultConfig().planner.remediationWindowMs;
    const later = { ...context, now: T0 + 3 * DAY + window + 1 };
    expect(generationRequest(wide, later, options).learner.recentLapses).toEqual([]);
    const edge = { ...context, now: T0 + 3 * DAY + window };
    expect(generationRequest(wide, edge, options).learner.recentLapses).toHaveLength(1);
    const before = { ...context, now: T0 + 3 * DAY - 1 };
    expect(generationRequest(wide, before, options).learner.recentLapses).toEqual([]);
  });

  it('orders lapses newest first, then by skill id', () => {
    const lapsed = {
      ...state,
      skills: {
        ...state.skills,
        x: {
          ...(state.skills.x as NonNullable<(typeof state.skills)['x']>),
          lastLapseAt: T0 + 3 * DAY,
        },
        k: {
          ...(state.skills.k as NonNullable<(typeof state.skills)['k']>),
          lastLapseAt: T0 + 3.5 * DAY,
        },
      },
    };
    const request = generationRequest(wide, { ...context, state: lapsed }, options);
    expect(request.learner.recentLapses.map((lapse) => lapse.skillId)).toEqual(['k', 'w', 'x']);
  });

  it('adds the items used within the cooldown to the avoid list, sorted and unique', () => {
    const bare = { ...wide, constraints: { ...wide.constraints, avoidItemIds: [] } };
    const cooldown = defaultConfig().itemCooldownMs;
    const at = (now: number) => generationRequest(bare, { ...context, now }, options).avoid.itemIds;
    expect(at(T0 + 3 * DAY + cooldown - 1)).toContain('e2-item');
    expect(at(T0 + 3 * DAY + cooldown + DAY)).not.toContain('e2-item');
  });

  it('uses theta 0 facts for a skill with no state yet', () => {
    const fresh = practice.initState('l2', KIT);
    const request = generationRequest(wide, { ...context, state: fresh }, options);
    expect(request.learner.weakest.map((entry) => entry.skillId)).toEqual(['k', 'w', 'x']);
    expect(request.learner.recentLapses).toEqual([]);
    expect(request.avoid.itemIds).toEqual(['e1-item', 'zz']);
  });

  it('throws for a bad count or seed, an unknown skill, or no equivalent stage', () => {
    for (const count of [0, 21, 1.5, Number.NaN]) {
      expect(() => generationRequest(composite, context, { count, seed: 's' })).toThrow(TypeError);
    }
    expect(generationRequest(composite, context, { count: 20, seed: 's' }).count).toBe(20);
    expect(generationRequest(composite, context, { count: 1, seed: 's' }).count).toBe(1);
    expect(() => generationRequest(composite, context, { count: 1, seed: 1 as never })).toThrow(
      TypeError,
    );
    expect(() =>
      generationRequest({ ...composite, skillIds: ['k', 'nope'] }, context, options),
    ).toThrow(TypeError);
    expect(() => generationRequest({ ...composite, stage: 'transfer' }, context, options)).toThrow(
      RangeError,
    );
  });

  it('throws PracticeConfigError for a bad configuration or a mismatched state', () => {
    const named = expect.objectContaining({ name: 'PracticeConfigError' });
    expect(() => generationRequest(composite, context, options, { leechThreshold: 0 })).toThrow(
      named,
    );
    expect(() => generationRequest(composite, context, options, { leechThreshold: 3 })).toThrow(
      named,
    );
    expect(() =>
      generationRequest(composite, { ...context, graph: { ...KIT, version: 'k2' } }, options),
    ).toThrow(named);
  });
});

const request: GenerationRequest = generationRequest(wide, context, options);
const base = {
  id: 'c1',
  skills: [
    { skillId: 'k', weight: 0.5 },
    { skillId: 'w', weight: 0.25 },
    { skillId: 'x', weight: 0.25 },
  ],
  stage: 'complete',
  difficulty: wide.targetDifficulty,
  criteria: [
    { name: 'k1', skillId: 'k' },
    { name: 'w1', skillId: 'w' },
    { name: 'x1', skillId: 'x' },
  ],
  content: { prompt: 'fill the blanks' },
};

const codes = (candidates: unknown, req: GenerationRequest = request) =>
  checkCandidates(req, candidates).rejected.map(({ index, issues }) => [
    index,
    issues.map((issue) => `${issue.code}@${issue.path.join('.')}`),
  ]);

describe('checkCandidates', () => {
  it('accepts a candidate as a frozen unproven item with a content hash', () => {
    const content = { prompt: 'p', blanks: [1, 2] };
    const checked = checkCandidates(request, [
      deepFreeze({ ...base, content, expectedSeconds: 60, fluentSeconds: 20, slowSeconds: 90 }),
      { ...base, id: 'c2', content: 'other', contentHash: 'mine', form: 'cloze' },
    ]);
    expect(checked.rejected).toEqual([]);
    expect(checked.accepted).toEqual([
      {
        ...base,
        content,
        expectedSeconds: 60,
        fluentSeconds: 20,
        slowSeconds: 90,
        contentHash: fnv1a64(JSON.stringify({ blanks: [1, 2], prompt: 'p' })),
        origin: 'generated',
        status: 'unproven',
      },
      {
        ...base,
        id: 'c2',
        content: 'other',
        form: 'cloze',
        contentHash: 'mine',
        origin: 'generated',
        status: 'unproven',
      },
    ]);
    const first = checked.accepted[0] as CandidateItem;
    expect(first.content).toBe(content);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.skills[0])).toBe(true);
    expect(Object.isFrozen(first.criteria)).toBe(true);
    expect(Object.isFrozen(checked.accepted)).toBe(true);
  });

  it('accepts the edges of the difficulty range and of the weight sum', () => {
    const tolerance = request.target.difficultyTolerance;
    expect(
      codes([
        { ...base, id: 'lo', content: 1, difficulty: wide.targetDifficulty - tolerance },
        { ...base, id: 'hi', content: 2, difficulty: wide.targetDifficulty + tolerance },
        {
          ...base,
          id: 'sum',
          content: 3,
          skills: [
            { skillId: 'k', weight: 0.5 + 1e-10 },
            { skillId: 'w', weight: 0.25 },
            { skillId: 'x', weight: 0.25 },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('rejects a value that is not an array, once, at index -1', () => {
    expect(codes({})).toEqual([[-1, ['SHAPE_INVALID@']]]);
    expect(checkCandidates(request, null).accepted).toEqual([]);
  });

  it('rejects malformed candidates as SHAPE_INVALID and keeps going', () => {
    const result = codes([
      null,
      { ...base, difficulty: undefined },
      { ...base, skills: [] },
      { ...base, origin: 'authored' },
      { ...base, extra: 1 },
      { ...base, id: 'ok' },
    ]);
    expect(result.map(([index]) => index)).toEqual([0, 1, 2, 3, 4]);
    expect(
      result
        .flatMap(([, issues]) => issues as string[])
        .every((c) => c.startsWith('SHAPE_INVALID')),
    ).toBe(true);
  });

  it('rejects content with an array hole, which has no canonical JSON', () => {
    const sparse: unknown[] = [];
    sparse[1] = 1;
    expect(codes([{ ...base, content: { list: sparse } }])).toEqual([
      [0, ['SHAPE_INVALID@content.list.0']],
    ]);
  });

  it('rejects a candidate list or a skill list with a hole', () => {
    const list: unknown[] = [base];
    list.length = 2;
    expect(codes(list)).toEqual([[1, ['SHAPE_INVALID@']]]);
    const skills: unknown[] = [...base.skills];
    skills.length += 1;
    expect(codes([{ ...base, skills }])).toEqual([[0, ['SHAPE_INVALID@skills.3']]]);
  });

  it('rejects content that is not JSON', () => {
    expect(codes([{ ...base, content: { a: [1n] } }])).toEqual([
      [0, ['SHAPE_INVALID@content.a.0']],
    ]);
  });

  it.each([
    ['another stage', { stage: 'write' }, ['CANDIDATE_STAGE_MISMATCH@stage']],
    [
      'a skill outside the request',
      {
        skills: [
          { skillId: 'k', weight: 0.5 },
          { skillId: 'v', weight: 0.5 },
        ],
        criteria: [
          { name: 'k1', skillId: 'k' },
          { name: 'w1', skillId: 'w' },
          { name: 'x1', skillId: 'x' },
        ],
      },
      ['CANDIDATE_SKILL_NOT_ALLOWED@skills.1.skillId'],
    ],
    [
      'a skill listed twice',
      {
        skills: [
          { skillId: 'k', weight: 0.5 },
          { skillId: 'k', weight: 0.5 },
        ],
      },
      ['ID_DUPLICATE@skills.1.skillId'],
    ],
    [
      'a weight above 1, and weights that do not sum to 1',
      {
        skills: [
          { skillId: 'k', weight: 1.5 },
          { skillId: 'w', weight: 0 },
        ],
      },
      [
        'ITEM_WEIGHT_INVALID@skills.0.weight',
        'ITEM_WEIGHT_INVALID@skills.1.weight',
        'ITEM_WEIGHTS_SUM@skills',
      ],
    ],
    [
      'weights that sum to just above 1',
      {
        skills: [
          { skillId: 'k', weight: 0.5 + 1e-8 },
          { skillId: 'w', weight: 0.25 },
          { skillId: 'x', weight: 0.25 },
        ],
      },
      ['ITEM_WEIGHTS_SUM@skills'],
    ],
    [
      'another primary',
      {
        skills: [
          { skillId: 'k', weight: 0.25 },
          { skillId: 'w', weight: 0.5 },
          { skillId: 'x', weight: 0.25 },
        ],
      },
      ['CANDIDATE_PRIMARY_MISMATCH@skills'],
    ],
    [
      'a primary tie the target skill does not lead',
      {
        skills: [
          { skillId: 'w', weight: 0.5 },
          { skillId: 'k', weight: 0.5 },
        ],
      },
      ['CANDIDATE_PRIMARY_MISMATCH@skills'],
    ],
    [
      'a difficulty just out of range',
      { difficulty: wide.targetDifficulty + 0.5 + 1e-9 },
      ['CANDIDATE_DIFFICULTY_OUT_OF_RANGE@difficulty'],
    ],
    [
      'a difficulty just out of range below',
      { difficulty: wide.targetDifficulty - 0.5 - 1e-9 },
      ['CANDIDATE_DIFFICULTY_OUT_OF_RANGE@difficulty'],
    ],
    ['a form the request does not list', { form: 'essay' }, ['CANDIDATE_FORM_NOT_ALLOWED@form']],
    [
      'a criterion for a skill outside the request',
      {
        criteria: [
          { name: 'k1', skillId: 'k' },
          { name: 'w1', skillId: 'w' },
          { name: 'x1', skillId: 'x' },
          { name: 'v1', skillId: 'v' },
        ],
      },
      ['SKILL_NOT_IN_TASK@criteria.3.skillId'],
    ],
    [
      'a target skill no criterion binds',
      { criteria: [{ name: 'k1', skillId: 'k' }] },
      ['CANDIDATE_CRITERIA_MISSING@criteria', 'CANDIDATE_CRITERIA_MISSING@criteria'],
    ],
    [
      'no criteria',
      { criteria: undefined },
      [
        'CANDIDATE_CRITERIA_MISSING@criteria',
        'CANDIDATE_CRITERIA_MISSING@criteria',
        'CANDIDATE_CRITERIA_MISSING@criteria',
      ],
    ],
    [
      'fluentSeconds not below slowSeconds',
      { fluentSeconds: 30, slowSeconds: 30 },
      ['ITEM_TIMING_ORDER@fluentSeconds'],
    ],
    ['an avoided id', { id: 'e2-item' }, ['CANDIDATE_AVOIDED@id']],
    ['an avoided hash', { contentHash: 'h1' }, ['CANDIDATE_AVOIDED@contentHash']],
  ])('rejects %s', (_name, change, expected) => {
    const candidate = Object.fromEntries(
      Object.entries({ ...base, ...change }).filter(([, value]) => value !== undefined),
    );
    expect(codes([candidate])).toEqual([[0, expected]]);
  });

  it('accepts one-sided timings, any form when the request lists none, and no criteria when none are needed', () => {
    const single = generationRequest(
      {
        ...composite,
        skillIds: ['k'],
        constraints: { ...composite.constraints, needsSkillOutcomes: false },
      },
      context,
      options,
    );
    expect(single.forms).toBeUndefined();
    expect(
      codes(
        [
          {
            id: 'solo',
            skills: [{ skillId: 'k', weight: 1 }],
            stage: 'complete',
            difficulty: composite.targetDifficulty,
            content: null,
            form: 'anything',
            fluentSeconds: 10,
          },
          {
            id: 'solo2',
            skills: [{ skillId: 'k', weight: 1 }],
            stage: 'complete',
            difficulty: composite.targetDifficulty,
            content: 2,
            slowSeconds: 10,
          },
        ],
        single,
      ),
    ).toEqual([]);
    const empty = { ...single, forms: [] };
    expect(
      codes(
        [{ ...base, id: 'f', skills: [{ skillId: 'k', weight: 1 }], form: 'x', criteria: [] }],
        empty,
      ),
    ).toEqual([]);
  });

  it('rejects a skill whose request stage is not in its ladder', () => {
    const broken = deepFreeze({
      ...request,
      skills: request.skills.map((skill) =>
        skill.id === 'x' ? { ...skill, stage: 'write' } : skill,
      ),
    });
    expect(codes([base], broken)).toEqual([[0, ['STAGE_NO_EQUIVALENT@skills.2']]]);
  });

  it('rejects a later duplicate id or content in the batch', () => {
    expect(
      codes([
        base,
        { ...base, content: 'other' },
        { ...base, id: 'c3' },
        { ...base, id: 'c4', content: 'x', contentHash: fnv1a64(JSON.stringify(base.content)) },
      ]),
    ).toEqual([
      [1, ['ID_DUPLICATE@id']],
      [2, ['CANDIDATE_CONTENT_DUPLICATE@contentHash']],
      [3, ['CANDIDATE_CONTENT_DUPLICATE@contentHash']],
    ]);
  });

  it('does not count a rejected candidate as seen', () => {
    expect(codes([{ ...base, stage: 'write' }, base])).toEqual([
      [0, ['CANDIDATE_STAGE_MISMATCH@stage']],
    ]);
  });
});

const candidate = checkCandidates(request, [base]).accepted[0] as CandidateItem;
const executable: CandidateProof = deepFreeze({
  kind: 'executable',
  at: NOW,
  referencePassed: true,
  wrongSolutionsFailed: 1,
  runner: 'pytest',
});

function config(overrides: object): ResolvedPracticeConfig {
  const resolved = resolveConfig(overrides);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
  return resolved.value;
}

const admitCodes = (...args: Parameters<typeof admitCandidate>) => {
  const result = admitCandidate(...args);
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
};

describe('admitCandidate', () => {
  it('promotes a candidate to a proven item without its content', () => {
    const result = admitCandidate(candidate, executable);
    const { content: _content, ...rest } = candidate;
    expect(result).toEqual({
      ok: true,
      item: { ...rest, origin: 'generated', status: 'proven', proof: executable },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.item.proof)).toBe(true);
    expect(result.item.proof).not.toBe(executable);
    expect(Object.isFrozen(result.item.skills[0])).toBe(true);
  });

  it('promotes without criteria and with a reviewed proof', () => {
    const { criteria: _criteria, ...bare } = candidate;
    const reviewed = { kind: 'reviewed', at: NOW, reviewerId: 'r1' } as const;
    const result = admitCandidate(bare as CandidateItem, reviewed);
    expect(result.ok && result.item.criteria).toBe(undefined);
    expect(result.ok && result.item.proof).toEqual(reviewed);
  });

  it('accepts a model-checked proof only where the configuration allows it', () => {
    const checked = { kind: 'model-checked', at: NOW, model: 'm', agreed: true } as const;
    expect(admitCodes(candidate, checked)).toEqual(['PROOF_NOT_ACCEPTED@proof.kind']);
    const allowing = config({ acceptProofs: ['executable', 'reviewed', 'model-checked'] });
    expect(admitCodes(candidate, checked, allowing)).toEqual([]);
    expect(admitCodes(candidate, { ...checked, agreed: false } as never, allowing)).toEqual([
      'PROOF_INCOMPLETE@proof.agreed',
    ]);
    expect(admitCodes(candidate, executable, config({ acceptProofs: ['reviewed'] }))).toEqual([
      'PROOF_NOT_ACCEPTED@proof.kind',
    ]);
  });

  it('needs the reference to pass and a wrong solution to fail', () => {
    expect(
      admitCodes(candidate, {
        ...executable,
        referencePassed: false,
        wrongSolutionsFailed: 0,
      } as never),
    ).toEqual([
      'PROOF_INCOMPLETE@proof.referencePassed',
      'PROOF_INCOMPLETE@proof.wrongSolutionsFailed',
    ]);
  });

  it('rejects a malformed candidate or proof under its own path', () => {
    const issues = admitCodes(
      { ...candidate, status: 'proven' } as never,
      { kind: 'guess', at: 0 } as never,
    );
    expect(issues.length).toBeGreaterThan(1);
    expect(issues.every((code) => code.startsWith('SHAPE_INVALID@'))).toBe(true);
    expect(issues.some((code) => code.startsWith('SHAPE_INVALID@candidate'))).toBe(true);
    expect(issues.some((code) => code.startsWith('SHAPE_INVALID@proof'))).toBe(true);
    expect(admitCodes(null as never, null as never).length).toBe(2);
  });

  it('records a model-checked item where allowed, and its log replays and validates', () => {
    const kinds = ['executable', 'reviewed', 'model-checked'] as const;
    const allowing = createPractice({ acceptProofs: kinds });
    const checked = { kind: 'model-checked', at: NOW, model: 'm', agreed: true } as const;
    const result = admitCandidate(candidate, checked, config({ acceptProofs: kinds }));
    if (!result.ok) throw new Error('not admitted');
    const start = allowing.initState('l1', KIT);
    const recorded = allowing.record(start, {
      graph: KIT,
      evidence: {
        id: 'g1',
        itemId: candidate.id,
        at: NOW,
        source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
      },
      item: result.item,
    });
    if (recorded.kind !== 'applied') throw new Error(recorded.kind);
    const entry = recorded.appended[0];
    expect(entry?.kind === 'evidence' && entry.task?.proofKind).toBe('model-checked');
    expect(reviewLogEntrySchema['~standard'].validate(entry)).toEqual({ value: entry });
    expect(allowing.replay(recorded.appended, KIT, 'l1').ok).toBe(true);
    expect(practiceStateSchema['~standard'].validate(recorded.state)).toEqual({
      value: recorded.state,
    });
  });

  it('trusts the status a host stores: a generated item marked proven without a proof is recorded', () => {
    const { content: _content, ...item } = candidate;
    const recorded = practice.record(state, {
      graph: KIT,
      evidence: {
        id: 'g1',
        itemId: candidate.id,
        at: NOW,
        source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
      },
      item: { ...item, status: 'proven' },
    });
    expect(recorded.kind).toBe('applied');
  });

  it('gives an item record accepts, while the unproven candidate is refused', () => {
    const result = admitCandidate(candidate, executable);
    if (!result.ok) throw new Error('not admitted');
    const evidence = {
      id: 'g1',
      itemId: candidate.id,
      at: NOW,
      source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
    } as const;
    const recorded = practice.record(state, { graph: KIT, evidence, item: result.item });
    expect(recorded.kind).toBe('applied');
    const { content: _content, ...unproven } = candidate;
    const refused = practice.record(state, { graph: KIT, evidence, item: unproven });
    expect(refused).toMatchObject({ kind: 'rejected', issues: [{ code: 'ITEM_UNPROVEN' }] });
  });
});
