import {
  type XAPIActor,
  type XAPIContext,
  type XAPIObjectParams,
  type XAPIStatement,
  type XAPIStatementParams,
  type XAPIVerbKey,
  xAPIBuilder,
} from '@intellectif/lk-core';
import type { PlayerEvent } from './types.js';

/** Carries the original event, including clip/scene IDs and audio transport. */
export const PLAYER_EVENT_XAPI_EXTENSION =
  'https://intellectif.com/xapi/extensions/interactive-activities/player-event';

export interface PlayerEventXapiContext {
  /** Host-chosen account or mbox; no learner identity is inferred by the player. */
  actor: XAPIActor;
  /** Host resolves its own activity/clip/scene IRIs and optional descriptions. */
  object: XAPIObjectParams | ((event: PlayerEvent) => XAPIObjectParams);
  context?: XAPIContext;
}

const eventVerbs: Record<PlayerEvent['type'], XAPIVerbKey> = {
  'clip.opened': 'EXPERIENCED',
  'clip.frozen': 'EXPERIENCED',
  'clip.revealed': 'EXPERIENCED',
  'answer.shown': 'EXPERIENCED',
  'audio.played': 'EXPERIENCED',
  'clip.completed': 'COMPLETED',
  'board.completed': 'COMPLETED',
  'scramble.started': 'EXPERIENCED',
  'scramble.completed': 'COMPLETED',
  'scramble.checked': 'INTERACTED',
  'vocab.opened': 'EXPERIENCED',
};

/** Builds locally using lk-core validation, UUID and timestamp; never sends or persists. */
export function playerEventToXapi(event: PlayerEvent, host: PlayerEventXapiContext): XAPIStatement {
  const verb = eventVerbs[event.type];
  const params: XAPIStatementParams = {
    actor: host.actor,
    verb,
    object: typeof host.object === 'function' ? host.object(event) : host.object,
    context: {
      ...host.context,
      extensions: {
        ...host.context?.extensions,
        [PLAYER_EVENT_XAPI_EXTENSION]: { ...event },
      },
    },
  };
  if (verb === 'COMPLETED') {
    // Completion is progress, not speech correctness. Never accept a score input.
    params.result = { completion: true };
  } else if (event.type === 'scramble.checked') {
    // Only chronological order has correctness; speaking/listening never does.
    params.result = { success: event.correct };
  }
  return xAPIBuilder.buildStatement(params);
}
