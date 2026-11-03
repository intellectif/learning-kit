// Writes vectors/contracts.json (criteria 11 and 12, design 8.8, 8.9; revised
// in M7). The cases are chosen by hand: the Appendix A decomposition, kept
// generic (a fictional `llm_client` and the ids `llm.call.*`, `py.imports`
// and `py.kwargs`), admitted and composed, after which the old state is
// refused and a full replay rebuilds it; the rejection of an extension edge
// into a base skill and of a cycle; the per-skill facts of a generation
// request (R9.1), its recent lapses and weakest skills; the candidate checks; the proof gate, with an executable
// proof whose starter fails and whose solution passes; that an unproven item
// is never recorded; the grader output checks; and the guards on each
// request's inputs. The expected values are
// recorded from src/ through vectors/replay.mjs, so the file pins the current
// behaviour; the unit tests check the same rules by hand. Run with
// `pnpm vectors:contracts`, then review the diff: a changed outcome is a
// behaviour change and needs a version (D26).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_VERSION, record } from '../vectors/replay.mjs';
import { loadSrc, PACKAGE } from './load-src.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);

const impl = await loadSrc('contracts-vectors');

// ─── Decomposition: Appendix A (the same data as src/contracts/__tests__/appendix.ts) ───

const BASE = {
  version: 'py1',
  skills: [
    { id: 'py.basics', knowledge: 'procedural', label: 'Python basics' },
    { id: 'py.imports', knowledge: 'procedural', label: 'Imports' },
    { id: 'py.kwargs', knowledge: 'procedural', label: 'Keyword arguments' },
    { id: 'py.classes', knowledge: 'procedural' },
    { id: 'py.decorators', knowledge: 'procedural' },
    { id: 'py.async', knowledge: 'procedural' },
  ],
  edges: [
    { kind: 'prerequisite', from: 'py.basics', to: 'py.imports', strength: 'hard' },
    { kind: 'prerequisite', from: 'py.basics', to: 'py.kwargs', strength: 'hard' },
    { kind: 'prerequisite', from: 'py.kwargs', to: 'py.classes', strength: 'soft' },
    { kind: 'prerequisite', from: 'py.classes', to: 'py.decorators', strength: 'soft' },
    { kind: 'prerequisite', from: 'py.decorators', to: 'py.async', strength: 'soft' },
  ],
};

const GOAL = {
  id: 'goal.llm-call',
  text: 'Write an LLM chat-model call in Python from memory',
  anchorSkillIds: ['py.imports', 'py.kwargs'],
};

const COMPONENTS = [
  'llm.call.import',
  'llm.call.model-id',
  'llm.call.temperature',
  'llm.call.max-tokens',
  'llm.call.retries',
  'llm.call.messages',
  'llm.call.invoke',
];

const node = (id, label) => ({ id, knowledge: 'procedural', label });

const SKILLS = [
  node('llm.call', 'The whole call: build a model, send messages, read the reply'),
  node('llm.call.import', 'from llm_client import ChatModel'),
  node('llm.call.model-id', 'The "provider:model-name" string'),
  node('llm.call.temperature', 'temperature, and why 0 makes output (near) deterministic'),
  node('llm.call.max-tokens', 'max_tokens caps the reply length'),
  node('llm.call.retries', 'max_retries for transient provider errors'),
  node('llm.call.messages', 'A list of (role, text) messages'),
  node('llm.call.invoke', '.invoke(...) and response.content'),
];

const KWARGS = ['llm.call.temperature', 'llm.call.max-tokens', 'llm.call.retries'];

const EDGES = [
  ...COMPONENTS.map((to) => ({ kind: 'encompasses', from: 'llm.call', to, weight: 0.5 })),
  { kind: 'prerequisite', from: 'py.imports', to: 'llm.call.import', strength: 'hard' },
  ...KWARGS.map((to) => ({ kind: 'prerequisite', from: 'py.kwargs', to, strength: 'hard' })),
  ...COMPONENTS.map((from) => ({ kind: 'prerequisite', from, to: 'llm.call', strength: 'soft' })),
];

