/**
 * `createPractice` (design §5.9, R10.1): resolves and hashes a configuration
 * once, binds its models, and returns pure functions over the state and the
 * log. The returned object holds no mutable state.
 */

import { resolveConfig } from './config.js';
import { EMPTY_LOG_HASH } from './determinism/keys.js';
import { PracticeConfigError } from './errors.js';
import { createEngine } from './log/context.js';
import { recordEvidence, recordHostAction } from './log/record.js';
import { replayLog, replayLogFrom } from './log/replay.js';
import { learnerStatus, reconcileState } from './status/summary.js';
import type { Practice, PracticeConfig, PracticeState, SkillGraph } from './types.js';

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Binds a configuration. Throws `PracticeConfigError` with the issues of
 * `resolveConfig` when the configuration is invalid.
 */
export function createPractice(config: PracticeConfig = {}): Practice {
  const resolved = resolveConfig(config);
  if (!resolved.ok) throw new PracticeConfigError(resolved.issues);
  const engine = createEngine(config, resolved.value);

  const initState = (learnerId: string, graph: SkillGraph): PracticeState => {
    if (!isId(learnerId)) throw new TypeError('lk-practice: learnerId is a non-empty string.');
    if (typeof graph?.version !== 'string') {
      throw new TypeError('lk-practice: graph.version is a string.');
    }
    return Object.freeze({
      schemaVersion: 1,
      learnerId,
      graphVersion: graph.version,
      configHash: engine.hash,
      log: Object.freeze({ length: 0, lastAt: null, hash: EMPTY_LOG_HASH }),
      skills: Object.freeze({}),
      items: Object.freeze({}),
      held: Object.freeze([]),
      recentIds: Object.freeze([]),
    });
  };

  return Object.freeze({
    config: engine.config,
    configHash: engine.hash,
    initState,
    record: (state, input) => recordEvidence(engine, state, input),
    act: (state, graph, input) => recordHostAction(engine, state, graph, input),
    status: (state, graph, now) => learnerStatus(engine, state, graph, now),
    replay: (entries, graph, learnerId) => {
      if (!isId(learnerId) || typeof graph?.version !== 'string') {
        return Object.freeze({
          ok: false,
          issues: Object.freeze([
            Object.freeze({
              code: 'SHAPE_INVALID',
              path: Object.freeze([isId(learnerId) ? 'graph' : 'learnerId']),
              message: isId(learnerId)
                ? 'graph.version is a string.'
                : 'learnerId is a non-empty string.',
            }),
          ]),
        });
      }
      return replayLog(engine, initState(learnerId, graph), entries, graph);
    },
    replayFrom: (checkpoint, entries, graph) => replayLogFrom(engine, checkpoint, entries, graph),
    reconcile: (state, graph) => reconcileState(engine, state, graph),
  } satisfies Practice);
}
