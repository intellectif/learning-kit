import type { AssetRef, StyleChoice, VideoAspect } from '../../contract/types.js';

export interface CineScrambleVocabItem {
  term: string;
  definition: string;
}

export interface CineScrambleClip {
  /** The clip's place in the story, from 0: ids in a scene are exactly 0..n-1. */
  id: number;
  video: AssetRef & { aspect: VideoAspect; durationS?: number };
  /** One caption: the slot's hint while arranging, and a sentence of the story. */
  caption: string;
  /** Authoring only: never sent to learners. */
  videoPrompt?: { text: string; generatedBy?: string };
}

export interface CineScrambleScene {
  id: string;
  title: string;
  clips: CineScrambleClip[];
}

/** Editor-overridable chrome. Every key is optional; an empty string is refused. */
export interface CineScrambleCopy {
  startLabel?: string;
  closeLabel?: string;
  playFallback?: string;
  mediaError?: string;
  pauseLabel?: string;
  resumeLabel?: string;
  sceneLabel?: string;
  scenesLabel?: string;
  clipLabel?: string;
  slotLabel?: string;
  emptySlotLabel?: string;
  poolLabel?: string;
  removeLabel?: string;
  correctLabel?: string;
  incorrectLabel?: string;
  completeLabel?: string;
  storyLabel?: string;
  replayLabel?: string;
  nextSceneLabel?: string;
  doneLabel?: string;
  keyboardHelp?: string;
  clipHelp?: string;
  selectedLabel?: string;
  selectFirstLabel?: string;
  placedLabel?: string;
  returnedLabel?: string;
  fillAllLabel?: string;
  resultSummary?: string;

  checkLabel?: string;
  vocabButtonLabel?: string;
}

export interface CineScrambleData {
  schemaVersion: '1.0';
  type: 'cine-scramble';
  id: string;
  title: string;
  /** BCP 47 tag of the content's language. */
  locale?: string;
  tagline?: string;
  poster?: AssetRef;
  style?: StyleChoice;
  vocabEnabled?: boolean;
  vocab?: CineScrambleVocabItem[];
  scenes: CineScrambleScene[];
  copy?: CineScrambleCopy;
}

/** The learner response lk-core is given: one scene's order of clip ids. Never graded. */
export interface CineScrambleResponse {
  sceneId: string;
  order: number[];
}
