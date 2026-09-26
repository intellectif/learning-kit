import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { a11yMatchers, checkA11y, runAxe } from '../a11y.js';

/**
 * The accessibility matcher every suite relies on, held to failing: a matcher
 * that passed everything would make 46 accessibility assertions say nothing.
 */
describe('toHaveNoViolations', () => {
  it('fails on a violation, naming the rule and the element', async () => {
    // biome-ignore lint/a11y/useAltText: the violation under test.
    const { container } = render(<img src="cat.png" />);
    const verdict = a11yMatchers.toHaveNoViolations(await runAxe(container));
    expect(verdict.pass).toBe(false);
    expect(verdict.message()).toContain('image-alt');
    expect(verdict.message()).toContain('img');
    await expect(checkA11y(container)).resolves.not.toHaveNoViolations();
  });

  it('passes accessible markup', async () => {
    const { container } = render(<img src="cat.png" alt="A cat on a mat" />);
    await expect(checkA11y(container)).resolves.toHaveNoViolations();
  });

  it('refuses something that is not an axe result, rather than pass it', () => {
    expect(() => a11yMatchers.toHaveNoViolations({} as never)).toThrow(TypeError);
  });
});
