import { cleanText, folded, needle, provenanceOf, usageOf } from './ai-text.js';
import { critiqueDraft } from './authoring/index.js';
import { UnknownActivityTypeError } from './errors.js';
import { getActivityTypeDescriptor } from './registry/index.js';
import type { ActivityType } from './types/activity.js';
import type {
  AiCritique,
  AiCritiqueField,
  AiCritiqueFinding,
  AiCritiqueKind,
  AiCritiqueRequest,
  AiRefusal,
} from './types/ai.js';

/** The most findings one critique may carry. More is refused, not cut. */
export const AI_CRITIQUE_MAX_FINDINGS = 20;

/** The longest message or quote in a finding, in code points. */
export const AI_CRITIQUE_MAX_FIELD_LENGTH = 500;

const KINDS: readonly string[] = [
  'ambiguous',
  'second-answer',
  'wrong-key',
  'implausible-distractor',
  'cue',
  'level',
  'language',
  'sensitivity',
  'other',
] satisfies readonly AiCritiqueKind[];

/**
 * Keys whose values are settings, ids or addresses — nothing a critique of the
 * item's words is about. A string under any of them is not a field to point at.
 */
const NOT_WORDS: ReadonlySet<string> = new Set([
  'id',
  'type',
  'schemaVersion',
  'mode',
  'scoringStrategy',
  'presentation',
  'locale',
  'languageTarget',
  'correctChoiceId',
  'bankId',
  'url',
  'captionsUrl',
  'match',
  'playback',
  'recording',
  'scoring',
  'ai',
  'learningObjectives',
  'hints',
  'kind',
  'timeline',
]);

/**
 * Every string an author wrote into an item, with its path: the question, the
 * options, the passage, the answers, the hints, the feedback, a picture's
 * `alt`. Settings, ids and addresses are left out, and so is any `…Html`
 * sidecar: the plain field beside it holds the same words.
 */
function fieldsOf(value: unknown, path: string[] = []): AiCritiqueField[] {
  if (typeof value === 'string') {
    return value.trim() === '' ? [] : [{ path, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => fieldsOf(entry, [...path, String(index)]));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) =>
      NOT_WORDS.has(key) || key.endsWith('Html') ? [] : fieldsOf(entry, [...path, key]),
    );
  }
  return [];
}

/**
 * What a model is given to review an item, or `null` when there is nothing to
 * review: a draft that is not an object, or one with no words in it yet.
 *
 * The facts are the item as the author wrote it — the answer key included; this
 * is for an author, never a learner — every text field a finding may point at,
 * and what the SDK's own critic already found there, so a model spends its
 * words on what a rule cannot see: a stem that reads two ways, a distractor
 * that is defensibly right, a key that is wrong, language above the level.
 *
 * Works for every registered type, the SDK's own and yours: the fields are read
 * from the draft itself.
 *
 * @throws UnknownActivityTypeError when `type` has no registered descriptor.
 */
export function aiCritiqueRequest(input: {
  type: ActivityType;
  draft: unknown;
  level?: string;
  authorLocale?: string;
}): AiCritiqueRequest | null {
  const { type, draft, level, authorLocale } = input;
  if (getActivityTypeDescriptor(type) === undefined) {
    throw new UnknownActivityTypeError(String(type));
  }
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    return null;
  }
  const fields = fieldsOf(draft);
  if (fields.length === 0) {
    return null;
  }
  return {
    feature: 'item-critique',
    facts: {
      activityType: String(type),
      item: draft as Readonly<Record<string, unknown>>,
      fields,
      findings: critiqueDraft(type, draft).map(({ path, code, message }) => ({
        path,
        code,
        message,
      })),
      ...(level !== undefined ? { level } : {}),
    },
    ...(authorLocale !== undefined ? { authorLocale } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const tooLong = (text: string): boolean => [...text].length > AI_CRITIQUE_MAX_FIELD_LENGTH;

/**
 * Checks a critique a port returned for `request`, and turns it into findings
 * an editor lists beside the SDK's own. As every AI answer, it is shown whole
 * or not at all.
 *
 * - **Every finding points at a field the item has.** Its `path` is one of
 *   `facts.fields`, exactly; a path to a field the item does not have refuses
 *   the whole reply as `contradicts-item`.
 * - **A quote is words that field contains**, typographic quotes and runs of
 *   spacing aside, case kept; one it does not refuses the reply the same way.
 * - **Every finding is `advice`.** It is a model's opinion about the item, and
 *   nothing in the SDK acts on it; its code is `ai_` and the kind
 *   (`ai_second_answer`).
 * - **Limits:** {@link AI_CRITIQUE_MAX_FINDINGS} findings; a message or quote of
 *   {@link AI_CRITIQUE_MAX_FIELD_LENGTH} code points; over them `too-long`. A
 *   kind the SDK does not name, or any other shape, is `malformed`.
 */
export function checkAiCritique(
  raw: unknown,
  request: AiCritiqueRequest,
): { ok: true; critique: AiCritique } | { ok: false; refusal: AiRefusal } {
  if (!isRecord(raw) || !Array.isArray(raw.findings)) {
    return { ok: false, refusal: 'malformed' };
  }
  if (raw.findings.length > AI_CRITIQUE_MAX_FINDINGS) {
    return { ok: false, refusal: 'too-long' };
  }
  const fields = new Map(request.facts.fields.map((field) => [JSON.stringify(field.path), field]));
  const findings: AiCritiqueFinding[] = [];
  for (const entry of raw.findings) {
    if (
      !isRecord(entry) ||
      !Array.isArray(entry.path) ||
      !entry.path.every((segment) => typeof segment === 'string' || typeof segment === 'number') ||
      typeof entry.kind !== 'string' ||
      !KINDS.includes(entry.kind) ||
      typeof entry.message !== 'string' ||
      (entry.quote !== undefined && entry.quote !== null && typeof entry.quote !== 'string')
    ) {
      return { ok: false, refusal: 'malformed' };
    }
    const message = cleanText(entry.message);
    const quote = typeof entry.quote === 'string' ? cleanText(entry.quote) : undefined;
    if (message === '' || quote === '') {
      return { ok: false, refusal: 'malformed' };
    }
    if (tooLong(message) || (quote !== undefined && tooLong(quote))) {
      return { ok: false, refusal: 'too-long' };
    }
    const field = fields.get(JSON.stringify(entry.path.map(String)));
    if (field === undefined) {
      return { ok: false, refusal: 'contradicts-item' };
    }
    if (quote !== undefined && !folded(field.text).chars.includes(needle(quote))) {
      return { ok: false, refusal: 'contradicts-item' };
    }
    findings.push({
      path: field.path,
      code: `ai_${entry.kind.replace(/-/g, '_')}`,
      message,
      severity: 'advice',
      ...(quote !== undefined ? { quote } : {}),
    });
  }
  const provenance = provenanceOf(raw.provenance);
  const usage = usageOf(raw.usage);
  return {
    ok: true,
    critique: {
      findings,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}
