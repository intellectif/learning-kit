import { fold } from '../answer-leak.js';
import { listMediaRefs } from '../media-refs.js';
import type { ItemFinding } from '../types/authoring.js';
import { finding } from './findings.js';
import { isRecord } from './issues.js';

/**
 * The critic's rules for what a recording says: its author-only `transcript`
 * and `script`, wherever media sits. Words are compared as the other rules
 * compare them (`fold`: case, accents and punctuation ignored), and a
 * speaker's label is not one of a recording's words.
 */

type Path = readonly (string | number)[];

const written = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** The script's turns that have a speaker and words, or none. */
function turnsOf(script: unknown): { speaker: string; text: string }[] {
  return Array.isArray(script)
    ? script.flatMap((turn) =>
        isRecord(turn) && typeof turn.speaker === 'string' && written(turn.text)
          ? [{ speaker: turn.speaker, text: turn.text }]
          : [],
      )
    : [];
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A transcript's words, with each `Speaker:` label of the script's speakers taken out. */
function transcriptWords(transcript: string, speakers: readonly string[]): string[] {
  const labels = [...new Set(speakers.map((speaker) => speaker.trim()).filter(written))];
  const unlabelled =
    labels.length === 0
      ? transcript
      : transcript.replace(
          new RegExp(`(^|\\s)(?:${labels.map(escaped).join('|')})\\s*:`, 'giu'),
          '$1',
        );
  return fold(unlabelled);
}

/** What a recording says, as words: its transcript, or else its script's turns. */
function spokenWords(holder: Record<string, unknown>): string[] | null {
  const turns = turnsOf(holder.script);
  if (written(holder.transcript)) {
    return transcriptWords(
      holder.transcript,
      turns.map((turn) => turn.speaker),
    );
  }
  return turns.length > 0 ? fold(turns.map((turn) => turn.text).join(' ')) : null;
}

const sameWords = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((word, index) => word === b[index]);

/** One object's own rules: text on media with nothing to say, and a transcript its script contradicts. */
function holderFindings(holder: unknown, path: Path): ItemFinding[] {
  if (!isRecord(holder)) {
    return [];
  }
  const findings: ItemFinding[] = [];
  const turns = turnsOf(holder.script);
  const hasText = written(holder.transcript) || turns.length > 0;
  if (hasText && (holder.type === 'image' || holder.type === 'embed')) {
    findings.push(
      finding(
        'media_transcript_unused',
        [...path, written(holder.transcript) ? 'transcript' : 'script'],
        `A transcript or a script on ${holder.type === 'image' ? 'a picture' : 'an embedded player'} has nothing to describe, and nothing reads it. Put it on the recording it belongs to.`,
      ),
    );
  }
  if (written(holder.transcript) && turns.length > 0) {
    const fromTranscript = transcriptWords(
      holder.transcript,
      turns.map((turn) => turn.speaker),
    );
    if (!sameWords(fromTranscript, fold(turns.map((turn) => turn.text).join(' ')))) {
      findings.push(
        finding(
          'media_script_differs',
          [...path, 'script'],
          'The script and the transcript say different words. AI facts read the transcript, and a voice reads the script: make them say the same.',
        ),
      );
    }
  }
  return findings;
}

/** The field a type's own recording reads out, for the types that have one. */
const SPOKEN_FIELD: Readonly<Record<string, string>> = {
  dictation: 'transcript',
  'read-aloud': 'referenceText',
};

/**
 * An item's recording rules, at every place its type keeps media. A
 * dictation's and a read-aloud's own text is what their recording says, so a
 * recording that says other words is reported too.
 */
export function recordingFindings(item: Record<string, unknown>): ItemFinding[] {
  // Each media object once: the walker lists its main file first, at `<path>.url`.
  const findings = listMediaRefs(item)
    .filter((ref) => ref.path[ref.path.length - 1] === 'url')
    .flatMap((ref) => holderFindings(ref.holder, ref.path.slice(0, -1)));
  const field = typeof item.type === 'string' ? SPOKEN_FIELD[item.type] : undefined;
  const media = item.media;
  if (field === undefined || !isRecord(media)) {
    return findings;
  }
  const said = spokenWords(media);
  const accepted = [
    item[field],
    ...(item.type === 'dictation' && Array.isArray(item.acceptedTranscripts)
      ? item.acceptedTranscripts
      : []),
  ].filter(written);
  if (
    said !== null &&
    accepted.length > 0 &&
    !accepted.some((text) => sameWords(said, fold(text)))
  ) {
    findings.push(
      finding(
        'media_transcript_differs',
        ['media', written(media.transcript) ? 'transcript' : 'script'],
        `The recording's transcript says different words from the item's \`${field}\`, which is what the recording is meant to say.`,
      ),
    );
  }
  return findings;
}

/** A group's material: its own transcript against its script, and its media's rules. */
export function stimulusFindings(stimulus: unknown): ItemFinding[] {
  if (!isRecord(stimulus)) {
    return [];
  }
  return [
    ...holderFindings({ transcript: stimulus.transcript, script: stimulus.script }, ['stimulus']),
    ...holderFindings(stimulus.media, ['stimulus', 'media']),
  ];
}
