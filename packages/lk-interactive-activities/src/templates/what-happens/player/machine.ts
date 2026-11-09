export type WhatHappensStage = 'board' | 'watch' | 'guess' | 'reveal' | 'tell' | 'answer';
export type WhatHappensAction =
  | 'open'
  | 'freeze'
  | 'replay'
  | 'reveal'
  | 'ended'
  | 'answer'
  | 'hide'
  | 'next'
  | 'back';
const transitions: Record<
  WhatHappensStage,
  Partial<Record<WhatHappensAction, WhatHappensStage>>
> = {
  board: { open: 'watch' },
  watch: { freeze: 'guess', back: 'board' },
  guess: { replay: 'watch', reveal: 'reveal', back: 'board' },
  reveal: { ended: 'tell', back: 'board' },
  // `next` from tell: a clip without a sample answer is complete once told.
  tell: { answer: 'answer', next: 'board', back: 'board' },
  // `hide` undoes Show answer: back to the telling step and its supports.
  answer: { hide: 'tell', next: 'board', back: 'board' },
};
export function nextWhatHappensStage(
  stage: WhatHappensStage,
  action: WhatHappensAction,
): WhatHappensStage {
  return transitions[stage][action] ?? stage;
}
export function clampPlaybackTime(time: number, freezeAt: number, revealed: boolean): number {
  return Math.max(0, revealed ? time : Math.min(time, freezeAt));
}
/**
 * Whether playback must stop now so the next frame cannot pass the freeze
 * point: the current media time plus one frame interval reaches it.
 */
export function reachesFreeze(mediaTime: number, frameInterval: number, freezeAt: number): boolean {
  return mediaTime + frameInterval >= freezeAt;
}