const PROPOSAL = { skills: SKILLS, edges: EDGES };
const OPTIONS = { idPrefix: 'llm.call', maxSkills: 8, seed: GOAL.id };
const LEARNER = { by: 'learner', at: T0 };

const pass = { kind: 'auto', score: 1, maxScore: 1, passed: true };
const fail = { kind: 'auto', score: 0, maxScore: 1, passed: false };

const decompose = (name, proposal, fields = {}) => ({
  kind: 'decompose',
  name,
  learnerId: 'l1',
  graphs: { main: BASE },
  goal: GOAL,
  options: OPTIONS,
  proposal,
  approval: LEARNER,
  ...fields,
});

/** A learner who has seen `py.imports` once on the base graph. */
const baseSteps = [
  {
    evidence: { id: 'b1', itemId: 'b1-item', at: T0, source: pass },
    item: {
      id: 'b1-item',
      skills: [{ skillId: 'py.imports', weight: 1 }],
      stage: 'example',
      origin: 'authored',
      status: 'proven',
    },
  },
];
const afterAdmission = {
  evidence: { id: 'b2', itemId: 'b1-item', at: T0 + DAY, source: pass },
  item: baseSteps[0].item,
};

const decompositions = [
  decompose('appendix A: the llm call goal is accepted, admitted and composed', PROPOSAL),
  decompose(
    'appendix A: a graph change refuses the old state, and a full replay rebuilds it',
    PROPOSAL,
    { steps: baseSteps, after: afterAdmission },
  ),
  decompose('appendix A: a human approval when learners may not approve', PROPOSAL, {
    approval: { by: 'human', at: T0, approverId: 'h1' },
    admit: { allowLearner: false },
  }),
  decompose('appendix A: a learner approval when learners may not approve', PROPOSAL, {
    admit: { allowLearner: false },
  }),
  decompose('an extension edge into a base skill is rejected', {
    skills: SKILLS,
    edges: [
      ...EDGES,
      { kind: 'prerequisite', from: 'llm.call.import', to: 'py.imports', strength: 'soft' },
    ],
  }),
  decompose('a cycle among the extension skills is rejected', {
    skills: SKILLS,
    edges: [
      ...EDGES,
      { kind: 'prerequisite', from: 'llm.call', to: 'llm.call.import', strength: 'hard' },
    ],
  }),
  decompose('more skills than maxSkills are rejected', {
    skills: [...SKILLS, node('llm.call.stream', 'stream=True yields chunks')],
    edges: [
      ...EDGES,
      { kind: 'prerequisite', from: 'llm.call.stream', to: 'llm.call', strength: 'soft' },
    ],
  }),
  decompose('a skill outside the prefix is rejected', {
    skills: [...SKILLS.slice(0, 7), node('other.skill', 'Outside the prefix')],
    edges: [
      ...EDGES.filter((edge) => edge.from !== 'llm.call.invoke' && edge.to !== 'llm.call.invoke'),
      { kind: 'prerequisite', from: 'other.skill', to: 'llm.call', strength: 'soft' },
    ],
  }),
  decompose('a repeated skill id is rejected', {
    skills: [...SKILLS.slice(0, 7), node('llm.call.import', 'Again')],
    edges: EDGES.filter((edge) => edge.from !== 'llm.call.invoke' && edge.to !== 'llm.call.invoke'),
  }),
  decompose('a skill connected to nothing is rejected', {
    skills: [...SKILLS.slice(0, 7), node('llm.call.orphan', 'Connected to nothing')],
    edges: EDGES.filter((edge) => edge.from !== 'llm.call.invoke' && edge.to !== 'llm.call.invoke'),
  }),
  decompose(
    'declarative knowledge where only procedural is allowed is rejected',
    {
      skills: SKILLS.map((skill, index) =>
        index === 1 ? { ...skill, knowledge: 'declarative' } : skill,
      ),
      edges: EDGES,
    },
    { options: { ...OPTIONS, knowledge: ['procedural'] } },
  ),
  decompose('a proposal that is not an object is a shape issue', 'skills'),
  decompose('one anchor reaches every proposed skill through the base graph', PROPOSAL, {
    goal: { ...GOAL, anchorSkillIds: ['py.imports'] },
  }),
  decompose('an empty ladder on the first proposed skill fails the union, on the proposal path', {
    skills: SKILLS.map((skill, index) => (index === 0 ? { ...skill, stages: [] } : skill)),
    edges: EDGES,
  }),
  decompose('a malformed approval is a shape issue alone, before the learner rule', PROPOSAL, {
    approval: { by: 'learner', at: 'now' },
    admit: { allowLearner: false },
  }),
  decompose('maxSkills 1 is a request, which eight skills exceed', PROPOSAL, {
    options: { ...OPTIONS, maxSkills: 1 },
  }),
  decompose('a request whose anchors are not in the graph throws', PROPOSAL, {
    goal: { ...GOAL, anchorSkillIds: ['py.nothing'] },
  }),
  decompose('a request without anchors throws', PROPOSAL, {
    goal: { ...GOAL, anchorSkillIds: [] },
  }),
  decompose('a request with an empty idPrefix throws', PROPOSAL, {
    options: { ...OPTIONS, idPrefix: '' },
  }),
  decompose('a request for maxSkills 0 throws', PROPOSAL, {
    options: { ...OPTIONS, maxSkills: 0 },
  }),
  decompose('a request for an unknown knowledge type throws', PROPOSAL, {
    options: { ...OPTIONS, knowledge: ['tacit'] },
  }),
  decompose('a request without a seed throws', PROPOSAL, {
    options: { idPrefix: OPTIONS.idPrefix, maxSkills: OPTIONS.maxSkills },
  }),
];

