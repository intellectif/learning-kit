export type WhatHappensStage = 'board' | 'watch' | 'guess' | 'reveal' | 'tell' | 'answer';
export type WhatHappensAction =
  | 'open'
  | 'freeze'
  | 'replay'
  | 'reveal'
  | 'ended'
  | 'answer'
  | 'next';
const transitions: Record<
  WhatHappensStage,
  Partial<Record<WhatHappensAction, WhatHappensStage>>
> = {
  board: { open: 'watch' },
  watch: { freeze: 'guess' },
  guess: { replay: 'watch', reveal: 'reveal' },
  reveal: { ended: 'tell' },
  tell: { answer: 'answer' },
  answer: { next: 'board' },
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
