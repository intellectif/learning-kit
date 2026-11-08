/** Local notifications only; delivery and persistence belong to the host. */
export type PlayerEvent =
  | {
      type: 'clip.opened' | 'clip.frozen' | 'clip.revealed' | 'answer.shown' | 'clip.completed';
      activityId: string;
      clipId: string;
    }
  | { type: 'audio.played'; activityId: string; clipId: string; via: 'audio' | 'speechSynthesis' }
  | { type: 'supports.shown' | 'supports.hidden'; activityId: string; clipId: string }
  | { type: 'board.completed'; activityId: string }
  | { type: 'scramble.started' | 'scramble.completed'; activityId: string; sceneId: string }
  /** Every scene of a Cine-Scramble activity is in order. */
  | { type: 'activity.completed'; activityId: string }
  | { type: 'scramble.checked'; activityId: string; sceneId: string; correct: boolean }
  | { type: 'vocab.opened'; activityId: string };
