import { aiAllowedByContent, aiSupports, readAiTextResult } from './ai.js';
import { cleanText } from './ai-text.js';
import { alignReadAloud } from './scoring/speech/align.js';
import { validateSpeechAssessment } from './scoring/speech/assessment.js';
import type { ReadAloudData } from './types/activity.js';
import type {
  AiActivityInput,
  AiCoaching,
  AiCoachingRequest,
  AiReadingFacts,
  AiReadingWordFact,
  AiRefusal,
  AiSoundFact,
} from './types/ai.js';
import type { GradeRecord } from './types/grading.js';
import type { SpeechAssessment } from './types/speech.js';

/** The most words one coaching may work on. More is refused, not cut. */
export const AI_COACHING_MAX_WORDS = 20;

/** The longest tip for one word, in code points. */
export const AI_COACHING_MAX_TIP_LENGTH = 500;

/** The longest sound symbol: a phoneme, not a sentence. */
const MAX_SYMBOL_LENGTH = 16;

/** The dimensions a reading is scored on, as the facts name them. */
const DIMENSIONS = ['accuracy', 'fluency', 'completeness', 'prosody'] as const;

/** Two decimals: what a stored score out of 1 was, out of 100, without float noise. */
const hundredths = (value: number): number => Math.round(value * 10000) / 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A word's sounds as the engine reported them: only those it names. */
function soundsOf(word: SpeechAssessment['words'][number] | undefined): AiSoundFact[] | undefined {
  const sounds: AiSoundFact[] = [];
  for (const phoneme of word?.phonemes ?? []) {
    if (typeof phoneme.symbol !== 'string') {
      continue;
    }
    sounds.push({
      symbol: phoneme.symbol,
      ...(phoneme.accuracy !== undefined ? { accuracy: phoneme.accuracy } : {}),
      ...(phoneme.heardAs !== undefined && phoneme.heardAs.length > 0
        ? { heardAs: phoneme.heardAs.map(({ symbol, score }) => ({ symbol, score })) }
        : {}),
    });
  }
  return sounds.length > 0 ? sounds : undefined;
}

/** The facts from the engine's full assessment: every word's mark, and its sounds. */
function fromAssessment(
  item: ReadAloudData,
  assessment: SpeechAssessment,
): Pick<AiReadingFacts, 'assessor' | 'phonemeAlphabet' | 'scores' | 'words'> {
  const words: AiReadingWordFact[] = alignReadAloud(item, assessment).map((entry) => {
    const sounds =
      entry.itemId !== undefined && entry.wordIndex !== undefined
        ? soundsOf(assessment.words[entry.wordIndex])
        : undefined;
    return {
      ...(entry.itemId !== undefined ? { itemId: entry.itemId } : {}),
      word: entry.reference,
      heard: entry.heard,
      state: entry.state,
      ...(entry.accuracy !== undefined ? { accuracy: entry.accuracy } : {}),
      ...(sounds !== undefined ? { sounds } : {}),
    };
  });
  const scores: AiReadingFacts['scores'] = {};
  for (const dimension of DIMENSIONS) {
    const value = assessment.scores[dimension];
    if (value !== undefined) {
      scores[dimension] = value;
    }
  }
  return {
    assessor: assessment.assessor.kind,
    ...(assessment.phonemeAlphabet !== undefined
      ? { phonemeAlphabet: assessment.phonemeAlphabet }
      : {}),
    scores,
    words,
  };
}

/**
 * Whether an assessment holds marks on this text: one `validateSpeechAssessment`
 * accepts, of speech heard, made against the item's own text in its own locale
 * — the checks `gradeReadAloud` makes before it reads a mark. Anything else is
 * not marks on this reading, and would tell a model every word was left out.
 */
const marksThisText = (item: ReadAloudData, assessment: SpeechAssessment): boolean =>
  validateSpeechAssessment(assessment).success &&
  assessment.status === 'assessed' &&
  assessment.task === 'scripted' &&
  assessment.locale === item.locale &&
  assessment.referenceText === item.referenceText;

const STATE_OF_OUTCOME = {
  correct: 'correct',
  incorrect: 'mispronounced',
  'incorrect-omission': 'omitted',
} as const;

/**
 * The facts from a stored grade alone: each word's mark and score, and no
 * sounds — a grade's details do not keep them.
 */
