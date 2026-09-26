import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BUILT_IN_ACTIVITY_TYPES,
  type BuiltInActivityType,
  createDraft,
  getActivityTypeDescriptor,
  isBuiltInActivityType,
  jsonSchemaFor,
  registeredActivityTypes,
  validateDraft,
} from '../index.js';
import type { ActivityDataMap } from '../types/activity.js';

/**
 * The closed list of built-in types, held to what the SDK actually ships: the
 * registry, the data map, and what every built-in type is promised to have. A
 * type added to one and not the others fails here, by name.
 */
describe('BUILT_IN_ACTIVITY_TYPES', () => {
  it('names every type in the data map, and nothing else', () => {
    // Nothing in this package augments ActivityDataMap, so here its keys are
    // exactly the SDK's types.
    expectTypeOf<BuiltInActivityType>().toEqualTypeOf<keyof ActivityDataMap>();
  });

  it('is what the registry holds before anything is registered, in its order', () => {
    expect(registeredActivityTypes()).toEqual([...BUILT_IN_ACTIVITY_TYPES]);
  });

  it('tells a built-in type from any other value', () => {
    for (const type of BUILT_IN_ACTIVITY_TYPES) {
      expect(isBuiltInActivityType(type)).toBe(true);
    }
    for (const other of ['matching', '', 'Multiple-Choice', null, undefined, 1, {}]) {
      expect(isBuiltInActivityType(other)).toBe(false);
    }
  });

  it.each(BUILT_IN_ACTIVITY_TYPES)('%s has everything a built-in type is promised', (type) => {
    const descriptor = getActivityTypeDescriptor(type);
    expect(descriptor?.type).toBe(type);
    // Redaction is fail-closed only for a type that knows its learner-safe shape.
    expect(descriptor?.redactedSchema).toBeDefined();
    expect(descriptor?.fieldPolicy).toBeDefined();
    // xAPI, JSON Schema and authoring all come from the descriptor.
    expect(descriptor?.interop).toBeDefined();
    expect(Object.keys(jsonSchemaFor(type)).length).toBeGreaterThan(0);
    let next = 0;
    const newId = () => {
      next += 1;
      return `id-${next}`;
    };
    const draft = createDraft(type, { newId });
    expect(validateDraft(type, draft).status).toBe('incomplete');
  });
});
