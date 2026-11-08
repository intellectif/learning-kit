import { type AssetUrlResolver, resolveAssetUrl } from '../../../player/resolve-url.js';
import type { WhatHappensClip } from '../schema.js';

/** A voice for `lang`: an exact tag match first, then the same primary language. */
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  const wanted = lang.toLowerCase().replace('_', '-');
  const primary = wanted.split('-')[0];
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace('_', '-') === wanted) ??
    voices.find((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === primary)
  );
}

/**
 * Plays the clip's recorded answer, or speaks the answer text with the
 * browser's speech synthesis in the activity's content language (`lang`).
 */
export async function listenToAnswer(
  clip: WhatHappensClip,
  audio: HTMLAudioElement,
  resolve?: AssetUrlResolver,
  isActive: () => boolean = () => true,
  lang?: string,
): Promise<'audio' | 'speechSynthesis' | null> {
  if (clip.audio) {
    audio.src = resolveAssetUrl(clip.audio, resolve);
    try {
      await audio.play();
      if (!isActive()) {
        audio.pause();
        return null;
      }
      return 'audio';
    } catch {
      /* Use the OS voice if media is unavailable. */
    }
  }
  if (!isActive()) return null;
  if (!('speechSynthesis' in window) || !window.speechSynthesis)
    throw new Error('Speech synthesis unavailable');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clip.answer?.text ?? '');
  if (lang) {
    utterance.lang = lang;
    const voice = voiceFor(lang);
    if (voice) utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
  return 'speechSynthesis';
}
