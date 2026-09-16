import { z } from 'zod/v4';
import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import { DictationDataSchema } from './dictation.js';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { GapSelectDataSchema } from './gap-select.js';
import { ItemGroupSchema, StimulusSchema } from './item-group.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';
import { ReadAloudDataSchema } from './read-aloud.js';
import { WrittenResponseDataSchema } from './written-response.js';

/**
 * JSON Schema (Draft 7) for a `Stimulus`. Structural contract only — the
 * kind/media/body consistency guards are Zod-only.
 */
export const stimulusJsonSchema = z.toJSONSchema(StimulusSchema, { target: 'draft-7' });

/**
 * JSON Schema (Draft 7) for an `ItemGroup` CONTAINER. Items appear as objects
 * with `type` and `id` only; each item's own contract is `jsonSchemaFor(type)`.
 * For an AI generation pipeline, ask for the group and each item separately
 * rather than a single nested schema — that keeps the per-type schema the
 * registry's, not a copy.
 */
export const itemGroupJsonSchema = z.toJSONSchema(ItemGroupSchema, { target: 'draft-7' });

/**
 * JSON Schema (Draft 7) representation of the Multiple Choice activity data
 * contract, generated natively by Zod 4. Draft 7 is mandated by Requirement
 * 2.2 for the widest AI-prompt / OpenAPI tooling compatibility. The semantic
 * `.refine()` guards are not representable in JSON Schema and are
 * intentionally omitted — the export captures the *structural* contract only.
 * Since v0.3 the source schemas are loose, so these no longer emit
 * `additionalProperties: false` — the JSON Schema and `validateActivity` now
 * agree on unknown-key handling.
 */
/**
 * JSON Schema (Draft 7) representation of the Gap Select activity data
 * contract. Structural contract only: the six semantic guards — the
 * passage/gap bijection, id uniqueness, the one-choice-source rule, and an
 * answer key that names a choice the gap offers — are Zod-only, as they are
 * for the other types.
 */
export const gapSelectJsonSchema = z.toJSONSchema(GapSelectDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Dictation activity data
 * contract. Structural contract, plus the raw length caps JSON Schema can
 * state in code points as zod counts them — `maxLength` 2000 on a transcript
 * and an accepted transcript, 200 on a rule's `from` and `to`. The twelve
 * semantic guards — a transcript that survives normalisation, the caps after
 * equivalences are applied, distinct candidates, audio only, the
 * slow-recording rules, no captions, no transcript in the title — are
 * Zod-only, as they are for the other types.
 */
export const dictationJsonSchema = z.toJSONSchema(DictationDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Read Aloud activity data
 * contract. Structural contract, plus the raw cap JSON Schema can state in code
 * points as zod counts them — `maxLength` 2000 on the reference text — and the
 * canonical locale pattern. The ten semantic guards — the cap after
 * normalisation, a text that survives it, the spaced-script rule, the
 * model-recording rules, unique dimensions, a weight above 0, and the take
 * bounds — are Zod-only, as they are for the other types.
 */
export const readAloudJsonSchema = z.toJSONSchema(ReadAloudDataSchema, {
  target: 'draft-7',
});

export const multipleChoiceJsonSchema = z.toJSONSchema(MultipleChoiceDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Fill-in-the-Blanks activity data
 * contract, generated natively by Zod 4. Structural contract only (semantic
 * `.refine()` guards are Zod-only and not representable in JSON Schema).
 */
export const fillInTheBlanksJsonSchema = z.toJSONSchema(FillInTheBlanksDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Written Response activity data
 * contract. Structural contract only.
 */
export const writtenResponseJsonSchema = z.toJSONSchema(WrittenResponseDataSchema, {
  target: 'draft-7',
});

/**
 * Derives the JSON Schema (Draft 7) for any REGISTERED activity type — the
 * live, registry-backed replacement for the static per-type exports above,
 * and the building block for AI generation pipelines (R6.1): pass the result
 * as a structured-output schema so a model can only emit valid items.
 *
 * @throws UnknownActivityTypeError when `type` has no registered descriptor.
 */
export function jsonSchemaFor(type: string): Record<string, unknown> {
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(type);
  }
  return z.toJSONSchema(descriptor.schema as never, { target: 'draft-7' }) as Record<
    string,
    unknown
  >;
}
