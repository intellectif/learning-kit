/**
 * JSON Schema documents (design §5.9, R8.2, R9, R10.1) (M7), draft 2020-12,
 * generated from the same shapes the package's checks run. A host passes the
 * model-output ones to a model's structured output. A JSON Schema states the
 * field rules only: the cross-field rules (a review log entry's ordering, a
 * grade's score range, a candidate's skills and stage against its request, a
 * proposal's graph rules) are the checks' alone, so a document a schema
 * accepts must still pass `checkGradeResult`, `checkCandidates`,
 * `checkDecomposition`, `checkPrerequisiteHypothesis` or `migrateState`.
 */

import { deepFreeze } from '../determinism/freeze.js';
import type { JsonSchemaObject } from '../types.js';
import {
  candidateShape,
  entryShape,
  gradeResultShape,
  hypothesesShape,
  MAX_CANDIDATES,
  proposalShape,
  stateShape,
} from './shape.js';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

function document(title: string, description: string, schema: JsonSchemaObject): JsonSchemaObject {
  return deepFreeze({ $schema: DIALECT, title, description, ...schema });
}

/** A stored `PracticeState` of schema version 1. */
export const practiceStateJsonSchema = document(
  'PracticeState',
  'A stored lk-practice learner state, schema version 1. Validate with migrateState.',
  stateShape.schema,
);

/** One `ReviewLogEntry`. */
export const reviewLogEntryJsonSchema = document(
  'ReviewLogEntry',
  'One lk-practice review log entry.',
  entryShape.schema,
);

/** A grader's `GradeResult` (R8.2): the structured output of a model grader. */
export const gradeResultJsonSchema = document(
  'GradeResult',
  'What a grader returns for one response. Validate with checkGradeResult.',
  gradeResultShape.schema,
);

/** A generator's output (R9.1): 1 to 20 candidate tasks. */
export const candidatesJsonSchema = document(
  'Candidates',
  'Generated practice tasks for one generation request. Validate with checkCandidates.',
  { type: 'array', items: candidateShape.schema, minItems: 1, maxItems: MAX_CANDIDATES },
);

/** A decomposer's output (R9.5): the proposed skills and edges. */
export const decompositionJsonSchema = document(
  'DecompositionProposal',
  'Proposed skills and edges for one learning goal. Validate with checkDecomposition.',
  proposalShape.schema,
);

/** A diagnoser's output (R14.4; revised in M12): candidate prerequisites of one blocked skill. */
export const hypothesesJsonSchema = document(
  'PrerequisiteHypotheses',
  'Candidate prerequisites for one blocked skill. Validate with checkPrerequisiteHypothesis.',
  hypothesesShape.schema,
);
