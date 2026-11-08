import { type AssetUrlResolver, resolveAssetUrl } from '../../../player/resolve-url.js';
import type { WhatHappensClip } from '../schema.js';
export async function listenToAnswer(
  clip: WhatHappensClip,
  audio: HTMLAudioElement,
  resolve?: AssetUrlResolver,
  isActive: () => boolean = () => true,
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
  if (!('speechSynthesis' in window)) throw new Error('Speech synthesis unavailable');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clip.answer.text);
  window.speechSynthesis.speak(utterance);
  return 'speechSynthesis';
}
