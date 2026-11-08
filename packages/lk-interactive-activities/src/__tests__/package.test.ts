import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../index.js';

describe('PACKAGE_NAME', () => {
  it('is the published package name', () => {
    expect(PACKAGE_NAME).toBe('@intellectif/lk-interactive-activities');
  });
});
