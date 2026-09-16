import { describe, expect, it } from 'vitest';
import { mintTake, stampTake, takeOf } from '../sequence-slot.js';

// The take numbers are module-level and never reset, so these tests assert
// order and uniqueness, never particular values.
describe('take numbers', () => {
  it('are unique and increasing for the life of the page', () => {
    const minted = Array.from({ length: 1000 }, () => mintTake());
    expect(new Set(minted).size).toBe(minted.length);
    for (let at = 1; at < minted.length; at += 1) {
      expect(minted[at]).toBeGreaterThan(minted[at - 1] as number);
    }
  });

  it('travel with the value they were stamped on, and with no other', () => {
    const take = mintTake();
    const response = { type: 'read-aloud', recording: null };
    const twin = { ...response };
    expect(stampTake(response, take)).toBe(response);
    expect(takeOf(response)).toBe(take);
    // An equal copy is another answer: a take belongs to one reported object.
    expect(takeOf(twin)).toBeUndefined();
    // The stamp is not a field a host would persist or compare.
    expect(Object.keys(response)).toEqual(['type', 'recording']);
  });

  it('are absent from anything that is not an object', () => {
    for (const value of [undefined, null, 0, 'take', true]) {
      expect(takeOf(value)).toBeUndefined();
    }
  });
});
