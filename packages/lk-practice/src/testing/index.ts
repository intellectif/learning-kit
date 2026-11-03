/**
 * `@intellectif/lk-practice/testing` (R10.2, R13.4; revised in M8): a
 * deterministic simulated learner for comparing policies and for property
 * tests. A test tool, not a claim about real learners.
 */
export {
  type SimulatedAttempt,
  type SimulatedLearner,
  type SimulatedLearnerOptions,
  type SimulatedSkill,
  simulateLearner,
} from './simulate.js';
