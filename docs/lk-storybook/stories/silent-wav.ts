/**
 * A real, silent WAV as a data URI, so a story needs no hosted audio.
 *
 * Shared because the two speech stories both want one: a read-aloud needs two
 * different model files (the schema refuses one recording standing in for both
 * the normal and the slow version, and two lengths are the cheapest way to
 * make them different), and the pronunciation panel needs one playable URL
 * before its per-word play buttons appear at all. `Dictation.stories.tsx`
 * keeps its own copy: it predates this file and rewriting a working story to
 * import a helper buys nothing.
 */
export function silentWavDataUri(seconds: number): string {
  const rate = 8000;
  const frames = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + frames);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate: 8-bit mono
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, frames, true);
  new Uint8Array(buffer, 44).fill(128); // 8-bit PCM silence sits at 128
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
