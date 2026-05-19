import fc from 'fast-check';
import {
  arbitraryFillInTheBlanksData,
  arbitraryMultipleChoiceData,
} from '../../schemas/__tests__/arbitraries.js';
import type {
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
} from '../../types/activity.js';

export { arbitraryFillInTheBlanksData, arbitraryMultipleChoiceData };

/** Any subset (incl. empty / all) of the activity's option ids. */
export function arbitraryMultipleChoiceLearnerResponse(
  data: MultipleChoiceData,
): fc.Arbitrary<MultipleChoiceLearnerResponse> {
  return fc
    .subarray(data.options.map((o) => o.id))
    .map((selectedOptionIds) => ({ type: 'multiple-choice', selectedOptionIds }));
}

/**
 * Per blank: a correct accepted answer, an arbitrary string, or omitted
 * (missing key) — exercises correct / incorrect / empty paths.
 */
export function arbitraryFillInTheBlanksLearnerResponse(
  data: FillInTheBlanksData,
): fc.Arbitrary<FillInTheBlanksLearnerResponse> {
  const perBlank = data.blanks.map((blank) =>
    fc.oneof(
      fc.constantFrom(...blank.acceptedAnswers).map((v) => ({ id: blank.id, v }) as const),
      fc.string().map((v) => ({ id: blank.id, v }) as const),
      fc.constant(null).map(() => ({ id: blank.id, v: null }) as const),
    ),
  );
  return fc.tuple(...perBlank).map((entries) => {
    const answers: Record<string, string> = {};
    for (const e of entries) {
      if (e.v !== null) {
        answers[e.id] = e.v;
      }
    }
    return { type: 'fill-in-the-blanks', answers };
  });
}