// ─── Generation and the proof gate: a composite target over a kit ───

/** `k` encompasses `w` and `x`, which both need `v`; `w` has forms and hints. */
const KIT = {
  version: 'k1',
  skills: [
    { id: 'k', knowledge: 'procedural', stages: ['complete', 'write'], label: 'Kit' },
    {
      id: 'w',
      knowledge: 'declarative',
      stages: ['recall', 'produce'],
      forms: { recall: ['cloze'] },
      criteriaHint: 'one check per part',
      label: 'W',
      description: 'The w part',
      tags: ['t1'],
      referenceDifficulty: 0.25,
    },
    { id: 'x', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'v', knowledge: 'declarative', stages: ['recall', 'produce'] },
  ],
  edges: [
    { kind: 'prerequisite', from: 'w', to: 'k', strength: 'soft' },
    { kind: 'prerequisite', from: 'x', to: 'k', strength: 'soft' },
    { kind: 'encompasses', from: 'k', to: 'w', weight: 0.5 },
    { kind: 'encompasses', from: 'k', to: 'x', weight: 0.5 },
  ],
};

const item = (id, skillId, stage) => ({
  id,
  skills: [{ skillId, weight: 1 }],
  stage,
  origin: 'authored',
  status: 'proven',
});
const review = (id, skillId, stage, at, source = pass) => ({
  evidence: { id, itemId: `${id}-item`, at, source },
  item: item(`${id}-item`, skillId, stage),
});

/** `k` is overdue at `NOW`; `w` lapsed a day before it, `x` passed. */
const kitSteps = [
  review('e1', 'k', 'complete', T0),
  review('e2', 'w', 'recall', T0 + 3 * DAY, fail),
  review('e3', 'x', 'recall', T0 + 3 * DAY),
];
const HOUR = 3_600_000;
/** Then `k` lapses, and `x` after it: two recent lapses whose times and ids order apart. */
const lapseSteps = [
  ...kitSteps,
  review('e4', 'k', 'complete', T0 + 3 * DAY + 6 * HOUR, fail),
  review('e5', 'x', 'recall', T0 + 3 * DAY + 12 * HOUR, fail),
];
const NOW = T0 + 4 * DAY;
const at = (now) => ({
  now,
  seed: 's',
  budget: {},
  dueBy: now + 60 * DAY,
  limits: { maxSkillsPerTarget: 3 },
});
const REQUEST = at(NOW);

