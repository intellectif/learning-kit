import type { ActivityMedia } from './types/activity.js';
import type { AiGroupInput, AiMaterialFacts } from './types/ai.js';
import type { StimulusKind } from './types/item-group.js';

/**
 * What a model is told about the group a question sits in: the material the
 * learner reads and sees beside it.
 *
 * Internal: the request builders in `ai.ts` and `ai-writing.ts` are its public
 * face, through their `group` input.
 */

/**
 * The longest material text a model is given, in code points. A longer one is
 * cut and marked `truncated`: a long reading passage on an exam paper runs to
 * 4,000–7,000.
 */
export const AI_MATERIAL_MAX_LENGTH = 12_000;

// Every kind and every media type, so a new one does not compile until it is
// read here.
const KINDS: Record<StimulusKind, true> = {
  text: true,
  audio: true,
  video: true,
  image: true,
  mixed: true,
};
const MEDIA_TYPES: Record<ActivityMedia['type'], true> = {
  image: true,
  audio: true,
  video: true,
  embed: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A string with something in it, as written; otherwise nothing. */
const filled = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/**
 * `text` cut to {@link AI_MATERIAL_MAX_LENGTH} code points. The cut falls at
 * the last space in its second half, so no word is broken; in a script written
 * without spaces, at the limit itself.
 */
function cut(text: string): { text: string; truncated: boolean } {
  const points = [...text];
  if (points.length <= AI_MATERIAL_MAX_LENGTH) {
    return { text, truncated: false };
  }
  // From the code point just past the limit: a space there leaves every kept word whole.
  let end = AI_MATERIAL_MAX_LENGTH;
  for (let at = AI_MATERIAL_MAX_LENGTH; at >= AI_MATERIAL_MAX_LENGTH / 2; at -= 1) {
    if (/\s/u.test(points[at] as string)) {
      end = at;
      break;
    }
  }
  return { text: points.slice(0, end).join('').trimEnd(), truncated: true };
}

/**
 * The facts of `group`'s material, or `null` without a group or a stimulus it
 * can read: not an object, or of a kind the SDK does not know.
 *
 * Only what the learner sees reaches a model. The `transcript` is author-only
 * and never read, so the facts are the same for a whole group and a redacted
 * one; a media address is never read either, since a model cannot open one
 * and a signed address must not end up in a prompt. Each field is read once.
 */
export function materialFacts(group: AiGroupInput | undefined): AiMaterialFacts | null {
  if (!isRecord(group)) {
    return null;
  }
  const stimulus = group.stimulus;
  if (!isRecord(stimulus)) {
    return null;
  }
  const kind = stimulus.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) {
    return null;
  }
  const title = filled(stimulus.title) ?? filled(group.title);
  const body = filled(stimulus.body);
  const text = body === undefined ? undefined : cut(body);
  const rawMedia = stimulus.media;
  const mediaType = isRecord(rawMedia) ? rawMedia.type : undefined;
  const alt = isRecord(rawMedia) ? filled(rawMedia.alt) : undefined;
  const media =
    typeof mediaType === 'string' && Object.hasOwn(MEDIA_TYPES, mediaType)
      ? { type: mediaType as ActivityMedia['type'], ...(alt !== undefined ? { alt } : {}) }
      : undefined;
  const attribution = filled(stimulus.attribution);
  const locale = filled(stimulus.locale);
  return {
    kind: kind as StimulusKind,
    ...(title !== undefined ? { title } : {}),
    ...(text !== undefined ? { text: text.text } : {}),
    ...(text?.truncated === true ? { truncated: true as const } : {}),
    ...(media !== undefined ? { media } : {}),
    ...(attribution !== undefined ? { attribution } : {}),
    ...(locale !== undefined ? { locale } : {}),
  };
}