function fromGrade(
  grade: GradeRecord,
): Pick<AiReadingFacts, 'assessor' | 'scores' | 'words'> | null {
  if (!Array.isArray(grade.details) || grade.details.length === 0) {
    return null;
  }
  const words: AiReadingWordFact[] = [];
  for (const detail of grade.details) {
    const state = STATE_OF_OUTCOME[detail.outcome as keyof typeof STATE_OF_OUTCOME];
    if (state === undefined || typeof detail.itemId !== 'string') {
      continue;
    }
    const text = (value: string | string[]): string =>
      Array.isArray(value) ? value.join(' ') : value;
    words.push({
      itemId: detail.itemId,
      word: text(detail.correctResponse),
      heard: text(detail.learnerResponse),
      state,
      ...(state !== 'omitted' && isFiniteNumber(detail.score)
        ? { accuracy: hundredths(detail.score) }
        : {}),
    });
  }
  if (words.length === 0) {
    return null;
  }
  // Each dimension out of 100, whatever scale the grade kept it on. A criterion
  // without a scale to read it on is left out rather than given one.
  const scores: AiReadingFacts['scores'] = {};
  for (const criterion of grade.criteria ?? []) {
    const dimension = DIMENSIONS.find((name) => name === criterion.name);
    if (
      dimension !== undefined &&
      isFiniteNumber(criterion.score) &&
      isFiniteNumber(criterion.maxScore) &&
      criterion.maxScore > 0
    ) {
      scores[dimension] = hundredths(criterion.score / criterion.maxScore);
    }
  }
  const kind = grade.grader?.kind;
  return {
    assessor: kind === 'auto' || kind === 'ai' || kind === 'human' ? kind : 'unknown',
    scores,
    words,
  };
}

/**
 * The request for coaching on a graded reading, or `null` when there is none
 * to give: not a read-aloud, an author who switched explanations off (coaching
 * reads `ai.explanations`), or no marks.
 *
 * The marks come from the `assessment` when one is given — with each word's
 * sounds and what each was heard as — and then only from it: an assessment
 * `gradeReadAloud` would not read (no speech heard, unscripted, or made against
 * another text or locale) gives none, rather than a stored grade's marks the
 * learner is not looking at. With no assessment, they come from
 * `grade.details`, without sounds.
 *
 * The facts are the text as the learner saw it, those marks word by word, and
 * the engine's dimension scores. The marks are the engine's; the model
 * explains them.
 */
export function aiCoachingRequest(input: {
  data: AiActivityInput;
  assessment?: SpeechAssessment | null;
  grade?: GradeRecord | null;
  learnerLocale?: string;
}): AiCoachingRequest | null {
  const { data, assessment, grade, learnerLocale } = input;
  if (
    !aiSupports(data.type, 'pronunciation-coaching') ||
    !aiAllowedByContent(data, 'pronunciation-coaching')
  ) {
    return null;
  }
  const item = data as unknown as ReadAloudData;
  if (typeof item.referenceText !== 'string' || typeof item.locale !== 'string') {
    return null;
  }
  // An assessment given is the marks, and the only ones: a learner looking at
  // it is not looking at a stored grade's, and coaching must be about what is
  // on screen.
  const marks =
    assessment !== undefined && assessment !== null
      ? marksThisText(item, assessment)
        ? fromAssessment(item, assessment)
        : null
      : grade !== undefined && grade !== null
        ? fromGrade(grade)
        : null;
  if (marks === null) {
    return null;
  }
  const graded =
    grade !== undefined &&
    grade !== null &&
    isFiniteNumber(grade.score) &&
    isFiniteNumber(grade.maxScore) &&
    typeof grade.passed === 'boolean'
      ? { score: grade.score, maxScore: grade.maxScore, passed: grade.passed }
      : undefined;
  return {
    feature: 'pronunciation-coaching',
    facts: {
      activityType: 'read-aloud',
      activityId: data.id,
      title: data.title,
      locale: item.locale,
      referenceText: item.referenceText,
      ...(typeof item.instructions === 'string' ? { instructions: item.instructions } : {}),
      ...marks,
    },
    ...(graded !== undefined ? { grade: graded } : {}),
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  };
}

// ── Checking what comes back ───────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A symbol as it is compared: composed, and without the spaces around it. */
const symbolKey = (symbol: string): string => symbol.normalize('NFC').trim();

type Refused = { ok: false; refusal: AiRefusal };