/** The target `generate` vectors plan for `skillId`, so candidates can sit at its difficulty. */
function plannedTarget(skillId) {
  const practice = impl.createPractice({});
  let state = practice.initState('l1', KIT);
  for (const step of kitSteps) {
    const result = practice.record(state, { graph: KIT, ...step });
    if (result.kind !== 'applied') throw new Error(`plannedTarget: ${result.kind}`);
    state = result.state;
  }
  const found = practice.plan(state, KIT, REQUEST).targets.find((t) => t.skillIds[0] === skillId);
  if (found === undefined) throw new Error(`plannedTarget: no target for ${skillId}`);
  return found;
}
/** `k` with its component `x`. */
const target = plannedTarget('k');
/** `w` alone, after its lapse: its only form is `cloze`, and one outcome is enough. */
const wTarget = plannedTarget('w');

/** A Python completion task over `k` and `x`; the solution and starter are the host's to run. */
const candidate = (id, extra = {}, variant = id) => ({
  id,
  skills: [
    { skillId: 'k', weight: 0.5 },
    { skillId: 'x', weight: 0.5 },
  ],
  stage: 'complete',
  difficulty: target.targetDifficulty,
  criteria: [
    { name: 'k1', skillId: 'k' },
    { name: 'x1', skillId: 'x' },
  ],
  content: {
    prompt: `Complete the call so it returns the reply text (${variant}).`,
    starter: 'def reply(model, text):\n    return None\n',
    solution: 'def reply(model, text):\n    return model.invoke(text).content\n',
    tests: 'assert reply(Echo(), "hi") == "hi"\n',
  },
  ...extra,
});

/** A cloze over `w` for the `w` target; `extra` adds a form. */
const wCandidate = (id, extra = {}) => ({
  id,
  skills: [{ skillId: 'w', weight: 1 }],
  stage: 'recall',
  difficulty: wTarget.targetDifficulty,
  content: { text: `The w part is ___ (${id}).`, answer: 'w' },
  ...extra,
});
const REVIEWED = { kind: 'reviewed', at: NOW, reviewerId: 'r1' };

/** The host ran the tests: the starter fails them and the solution passes them. */
const EXECUTABLE = {
  kind: 'executable',
  at: NOW,
  referencePassed: true,
  wrongSolutionsFailed: 1,
  runner: 'pytest',
};
const ANSWER = {
  id: 'g1',
  at: NOW + 1000,
  source: pass,
  skillOutcomes: [
    { skillId: 'k', score: 1, maxScore: 1 },
    { skillId: 'x', score: 1, maxScore: 1 },
  ],
};

const generate = (name, candidates, proofs, fields = {}) => ({
  kind: 'generate',
  name,
  learnerId: 'l1',
  graphs: { main: KIT },
  steps: kitSteps,
  request: REQUEST,
  targetSkill: 'k',
  options: { count: 3, seed: 'g' },
  candidates,
  proofs,
  evidence: ANSWER,
  ...fields,
});

