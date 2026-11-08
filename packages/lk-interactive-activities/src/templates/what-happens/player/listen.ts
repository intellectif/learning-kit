import { type AssetUrlResolver, resolveAssetUrl } from '../../../player/resolve-url.js';
import { isAnswerAudioCurrent } from '../rules.js';
import type { WhatHappensClip } from '../types.js';

/**
 * A voice for `lang`, on this device when one exists: an on-device voice
 * speaks offline and sends nothing anywhere, where a network voice would send
 * the text to its provider. An exact tag match first, then the same language.
 */
export function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  const wanted = lang.toLowerCase().replace('_', '-');
  const primary = wanted.split('-')[0];
  const matches = (voice: SpeechSynthesisVoice, exact: boolean) => {
    const tag = voice.lang.toLowerCase().replace('_', '-');
    return exact ? tag === wanted : tag.split('-')[0] === primary;
  };
  for (const exact of [true, false]) {
    const local = voices.find((voice) => matches(voice, exact) && voice.localService);
    if (local) return local;
  }
  return (
    voices.find((voice) => matches(voice, true)) ?? voices.find((voice) => matches(voice, false))
  );
}

export interface ListenOptions {
  /** Whether the request is still wanted (the learner has not moved on). */
  isActive?: () => boolean;
  /** The content's language, for the system voice. */
  lang?: string;
  /** Called with the utterance this player speaks, so it can stop only its own. */
  onUtterance?: (utterance: SpeechSynthesisUtterance) => void;
  /** Called when the system voice fails (not when it is stopped on purpose). */
  onSpeechError?: () => void;
}

/**
 * Plays the clip's recorded answer when it still matches the answer text, or
 * speaks the answer with the browser's speech synthesis in the content's
 * language. Resolves with how it was played, or null when no longer wanted.
 */
export async function listenToAnswer(
  clip: WhatHappensClip,
  audio: HTMLAudioElement,
  resolve?: AssetUrlResolver,
  options: ListenOptions = {},
): Promise<'audio' | 'speechSynthesis' | null> {
  const isActive = options.isActive ?? (() => true);
  if (clip.audio && isAnswerAudioCurrent(clip)) {
    audio.src = resolveAssetUrl(clip.audio, resolve);
    try {
      await audio.play();
      if (!isActive()) {
        audio.pause();
        return null;
      }
      return 'audio';
    } catch {
      /* Use the system voice if the recording cannot play. */
    }
  }
  if (!isActive()) return null;
  if (!('speechSynthesis' in window) || !window.speechSynthesis)
    throw new Error('Speech synthesis unavailable');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clip.answer?.text ?? '');
  if (options.lang) {
    utterance.lang = options.lang;
    const voice = voiceFor(options.lang);
    if (voice) utterance.voice = voice;
  }
  utterance.onerror = (event) => {
    const reason = (event as { error?: string }).error;
    if (reason !== 'interrupted' && reason !== 'canceled') options.onSpeechError?.();
  };
  options.onUtterance?.(utterance);
  window.speechSynthesis.speak(utterance);
  return 'speechSynthesis';
}
