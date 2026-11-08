import type { WhatHappensClip, WhatHappensData } from './types.js';

/** Whether a clip's supports are offered: the clip's own switch, else the activity's (default on). */
export function isSupportsEnabled(activity: WhatHappensData, clip?: WhatHappensClip): boolean {
  if (clip?.supportsEnabled !== undefined) {
    return clip.supportsEnabled;
  }
  return activity.supportsEnabled !== false;
}

/**
 * A stable fingerprint of a sample answer's text, for `audio.textHash`: a host
 * records it when it generates the spoken answer, and regenerates the audio when
 * the answer no longer matches (see {@link isAnswerAudioCurrent}). FNV-1a over
 * the text in Unicode normal form C, trimmed, with whitespace collapsed.
 */
export function answerTextHash(text: string): string {
  const normal = text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  let hash = 0x811c9dc5;
  for (const unit of new TextEncoder().encode(normal)) {
    hash ^= unit;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Whether a clip's recorded answer still speaks its current sample answer:
 * its `textHash` is {@link answerTextHash} of `answer.text`. False when there is
 * no audio, or when the text changed after the audio was made.
 */
export function isAnswerAudioCurrent(clip: Pick<WhatHappensClip, 'audio' | 'answer'>): boolean {
  return (
    clip.audio !== undefined && clip.audio.textHash === answerTextHash(clip.answer?.text ?? '')
  );
}