/**
 * Checks coaching a port returned for `request`, and turns it into what a
 * learner is shown. As every AI text, it is shown whole or not at all.
 *
 * - **The text** is read as every AI text is (`readAiTextResult`).
 * - **Every word coached is one the engine marked.** Each `itemId` names a word
 *   of the text marked `mispronounced` or `omitted`, once; coaching on a word
 *   read correctly, or one the text does not have, refuses the whole reply as
 *   `contradicts-marks`. Praise belongs in `text`.
 * - **Every sound named is one the engine reported** for that word, and a sound
 *   it was heard as is one the engine heard it as. Where the facts carry no
 *   sounds — marks from a stored grade, or an assessor that reports none — any
 *   sound is `contradicts-marks`: nothing stands behind it.
 * - **Nothing numeric is read.** A score in the reply is ignored: the marks and
 *   the grade are the engine's.
 * - **Limits:** {@link AI_COACHING_MAX_WORDS} words, a tip of
 *   {@link AI_COACHING_MAX_TIP_LENGTH} code points; over them `too-long`. A
 *   shape that is not the one documented is `malformed`.
 *
 * The words come back in reading order, each with the word as the marks show it
 * (the SDK's reading of the text, never the model's), and each sound spelt as
 * the engine spelt it.
 */
export function checkAiCoaching(
  raw: unknown,
  request: AiCoachingRequest,
): { ok: true; coaching: AiCoaching } | { ok: false; refusal: AiRefusal } {
  const read = readAiTextResult(raw);
  if (!read.ok) {
    return read;
  }
  const entries = (raw as Record<string, unknown>).words;
  const words: (AiCoaching['words'][number] & { order: number })[] = [];
  if (entries !== undefined && entries !== null) {
    if (!Array.isArray(entries)) {
      return { ok: false, refusal: 'malformed' };
    }
    if (entries.length > AI_COACHING_MAX_WORDS) {
      return { ok: false, refusal: 'too-long' };
    }
    const facts = new Map<string, { fact: AiReadingWordFact; order: number }>();
    request.facts.words.forEach((fact, order) => {
      if (fact.itemId !== undefined) {
        facts.set(fact.itemId, { fact, order });
      }
    });
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.itemId !== 'string' || typeof entry.tip !== 'string') {
        return { ok: false, refusal: 'malformed' };
      }
      const tip = cleanText(entry.tip);
      if (tip === '') {
        return { ok: false, refusal: 'malformed' };
      }
      if ([...tip].length > AI_COACHING_MAX_TIP_LENGTH) {
        return { ok: false, refusal: 'too-long' };
      }
      if (seen.has(entry.itemId)) {
        return { ok: false, refusal: 'malformed' };
      }
      seen.add(entry.itemId);
      const found = facts.get(entry.itemId);
      if (
        found === undefined ||
        (found.fact.state !== 'mispronounced' && found.fact.state !== 'omitted')
      ) {
        return { ok: false, refusal: 'contradicts-marks' };
      }
      const sound = checkSound(entry.sound, found.fact);
      if (sound !== undefined && 'refusal' in sound) {
        return sound;
      }
      words.push({
        itemId: entry.itemId,
        word: found.fact.word,
        tip,
        ...(sound !== undefined ? { sound } : {}),
        order: found.order,
      });
    }
  }
  const { text, provenance, usage } = read.result;
  return {
    ok: true,
    coaching: {
      text,
      words: words.sort((a, b) => a.order - b.order).map(({ order: _order, ...word }) => word),
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}

/** A sound a model names, checked against the sounds the engine reported for the word. */
function checkSound(
  raw: unknown,
  fact: AiReadingWordFact,
): { expected: string; heard?: string } | Refused | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (
    !isRecord(raw) ||
    typeof raw.expected !== 'string' ||
    (raw.heard !== undefined && raw.heard !== null && typeof raw.heard !== 'string')
  ) {
    return { ok: false, refusal: 'malformed' };
  }
  const heard = typeof raw.heard === 'string' ? raw.heard : undefined;
  if (
    [...raw.expected].length > MAX_SYMBOL_LENGTH ||
    (heard !== undefined && [...heard].length > MAX_SYMBOL_LENGTH)
  ) {
    return { ok: false, refusal: 'too-long' };
  }
  const expected = symbolKey(raw.expected);
  const reported = fact.sounds?.find((sound) => symbolKey(sound.symbol) === expected);
  if (reported === undefined) {
    return { ok: false, refusal: 'contradicts-marks' };
  }
  if (heard === undefined) {
    return { expected: reported.symbol };
  }
  const instead = reported.heardAs?.find(
    (candidate) => symbolKey(candidate.symbol) === symbolKey(heard),
  );
  if (instead === undefined) {
    return { ok: false, refusal: 'contradicts-marks' };
  }
  return { expected: reported.symbol, heard: instead.symbol };
}
