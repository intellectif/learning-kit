import type { z } from 'zod/v4';

/**
 * `schema`, refusing a string longer than `max` UTF-16 code units — its
 * JavaScript `length`, the unit these limits have always counted in.
 *
 * Not zod's `.max()`: the v4 build in zod 3.25 counted UTF-16 units, and zod 4.6
 * counts code points, so four thousand emoji that one refused under a limit of
 * 8000 the other accepts. The unit a limit counts in decides what is accepted —
 * and, for an assessment, what is graded — so it is the SDK's to keep, and is
 * written out here. The JSON Schema export still states the limit as
 * `maxLength`, which counts code points: never stricter than this.
 */
export function maxUnits<T extends z.ZodString>(schema: T, max: number): T {
  return schema
    .check((payload) => {
      if (payload.value.length > max) {
        payload.issues.push({
          code: 'too_big',
          origin: 'string',
          maximum: max,
          inclusive: true,
          input: payload.value,
        });
      }
    })
    .meta({ maxLength: max }) as T;
}
