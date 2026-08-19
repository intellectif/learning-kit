import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { validateActivity } from '../../schemas/index.js';
import { evaluate } from '../../scoring/index.js';
import type { ActivityData, ActivityType, LearnerResponse } from '../../types/index.js';
import {
  defineActivityType,
  getActivityTypeDescriptor,
  registerActivityType,
  registeredActivityTypes,
} from '../index.js';

interface TestCustomData {
  type: 'test-custom-x';
  value: number;
}

interface TestCustomResponse {
  picked: number;
}

const TestCustomSchema = z.object({
  type: z.literal('test-custom-x'),
  value: z.number(),
});

const testCustomType = defineActivityType<TestCustomData, TestCustomResponse>({
  type: 'test-custom-x',
  schema: TestCustomSchema as unknown as z.ZodType<TestCustomData>,
  scoring: {
    kind: 'sync',
    score: (data, response) => ({
      score: response.picked === data.value ? 1 : 0,
      maxScore: 1,
      feedback: null,
      details: [],
    }),
  },
});

describe('registry built-ins', () => {
  it('registers the three built-in activity types', () => {
    const types = registeredActivityTypes();
    expect(types).toContain('multiple-choice');
    expect(types).toContain('fill-in-the-blanks');
    expect(types).toContain('written-response');
  });

  it('returns the multiple-choice descriptor with sync scoring', () => {
    const descriptor = getActivityTypeDescriptor('multiple-choice');
    expect(descriptor).toBeDefined();
    expect(descriptor?.type).toBe('multiple-choice');
    expect(descriptor?.scoring.kind).toBe('sync');
  });

  it('returns the fill-in-the-blanks descriptor with sync scoring', () => {
    const descriptor = getActivityTypeDescriptor('fill-in-the-blanks');
    expect(descriptor).toBeDefined();
    expect(descriptor?.type).toBe('fill-in-the-blanks');
    expect(descriptor?.scoring.kind).toBe('sync');
  });

  it('returns the written-response descriptor with deferred scoring', () => {
    const descriptor = getActivityTypeDescriptor('written-response');
    expect(descriptor).toBeDefined();
    expect(descriptor?.type).toBe('written-response');
    expect(descriptor?.scoring.kind).toBe('deferred');
    if (descriptor?.scoring.kind === 'deferred') {
      expect(descriptor.scoring.reason).toBe('requires_async_grading');
    }
  });

  it('returns undefined for an unregistered type', () => {
    expect(getActivityTypeDescriptor('nope')).toBeUndefined();
  });
});

describe('registering a custom activity type', () => {
  it('makes the descriptor retrievable and listed', () => {
    registerActivityType(testCustomType);
    expect(registeredActivityTypes()).toContain('test-custom-x');
    const descriptor = getActivityTypeDescriptor('test-custom-x');
    expect(descriptor?.type).toBe('test-custom-x');
    expect(descriptor?.scoring.kind).toBe('sync');
  });

  it('makes validateActivity work for the custom type', () => {
    registerActivityType(testCustomType);

    const ok = validateActivity('test-custom-x' as ActivityType, {
      type: 'test-custom-x',
      value: 42,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect((ok.data as unknown as TestCustomData).value).toBe(42);
    }

    const bad = validateActivity('test-custom-x' as ActivityType, {
      type: 'test-custom-x',
      value: 'not-a-number',
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.errors.length).toBeGreaterThan(0);
      expect(bad.errors[0]?.path).toEqual(['value']);
    }
  });

  it('makes evaluate work for the custom type', () => {
    registerActivityType(testCustomType);

    const data: TestCustomData = { type: 'test-custom-x', value: 7 };

    const correct = evaluate(
      data as unknown as ActivityData,
      { picked: 7 } as unknown as LearnerResponse,
    );
    expect(correct).toEqual({
      status: 'scored',
      score: 1,
      maxScore: 1,
      passed: true,
      feedback: null,
      details: [],
    });

    const incorrect = evaluate(
      data as unknown as ActivityData,
      { picked: 8 } as unknown as LearnerResponse,
    );
    expect(incorrect.status).toBe('scored');
    if (incorrect.status === 'scored') {
      expect(incorrect.score).toBe(0);
      expect(incorrect.passed).toBe(false);
    }
  });

  it('is a no-op when re-registering the SAME descriptor object', () => {
    registerActivityType(testCustomType);
    expect(() => registerActivityType(testCustomType)).not.toThrow();
    const occurrences = registeredActivityTypes().filter((type) => type === 'test-custom-x');
    expect(occurrences).toHaveLength(1);
  });

  it('throws when registering a DIFFERENT descriptor under an existing type', () => {
    registerActivityType(testCustomType);
    const conflicting = defineActivityType<TestCustomData, TestCustomResponse>({
      type: 'test-custom-x',
      schema: TestCustomSchema as unknown as z.ZodType<TestCustomData>,
      scoring: {
        kind: 'sync',
        score: () => ({ score: 0, maxScore: 1, feedback: null, details: [] }),
      },
    });
    expect(() => registerActivityType(conflicting)).toThrow(
      'Activity type "test-custom-x" is already registered. ' +
        'Registering a different descriptor for an existing type is not allowed.',
    );
  });
});
