/**
 * The learner-safe SHAPE of each built-in type.
 *
 * `redact()` returns `RedactedActivityData`, which proves a payload is
 * learner-safe but is index-signature typed — it deliberately says nothing
 * about what the payload still CONTAINS. That is right for the assertion and
 * useless for anything that has to render or transport the result, so every
 * integrator would end up re-declaring these interfaces by hand, and they would
 * drift the moment a schema changed.
 *
 * Use them for the payload a server sends an exam client, and for the props of
 * a renderer that must never see an answer key.
 *
 * Each is pinned to the strict schema `assertRedacted` checks against by a
 * compile-time equality test, so the type and the validator cannot disagree.
 * They are written out rather than inferred from those schemas so that the
 * published types name no validation library.
 */

/** A caption or subtitle track, unchanged by redaction. */
interface Track {
  kind: 'captions' | 'subtitles';
  src: string;
  srclang: string;
  label: string;
  default?: boolean | undefined;
}

/** A recording's playback policy, unchanged by redaction. */
interface Playback {
  controls?: 'native' | 'minimal' | undefined;
  maxPlays?: number | undefined;
  seek?: 'allow' | 'none' | undefined;
  rate?: 'allow' | 'fixed' | undefined;
  nativeControlHints?: ('hide-download' | 'hide-rate')[] | undefined;
}

/** An item's or a stimulus's media, unchanged by redaction. */
interface Media {
  type: 'image' | 'audio' | 'video' | 'embed';
  url: string;
  alt?: string | undefined;
  captionsUrl?: string | undefined;
  tracks?: Track[] | undefined;
  poster?: string | undefined;
  playback?: Playback | undefined;
}

/** The author's switches for AI help, unchanged by redaction. */
interface AiSwitches {
  explanations?: boolean | undefined;
  hints?: boolean | undefined;
}

/** What every redacted item carries, whatever its type. */
interface RedactedItem {
  redacted: true;
  schemaVersion: '1.0';
  id: string;
  title: string;
  slotKey?: string | undefined;
  media?: Media | undefined;
  passThreshold?: number | undefined;
  learningObjectives?: string[] | undefined;
  difficultyLevel?: 1 | 2 | 3 | 4 | 5 | undefined;
  ai?: AiSwitches | undefined;
}

/** An option's picture or recording, unchanged by redaction — it is what the learner picks. */
export interface RedactedMultipleChoiceOptionMedia {
  type: 'image' | 'audio';
  url: string;
  alt?: string | undefined;
  captionsUrl?: string | undefined;
}

/** An option with `isCorrect` and its feedback removed. */
export interface RedactedMultipleChoiceOption {
  id: string;
  text: string;
  media?: RedactedMultipleChoiceOptionMedia | undefined;
}

/** A Multiple Choice item with the answer key, feedback and strategy removed. */
export interface RedactedMultipleChoiceData extends RedactedItem {
  type: 'multiple-choice';
  question: string;
  questionHtml?: string | undefined;
  mode: 'single' | 'multi';
  options: RedactedMultipleChoiceOption[];
  shuffle?: boolean | undefined;
  locale?: string | undefined;
}

/** A blank with its accepted answers and matching rules removed; the hint survives. */
export interface RedactedBlankConfig {
  id: string;
  hint?: string | undefined;
}

/** A Fill-in-the-Blanks item with every accepted answer removed. */
export interface RedactedFillInTheBlanksData extends RedactedItem {
  type: 'fill-in-the-blanks';
  passage: string;
  passageHtml?: string | undefined;
  blanks: RedactedBlankConfig[];
  locale?: string | undefined;
}

/** A Written Response item; the rubric survives, because it tells the learner what is assessed. */
export interface RedactedWrittenResponseData extends RedactedItem {
  type: 'written-response';
  prompt: string;
  promptHtml?: string | undefined;
  minWords: number;
  maxWords: number;
  rubric?:
    | {
        criteria: { name: string; weight: number; description?: string | undefined }[];
        label?: string | undefined;
      }
    | undefined;
  languageTarget?: string | undefined;
  locale?: string | undefined;
}

/** A selectable choice, unchanged by redaction. */
export interface RedactedGapSelectChoice {
  id: string;
  text: string;
}

/** A word bank, unchanged by redaction — the learner picks from it. */
export interface RedactedGapSelectBank {
  id: string;
  choices: RedactedGapSelectChoice[];
}

/** A gap with its `correctChoiceId` removed; every choice it offers survives. */
export interface RedactedGapSelectGap {
  id: string;
  choices?: RedactedGapSelectChoice[] | undefined;
  bankId?: string | undefined;
}

/** A Gap Select item the learner can still answer: choices intact, answer key gone. */
export interface RedactedGapSelectData extends RedactedItem {
  type: 'gap-select';
  passage: string;
  passageHtml?: string | undefined;
  gaps: RedactedGapSelectGap[];
  banks?: RedactedGapSelectBank[] | undefined;
  presentation?: 'dropdown' | undefined;
  shuffleChoices?: boolean | undefined;
  locale?: string | undefined;
}

/** The slower recording of a dictation, unchanged by redaction. */
export interface RedactedDictationSlowMedia {
  type: 'audio';
  url: string;
  alt?: string | undefined;
}

/** A Dictation item with its transcript, accepted alternatives and tolerances removed. */
export interface RedactedDictationData extends RedactedItem {
  type: 'dictation';
  slowMedia?: RedactedDictationSlowMedia | undefined;
  hints?: { mode: 'progressive-words' } | undefined;
  locale?: string | undefined;
}

/**
 * A Read Aloud item, which keeps everything but the authored feedback: the text
 * to read is what the learner is asked to read. The slow recording needs no
 * redacted counterpart of its own — the content schema for it is already strict.
 */
export interface RedactedReadAloudData extends RedactedItem {
  type: 'read-aloud';
  instructions?: string | undefined;
  referenceText: string;
  locale: string;
  slowMedia?: RedactedDictationSlowMedia | undefined;
  recording: {
    maxSeconds: number;
    minSeconds?: number | undefined;
    maxTakes?: number | undefined;
  };
  scoring: {
    dimensions: {
      name: 'accuracy' | 'fluency' | 'completeness' | 'prosody';
      weight: number;
    }[];
  };
}

/** A stimulus as a learner receives it: everything but the author-only `transcript`. */
export interface RedactedStimulus {
  id: string;
  kind: 'text' | 'image' | 'audio' | 'video' | 'mixed';
  title?: string | undefined;
  body?: string | undefined;
  bodyHtml?: string | undefined;
  media?: Media | undefined;
  locale?: string | undefined;
  attribution?: string | undefined;
}

/**
 * Discriminated union of every built-in redacted activity. Narrow it on
 * `type`, exactly as you would `ActivityData`:
 *
 * ```ts
 * function render(item: RedactedActivity) {
 *   if (item.type === 'multiple-choice') {
 *     return item.options.map((option) => option.text); // no `isCorrect` to leak
 *   }
 * }
 * ```
 */
export type RedactedActivity =
  | RedactedMultipleChoiceData
  | RedactedFillInTheBlanksData
  | RedactedWrittenResponseData
  | RedactedGapSelectData
  | RedactedDictationData
  | RedactedReadAloudData;
