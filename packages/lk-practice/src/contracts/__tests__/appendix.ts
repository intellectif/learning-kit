/**
 * The Appendix A goal of the requirements, kept generic: a base graph of
 * Python skills and the extension a decomposer proposes for "write an LLM
 * chat-model call in Python from memory", over a fictional `llm_client`.
 * Shared by the decomposition tests; scripts/contracts-vectors.mjs holds the
 * same data for the vectors.
 */

import { deepFreeze } from '../../determinism/freeze.js';
import type { LearnerGoal, SkillEdge, SkillGraph, SkillNode } from '../../types.js';

export const BASE: SkillGraph = deepFreeze({
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
});

export const GOAL: LearnerGoal = deepFreeze({
  id: 'goal.llm-call',
  text: 'Write an LLM chat-model call in Python from memory',
  anchorSkillIds: ['py.imports', 'py.kwargs'],
});

export const COMPONENTS = [
  'llm.call.import',
  'llm.call.model-id',
  'llm.call.temperature',
  'llm.call.max-tokens',
  'llm.call.retries',
  'llm.call.messages',
  'llm.call.invoke',
] as const;

const node = (id: string, label: string): SkillNode => ({ id, knowledge: 'procedural', label });

export const SKILLS: readonly SkillNode[] = deepFreeze([
  node('llm.call', 'The whole call: build a model, send messages, read the reply'),
  node('llm.call.import', 'from llm_client import ChatModel'),
  node('llm.call.model-id', 'The "provider:model-name" string'),
  node('llm.call.temperature', 'temperature, and why 0 makes output (near) deterministic'),
  node('llm.call.max-tokens', 'max_tokens caps the reply length'),
  node('llm.call.retries', 'max_retries for transient provider errors'),
  node('llm.call.messages', 'A list of (role, text) messages'),
  node('llm.call.invoke', '.invoke(...) and response.content'),
]);

const KWARGS = ['llm.call.temperature', 'llm.call.max-tokens', 'llm.call.retries'];

export const EDGES: readonly SkillEdge[] = deepFreeze([
  ...COMPONENTS.map(
    (to): SkillEdge => ({ kind: 'encompasses', from: 'llm.call', to, weight: 0.5 }),
  ),
  { kind: 'prerequisite', from: 'py.imports', to: 'llm.call.import', strength: 'hard' },
  ...KWARGS.map(
    (to): SkillEdge => ({ kind: 'prerequisite', from: 'py.kwargs', to, strength: 'hard' }),
  ),
  ...COMPONENTS.map(
    (from): SkillEdge => ({ kind: 'prerequisite', from, to: 'llm.call', strength: 'soft' }),
  ),
]);

export const PROPOSAL = deepFreeze({ skills: SKILLS, edges: EDGES });

export const OPTIONS = deepFreeze({ idPrefix: 'llm.call', maxSkills: 8, seed: GOAL.id });
