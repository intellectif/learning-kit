import * as z from 'zod/v4';

/**
 * What an author allows AI to do for one item: see `ActivityAiPermissions`.
 * Loose like every content schema, so a key a later release adds survives an
 * older one's validation (B7).
 */
export const AiPermissionsSchema = z.looseObject({
  explanations: z.boolean().optional(),
  hints: z.boolean().optional(),
});
