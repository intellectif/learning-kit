import type { JSX } from 'react';
import { CineScramblePlayer } from '../templates/cine-scramble/player/CineScramblePlayer.js';
import type { CineScrambleData } from '../templates/cine-scramble/schema.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import type { WhatHappensData } from '../templates/what-happens/schema.js';
import type { PlayerHostOptions } from './types.js';
export interface InteractiveActivityPlayerProps extends PlayerHostOptions {
  activity: WhatHappensData | CineScrambleData;
}
export function InteractiveActivityPlayer({
  activity,
  ...host
}: InteractiveActivityPlayerProps): JSX.Element {
  return activity.type === 'what-happens' ? (
    <WhatHappensPlayer key={activity.id} activity={activity} {...host} />
  ) : (
    <CineScramblePlayer key={activity.id} activity={activity} {...host} />
  );
}
