/**
 * One row of the shortcut list. The list and the key handler read the same
 * table, so a shortcut can never be documented and not work, or work and not
 * be documented.
 */
export type VideoShortcutAction =
  | 'play-pause'
  | 'jump-10'
  | 'jump-5'
  | 'jump-1'
  | 'frame'
  | 'speed'
  | 'percent'
  | 'start-end'
  | 'chapter'
  | 'mute'
  | 'captions'
  | 'transcript'
  | 'picture-in-picture'
  | 'fullscreen'
  | 'shortcut-list';

/** The keys of each row, as shown in the list. */
export const SHORTCUT_KEYS: readonly { action: VideoShortcutAction; keys: string }[] = [
  { action: 'play-pause', keys: 'Space / K' },
  { action: 'jump-10', keys: 'J / L' },
  { action: 'jump-5', keys: '← / →' },
  { action: 'jump-1', keys: 'Shift + ← / →' },
  { action: 'frame', keys: ', / .' },
  { action: 'speed', keys: '< / >' },
  { action: 'percent', keys: '0 – 9' },
  { action: 'start-end', keys: 'Home / End' },
  { action: 'chapter', keys: '[ / ]' },
  { action: 'mute', keys: 'M' },
  { action: 'captions', keys: 'C' },
  { action: 'transcript', keys: 'T' },
  { action: 'picture-in-picture', keys: 'P' },
  { action: 'fullscreen', keys: 'F' },
  { action: 'shortcut-list', keys: '?' },
];

/** Seconds J / L move. */
export const JUMP_SECONDS = 10;
/** Frame step: an approximation, since a video does not report its frame rate. */
export const FRAME_SECONDS = 1 / 30;
