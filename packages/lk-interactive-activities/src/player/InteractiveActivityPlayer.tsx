import type { JSX } from 'react';
import type { InteractiveActivity } from '../registry/templates.js';
import { CineScramblePlayer } from '../templates/cine-scramble/player/CineScramblePlayer.js';
import type { CineScrambleData } from '../templates/cine-scramble/types.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import type { WhatHappensData } from '../templates/what-happens/types.js';
import { getTemplatePlayer } from './registry.js';
import type { PlayerHostOptions } from './types.js';

export interface InteractiveActivityPlayerProps extends PlayerHostOptions {
  /** A validated activity: a built-in template's, or one with a registered player. */
  activity: InteractiveActivity | { type: string; id: string };
}

/**
 * Renders any activity by its `type`: the built-in players, or a player
 * registered with `registerTemplatePlayer`. An activity of another type renders
 * a short alert instead of throwing. A new activity id starts the player afresh.
 */
export function InteractiveActivityPlayer({
  activity,
  ...host
}: InteractiveActivityPlayerProps): JSX.Element {
  if (activity.type === 'what-happens') {
    return <WhatHappensPlayer key={activity.id} activity={activity as WhatHappensData} {...host} />;
  }
  if (activity.type === 'cine-scramble') {
    return (
      <CineScramblePlayer key={activity.id} activity={activity as CineScrambleData} {...host} />
    );
  }
  const Player = getTemplatePlayer(activity.type);
  if (Player) {
    return <Player key={activity.id} activity={activity} {...host} />;
  }
  return (
    <p role="alert" data-lkia-unknown="">
      No player for activity template "{activity.type}".
    </p>
  );
}
