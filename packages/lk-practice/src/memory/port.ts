/**
 * The memory port (design §8.4): the planner and replay program against
 * `MemoryModel`, never against a library. The types are declared with the rest
 * of the public types in `types.ts`; this module names the ones a memory model
 * implements.
 */

export type { FsrsOptions, MemoryModel, MemoryReview, ReviewContext } from '../types.js';
