import { z } from 'zod/v4';

/**
 * A check zod runs even when another field was refused. An ordinary check is
 * skipped once any issue has been reported, so an author fixing a recording's
 * address would only then learn that the title gives the answer away. The
 * check itself decides which of its guards the refused fields leave nothing to
 * read — read them through {@link parsedFields}.
 */
export function checkEvenAfterIssues<T>(
  check: (payload: z.core.ParsePayload<T>) => void,
): z.core.$ZodCheck<T> {
  const guard: z.core.$ZodCheck<T> = new z.core.$ZodCheck({ check: 'custom', when: () => true });
  guard._zod.check = check;
  return guard;
}

/**
 * What a check that runs after other issues may read: the value with every
 * top-level key an issue was reported under taken out, and the set of those
 * keys.
 *
 * A guard must never read a field that did not parse — a refused list of a
 * thousand pasted transcripts must not be measured, and a refused `null` is not
 * text — and what zod leaves in the value for one is not the SDK's to rely on:
 * the v4 build in zod 3.25 left a refused optional key out, and zod 4.6 keeps it
 * as it was given. So the check takes it out itself. A guard that needs a
 * required key asks `refused` first.
 */
export function parsedFields<T extends object>(
  payload: z.core.ParsePayload<T>,
): { data: T; refused: ReadonlySet<string> } {
  const refused = new Set(payload.issues.map((issue) => String(issue.path?.[0])));
  const data = { ...payload.value } as Record<string, unknown>;
  for (const key of refused) {
    delete data[key];
  }
  return { data: data as T, refused };
}
