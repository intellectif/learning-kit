import type { AssetRef, StyleChoice, VideoAspect } from '../../contract/types.js';

/** Editor-overridable chrome. Every key is optional; an empty string is refused. */
export interface WhatHappensCopy {
  playFallback?: string;
  replayToFreeze?: string;
  mediaError?: string;
  listenError?: string;
  backButton?: string;
  boardHint?: string;
  watchHint?: string;
  completedLabel?: string;
  clipCount?: string;

  predictTitle?: string;
  revealButton?: string;
  tellTitle?: string;
  supportsLabel?: string;
  showAnswer?: string;
  hideAnswer?: string;
  /** Announced when the answer is hidden again. */
  answerHidden?: string;
  answerLabel?: string;
  nextButton?: string;
  listenButton?: string;
}

export interface WhatHappensClip {
  id: string;
  title: string;
  video: AssetRef & { aspect: VideoAspect; durationS?: number };
  /** Card image on the board; without one the card shows an early frame of the clip. */
  thumb?: AssetRef;
  /** Blurred backdrop behind the clip, and the video's poster frame. */
  poster?: AssetRef;
  /** WebVTT captions for the clip's sound, shown as a captions track. */
  captions?: AssetRef & { srclang?: string; label?: string };
  /** Seconds; 0 < freezeAt < durationS. */
  freezeAt: number;
  predictPrompt?: string;
  tellPrompt?: string;
  supportsEnabled?: boolean;
  supportsLabel?: string;
  supports?: string[];
  answer: { text: string };
  /** The spoken sample answer; `textHash` is `answerTextHash(answer.text)` when it was made. */
  audio?: AssetRef & { voice?: string; textHash: string };
  /** Authoring only: never sent to learners. */
  videoPrompt?: { text: string; generatedBy?: string };
  /** Authoring only: never sent to learners. */
  origin?: 'authored' | 'generated';
}

export interface WhatHappensData {
  schemaVersion: '1.0';
  type: 'what-happens';
  id: string;
  title: string;
  /** BCP 47 tag of the content's language. */
  locale: string;
  style: StyleChoice;
  supportsEnabled?: boolean;
  copy?: WhatHappensCopy;
  clips: WhatHappensClip[];
}

/** The learner response lk-core is given: which clip was spoken about. Never graded. */
export interface WhatHappensResponse {
  clipId: string;
}
