/** One caption: when it shows, and what it says, as plain text. */
export interface Cue {
  /** Seconds. */
  start: number;
  /** Seconds, after `start`. */
  end: number;
  text: string;
}

/** Bytes of WebVTT read at most. A caption file is text; this is several hours of it. */
const MAX_VTT_LENGTH = 2_000_000;
/** Cues kept at most, for the same reason: the transcript renders every one. */
const MAX_CUES = 10_000;

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const TIMESTAMP = /^(?:(\d+):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;

function seconds(stamp: string): number | undefined {
  const match = TIMESTAMP.exec(stamp.trim());
  if (match === null) {
    return undefined;
  }
  const [, hours = '0', minutes = '0', secs = '0', millis = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis) / 1000;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Built from code points: an escape can be rewritten as the raw, invisible
  // character itself, by a formatter or an editor.
  nbsp: String.fromCharCode(0xa0),
  lrm: String.fromCharCode(0x200e),
  rlm: String.fromCharCode(0x200f),
};

/**
 * A cue payload as the text a learner reads: markup removed (`<v Speaker>`,
 * `<i>`, `<c.class>`, inline timestamps), entities decoded, lines joined with
 * a space.
 */
function plainText(payload: string): string {
  return payload
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * Reads a WebVTT file into cues, sorted by start. Never throws: a malformed cue
 * is skipped, and text that is not WebVTT at all answers an empty list.
 *
 * The SDK parses captions itself rather than handing them to a `<track>`:
 * the caption preview on the progress bar, the transcript and its search all
 * need the cues as data, a host whose caption URL needs its credentials can
 * pass the text in, and a test environment with no media stack can read them.
 * Cue settings (position, alignment) are ignored — the player draws captions
 * in one place, above its own controls.
 */
export function parseWebVtt(input: string): Cue[] {
  if (typeof input !== 'string') {
    return [];
  }
  const raw = input.slice(0, MAX_VTT_LENGTH);
  const text = (raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(1) : raw).replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) {
    return [];
  }
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    if (cues.length >= MAX_CUES) {
      break;
    }
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) {
      continue;
    }
    const [from = '', rest = ''] = (lines[timingIndex] as string).split('-->');
    const start = seconds(from);
    const end = seconds(rest.trim().split(/\s+/)[0] ?? '');
    if (start === undefined || end === undefined || end <= start) {
      continue;
    }
    const payload = plainText(lines.slice(timingIndex + 1).join('\n'));
    if (payload === '') {
      continue;
    }
    cues.push({ start, end, text: payload });
  }
  // Stable: two cues at one moment keep the order the file gave them.
  return cues
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.start - b.cue.start || a.index - b.index)
    .map(({ cue }) => cue);
}

/**
 * The cue showing at `time`, or -1. When cues overlap, the one that started
 * last wins — the newest line is the one being spoken.
 */
export function cueIndexAt(cues: readonly Cue[], time: number): number {
  let low = 0;
  let high = cues.length - 1;
  let found = -1;
  // The last cue that starts at or before `time`.
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((cues[middle] as Cue).start <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  for (let index = found; index >= 0 && index > found - 8; index -= 1) {
    const cue = cues[index] as Cue;
    if (time < cue.end) {
      return index;
    }
  }
  return -1;
}
