/**
 * @intellectif/lk-practice: a pure, deterministic engine for spaced,
 * stage-based practice over a skill graph. The domain types, graph and item
 * validation, goal-driven graph composition (M2), the default FSRS-7 memory
 * model (M3), the default Elo mastery model and evidence mapper (M4), and
 * the practice object with its log, replay, host actions and status (M5),
 * the session planner (M6), the grader, generator and decomposition
 * contracts with the Standard Schema and JSON Schema objects (M7), and
 * prerequisite discovery (M12).
 */

export {
  admitCandidate,
  admitExtension,
  checkCandidates,
  checkDecomposition,
  checkGradeResult,
  checkPrerequisiteHypothesis,
  decompositionRequest,
  discoveryExtension,
  evidenceFromGrade,
  generationRequest,
  prerequisiteReport,
  prerequisiteRequest,
  prerequisiteVerdict,
} from './contracts/index.js';

export { PracticeConfigError } from './errors.js';
export { mapEvidence } from './evidence/index.js';
export { composeGraph, validateGraph, validateItems } from './graph/index.js';
export { eloMasteryModel } from './mastery/index.js';
export { fsrsMemoryModel } from './memory/index.js';
export { createPractice } from './practice.js';
export {
  candidatesJsonSchema,
  decompositionJsonSchema,
  evidenceSchema,
  gradeResultJsonSchema,
  gradeResultSchema,
  hypothesesJsonSchema,
  hypothesesSchema,
  migrateState,
  practiceStateJsonSchema,
  practiceStateSchema,
  reviewLogEntryJsonSchema,
  reviewLogEntrySchema,
  type StandardSchemaIssue,
  type StandardSchemaV1,
} from './schema/index.js';
export type * from './types.js';