const generations = [
  generate(
    'R9.1 facts; an executable proof (starter fails, solution passes) admits; unproven items are refused',
    [candidate('c1'), candidate('c2', { content: { prompt: 'Name the reply field.' } })],
    [{ index: 0, proof: EXECUTABLE }],
  ),
  generate(
    'an executable proof whose solution fails, or whose starter passes, is incomplete',
    [candidate('c1')],
    [
      { index: 0, proof: { ...EXECUTABLE, referencePassed: false } },
      { index: 0, proof: { ...EXECUTABLE, wrongSolutionsFailed: 0 } },
      { index: 0, proof: { kind: 'reviewed', at: NOW, reviewerId: 'r1' } },
      { index: 0, proof: { kind: 'model-checked', at: NOW, model: 'm', agreed: true } },
    ],
  ),
  generate(
    'a model-checked proof admits where the configuration accepts it',
    [candidate('c1')],
    [
      { index: 0, proof: { kind: 'model-checked', at: NOW, model: 'm', agreed: true } },
      { index: 0, proof: { kind: 'model-checked', at: NOW, model: 'm', agreed: false } },
    ],
    { config: { acceptProofs: ['executable', 'reviewed', 'model-checked'] } },
  ),
  generate(
    'candidate checks: criteria, skills, stage, difficulty (at the tolerance too), weights, timing, a form where none is listed, and duplicates',
    [
      candidate('c1'),
      candidate('c2', { criteria: [{ name: 'k1', skillId: 'k' }] }),
      candidate('c3', { criteria: undefined }),
      candidate('c4', { skills: [{ skillId: 'v', weight: 1 }] }),
      candidate('c5', { stage: 'write' }),
      candidate('c6', { difficulty: target.targetDifficulty + 10 }),
      candidate('c7', {
        skills: [
          { skillId: 'k', weight: 0.5 },
          { skillId: 'x', weight: 0.25 },
        ],
      }),
      candidate('c1', { content: 'another' }),
      candidate('c8', {}, 'c1'),
      { id: 'c9' },
      'not a candidate',
      candidate('c10', {
        skills: [
          { skillId: 'k', weight: 1 },
          { skillId: 'x', weight: 0 },
        ],
      }),
      candidate('c11', { difficulty: target.targetDifficulty + target.difficultyTolerance }),
      candidate('c12', { fluentSeconds: 5, slowSeconds: 10 }),
      candidate('c13', { fluentSeconds: 10, slowSeconds: 10 }),
      candidate('c14', { fluentSeconds: 10, slowSeconds: 5 }),
      candidate('c15', { fluentSeconds: 5 }),
      candidate('c16', { slowSeconds: 10 }),
      candidate('c17', { form: 'cloze' }),
    ].map((entry) =>
      entry !== null && typeof entry === 'object' ? JSON.parse(JSON.stringify(entry)) : entry,
    ),
    [],
  ),
  generate(
    'forms: the listed form and none are accepted, another is not; an item without criteria is admitted; a malformed proof is a shape issue alone, before acceptance',
    [wCandidate('f1', { form: 'cloze' }), wCandidate('f2', { form: 'short' }), wCandidate('f3')],
    [
      { index: 1, proof: REVIEWED },
      { index: 0, proof: { kind: 'model-checked', at: 'now', model: 'm', agreed: true } },
    ],
    { targetSkill: 'w' },
  ),
  generate(
    'at the lapse of w, k takes w and x: the facts of w, its lapse at now, the weakest first',
    [],
    [],
    { request: at(T0 + 3 * DAY), options: { count: 20, seed: 'g' } },
  ),
  generate('two recent lapses, the latest first, the later one at now', [], [], {
    steps: lapseSteps,
    request: at(T0 + 3 * DAY + 12 * HOUR),
  }),
  generate('a lapse older than the remediation window is not recent', [], [], {
    targetSkill: 'w',
    request: at(T0 + 5 * DAY),
    options: { count: 1, seed: 'g' },
  }),
  generate('a batch that is not an array is one rejection', { id: 'c1' }, []),
  generate('a generation request for a bad count throws', [], [], {
    options: { count: 0, seed: 'g' },
  }),
  generate('a generation request for more than 20 candidates throws', [], [], {
    options: { count: 21, seed: 'g' },
  }),
  generate('a generation request under another configuration throws', [], [], {
    requestConfig: { itemCooldownMs: DAY },
  }),
  generate('a target whose stage is not in the ladder of its primary skill throws', [], [], {
    target: { stage: 'recall' },
  }),
];

// ─── Grader output ───

