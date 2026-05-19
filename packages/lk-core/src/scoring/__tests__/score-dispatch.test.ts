import { describe, expect, it } from 'vitest';
import { UnknownActivityTypeError } from '../../errors.js';
import type { ActivityData, ActivityType, LearnerResponse } from '../../types/index.js';
import { score } from '../index.js';

describe('score() dispatch', () => {
  it('throws UnknownActivityTypeError for an unrecognised activity type', () => {
    expect(() =>
      score(
        'drag-and-drop' as ActivityType,
        { type: 'drag-and-drop' } as unknown as ActivityData,
        { type: 'drag-and-drop' } as unknown as LearnerResponse,
      ),
    ).toThrow(UnknownActivityTypeError);
  });
});
