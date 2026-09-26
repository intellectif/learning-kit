import * as z from 'zod/v4';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { PLACEHOLDER_RE } from './fill-in-the-blanks.js';
import { MediaSchema } from './media.js';

/**
 * Zod schema for one selectable choice. Loose, like every other schema here:
 * unknown keys are preserved so a consumer sidecar survives validation.
 */
export const GapSelectChoiceSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1),
});

/** Zod schema for a shared word bank. */
export const GapSelectBankSchema = z.looseObject({
  id: z.string().min(1),
  choices: z.array(GapSelectChoiceSchema).min(2),
});

/** Zod schema for one gap. The `choices` / `bankId` exclusivity is checked on the activity. */
export const GapSelectGapSchema = z.looseObject({
  id: z.string().min(1),
  choices: z.array(GapSelectChoiceSchema).min(2).optional(),
  bankId: z.string().min(1).optional(),
  correctChoiceId: z.string().min(1),
  feedback: z.string().optional(),
});

/** Every choice a gap offers, or `undefined` when its source is missing or unresolvable. */
function resolveChoices(
  gap: z.infer<typeof GapSelectGapSchema>,
  banks: readonly z.infer<typeof GapSelectBankSchema>[],
): z.infer<typeof GapSelectChoiceSchema>[] | undefined {
  if (gap.choices !== undefined) {
    return gap.bankId === undefined ? gap.choices : undefined;
  }
  if (gap.bankId === undefined) {
    return undefined;
  }
  return banks.find((bank) => bank.id === gap.bankId)?.choices;
}

/** The distinct `{{id}}` placeholders in a passage, in the order they appear, with their counts. */
function placeholderCounts(passage: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of passage.matchAll(PLACEHOLDER_RE)) {
    const id = match[1] as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Zod schema validating the full Gap Select data contract.
 *
 * Six semantic guards, none of them expressible in JSON Schema and all of them
 * authoring errors that would otherwise reach a learner:
 *
 * 1. **Bank ids are unique** — two banks sharing an id makes which one a gap
 *    draws from a matter of array order.
 * 2. **Gap ids are unique** — the scorer looks a gap's selection up by id, so a
 *    duplicate makes one gap unscoreable (the same defect the Multiple Choice
 *    option-id guard exists for).
 * 3. **Passage placeholders and gaps pair one to one**, each `{{id}}` appearing
 *    exactly once — the Fill-in-the-Blanks bijection, for the same reason: a
 *    gap with nowhere to render is a question the learner never sees, and a
 *    placeholder with no gap renders as literal `{{id}}` text.
 * 4. **Exactly one choice source per gap** — `choices` or `bankId`, never both
 *    and never neither.
 * 5. **A `bankId` names a bank that exists.**
 * 6. **`correctChoiceId` is one of the choices the gap actually offers**, and
 *    choice ids within a resolved set are unique. An answer key pointing at a
 *    choice nobody can pick is an item that cannot be passed.
 */
export const GapSelectDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('gap-select'),
    id: z.string().min(1),
    title: z.string().min(1),
    passage: z.string().min(1),
    passageHtml: z.string().optional(),
    gaps: z.array(GapSelectGapSchema).min(1),
    banks: z.array(GapSelectBankSchema).optional(),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    presentation: z.literal('dropdown').optional(),
    shuffleChoices: z.boolean().optional(),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
    ai: AiPermissionsSchema.optional(),
  })
  .refine(
    (data) => {
      const ids = (data.banks ?? []).map((bank) => bank.id);
      return new Set(ids).size === ids.length;
    },
    { error: 'Word bank ids must be unique.', path: ['banks'] },
  )
  .refine(
    (data) => {
      const ids = data.gaps.map((gap) => gap.id);
      return new Set(ids).size === ids.length;
    },
    { error: 'Gap ids must be unique.', path: ['gaps'] },
  )
  .refine(
    (data) => {
      const counts = placeholderCounts(data.passage);
      const ids = data.gaps.map((gap) => gap.id);
      return (
        counts.size === new Set(ids).size &&
        ids.every((id) => counts.get(id) === 1) &&
        [...counts.values()].every((count) => count === 1)
      );
    },
    {
      error:
        'Every gap must appear exactly once in the passage as {{gap_id}}, and every {{gap_id}} must have a gap.',
      path: ['passage'],
    },
  )
  .refine(
    (data) => data.gaps.every((gap) => (gap.choices === undefined) !== (gap.bankId === undefined)),
    {
      error: 'Each gap needs exactly one choice source: its own `choices`, or a `bankId`.',
      path: ['gaps'],
    },
  )
  .refine(
    (data) => {
      const bankIds = new Set((data.banks ?? []).map((bank) => bank.id));
      return data.gaps.every((gap) => gap.bankId === undefined || bankIds.has(gap.bankId));
    },
    { error: 'A gap references a `bankId` that no word bank defines.', path: ['gaps'] },
  )
  .refine(
    (data) => {
      const banks = data.banks ?? [];
      return data.gaps.every((gap) => {
        const choices = resolveChoices(gap, banks);
        if (choices === undefined) {
          // Guards 4 and 5 already report this; do not fail twice for one cause.
          return true;
        }
        const ids = choices.map((choice) => choice.id);
        return new Set(ids).size === ids.length && ids.includes(gap.correctChoiceId);
      });
    },
    {
      error:
        'Each gap needs unique choice ids and a `correctChoiceId` that is one of the choices it offers.',
      path: ['gaps'],
    },
  );
