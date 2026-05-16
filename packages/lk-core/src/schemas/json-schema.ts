import { z } from 'zod/v4';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';

/**
 * JSON Schema (draft 2020-12) representation of the Multiple Choice activity
 * data contract, generated natively by Zod 4. The semantic `.refine()` guard
 * is not representable in JSON Schema and is intentionally omitted from output.
 */
export const multipleChoiceJsonSchema = z.toJSONSchema(MultipleChoiceDataSchema);

/**
 * JSON Schema (draft 2020-12) representation of the Fill-in-the-Blanks activity
 * data contract, generated natively by Zod 4.
 */
export const fillInTheBlanksJsonSchema = z.toJSONSchema(FillInTheBlanksDataSchema);
