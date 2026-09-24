import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod/v4';
import type * as Types from '../../types/redacted.js';
import type { RedactedStimulusSchema } from '../item-group.js';
import type * as Schemas from '../redacted.js';

/**
 * The redacted types are written out, so the published types name no
 * validation library — and pinned here to the strict schemas `assertRedacted`
 * checks against, so a field added to one and not the other fails the build
 * (`pnpm typecheck` checks these assertions; the test runner does not).
 */
describe('the written-out redacted types', () => {
  it('are exactly what the strict schemas accept', () => {
    expectTypeOf<Types.RedactedMultipleChoiceOptionMedia>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedMultipleChoiceOptionMediaSchema>
    >();
    expectTypeOf<Types.RedactedMultipleChoiceOption>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedMultipleChoiceOptionSchema>
    >();
    expectTypeOf<Types.RedactedMultipleChoiceData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedMultipleChoiceDataSchema>
    >();
    expectTypeOf<Types.RedactedBlankConfig>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedBlankConfigSchema>
    >();
    expectTypeOf<Types.RedactedFillInTheBlanksData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedFillInTheBlanksDataSchema>
    >();
    expectTypeOf<Types.RedactedWrittenResponseData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedWrittenResponseDataSchema>
    >();
    expectTypeOf<Types.RedactedGapSelectChoice>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedGapSelectChoiceSchema>
    >();
    expectTypeOf<Types.RedactedGapSelectBank>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedGapSelectBankSchema>
    >();
    expectTypeOf<Types.RedactedGapSelectGap>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedGapSelectGapSchema>
    >();
    expectTypeOf<Types.RedactedGapSelectData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedGapSelectDataSchema>
    >();
    expectTypeOf<Types.RedactedDictationSlowMedia>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedDictationSlowMediaSchema>
    >();
    expectTypeOf<Types.RedactedDictationData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedDictationDataSchema>
    >();
    expectTypeOf<Types.RedactedReadAloudData>().toEqualTypeOf<
      z.infer<typeof Schemas.RedactedReadAloudDataSchema>
    >();
    expectTypeOf<Types.RedactedStimulus>().toEqualTypeOf<z.infer<typeof RedactedStimulusSchema>>();
  });
});
