import { z } from 'zod/v4';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';

/**
 * JSON Schema (Draft 7) representation of the Multiple Choice activity data
 * contract, generated natively by Zod 4. Draft 7 is mandated by Requirement
 * 2.2 for the widest AI-prompt / OpenAPI tooling compatibility. The semantic
 * `.refine()` guards are not representable in JSON Schema and are
 * intentionally omitted — the export captures the *structural* contract only.
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
