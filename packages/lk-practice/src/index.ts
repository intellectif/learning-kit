/**
 * @intellectif/lk-practice: a pure, deterministic engine for spaced,
 * stage-based practice over a skill graph. The domain types, graph and item
 * validation, goal-driven graph composition (M2), and the default FSRS-7
 * memory model (M3).
 */

export { composeGraph, validateGraph, validateItems } from './graph/index.js';
export { fsrsMemoryModel } from './memory/index.js';
export type * from './types.js';
