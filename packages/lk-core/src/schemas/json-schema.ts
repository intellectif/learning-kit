import { z } from 'zod/v4';
import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { ItemGroupSchema, StimulusSchema } from './item-group.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';
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