const task = {
  id: 't1',
  skills: [
    { skillId: 'a', weight: 0.5 },
    { skillId: 'b', weight: 0.5 },
  ],
  stage: 'recall',
  origin: 'generated',
  status: 'proven',
  criteria: [
    { name: 'b1', skillId: 'b' },
    { name: 'a1', skillId: 'a' },
    { name: 'a2', skillId: 'a' },
    { name: 'unreported', skillId: 'a' },
  ],
};
const autoGrade = {
  score: 2,
  maxScore: 3,
  passed: false,
  checks: { passed: 2, total: 3 },
  criteria: [
    { name: 'a1', score: 1, maxScore: 1 },
    { name: 'a2', score: 0, maxScore: 1 },
    { name: 'b1', score: 1, maxScore: 1 },
    { name: 'extra', score: 1, maxScore: 1 },
  ],
  grader: { kind: 'auto', id: 'pytest' },
};
const meta = { id: 'e1', itemId: 't1', at: 1000 };
const aiGrade = { score: 1, maxScore: 1, passed: true, grader: { kind: 'ai' } };
const humanGrade = { score: 0, maxScore: 1, passed: false, grader: { kind: 'human', id: 'r1' } };

const grades = [
  {
    kind: 'grade',
    name: 'grade results: accepted, out of range, bad checks and shape issues',
    rows: [
      autoGrade,
      { ...autoGrade, score: 4 },
      { ...autoGrade, score: -1 },
      { ...autoGrade, checks: { passed: 4, total: 3 } },
      { ...autoGrade, criteria: [{ name: 'a1', score: 2, maxScore: 1 }] },
      { ...autoGrade, grader: { kind: 'robot' } },
      { ...autoGrade, maxScore: -1 },
      { ...aiGrade, confidence: 'high', grader: { kind: 'ai', model: 'm', promptHash: 'p' } },
      humanGrade,
      null,
      'grade',
    ],
  },
  {
    kind: 'grade',
    name: 'evidence from grades: auto with per-skill outcomes (one skill too), ai (medium without a confidence; a review flag) and human, and a bad grade throws',
    evidence: [
      { result: autoGrade, task, meta },
      {
        result: autoGrade,
        task,
        meta: { ...meta, attempts: 0, hintsUsed: 1, durationMs: 5000, context: 'practice' },
      },
      { result: aiGrade, task, meta },
      { result: { ...aiGrade, confidence: 'high' }, task, meta },
      { result: { ...aiGrade, requiresHumanReview: true }, task, meta },
      { result: autoGrade, task: { ...task, criteria: [{ name: 'b1', skillId: 'b' }] }, meta },
      { result: humanGrade, task, meta },
      {
        result: { ...autoGrade, criteria: undefined },
        task: { ...task, criteria: undefined },
        meta,
      },
      { result: { ...autoGrade, score: 9 }, task, meta },
    ].map((row) => JSON.parse(JSON.stringify(row))),
  },
];

const vectors = [...decompositions, ...generations, ...grades];

const body = {
  $comment:
    'Contract vectors for @intellectif/lk-practice (criteria 11 and 12), generated by scripts/contracts-vectors.mjs and run by vectors/replay.mjs. `decompose` runs decompositionRequest, checkDecomposition, admitExtension and composeGraph, then (with `steps`) a record against the composed graph and a full replay. `generate` runs `steps` through createPractice(config), plans `request`, then runs generationRequest for the target of `targetSkill` (with the fields of `target` over it, under `requestConfig` when given), checkCandidates, admitCandidate for each proof with a record of each admitted item, and a record of each accepted candidate stored without a proof. `grade` runs checkGradeResult over `rows` and evidenceFromGrade over `evidence`. A call that throws is recorded as its error name. Floats compare at a relative 1e-9; integers, strings, null and every time exactly.',
  version: CORPUS_VERSION,
  vectors: record(impl, vectors),
};
writeFileSync(
  join(PACKAGE, 'vectors', 'contracts.json'),
  `${JSON.stringify(body, null, 2)}\n`,
  'utf8',
);
console.log(
  `contract vectors: ${decompositions.length} decompose, ${generations.length} generate, ${grades.length} grade`,
);
