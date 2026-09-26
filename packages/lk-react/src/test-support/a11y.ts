import axe from 'axe-core';

/**
 * Accessibility checks for the unit suites: axe-core, run on an element the
 * test rendered, and a `toHaveNoViolations` matcher over its results.
 *
 * Written here rather than taken from a wrapper package: the one in use
 * (`vitest-axe` 0.1, 2022) was unmaintained, needed a hand-written type file to
 * be visible to the typecheck, and threw an axe failure inside a callback — so
 * a failing run never rejected, and the test hung until its timeout.
 */

/** Runs axe-core on `container`, which must be in the document (RTL's `render` puts it there). */
export function runAxe(container: Element, options: axe.RunOptions = {}): Promise<axe.AxeResults> {
  return axe.run(container, options);
}

/**
 * Runs axe-core, disabling `color-contrast`. jsdom has no real layout/canvas
 * (`HTMLCanvasElement.getContext` is unimplemented), so axe cannot evaluate
 * contrast reliably here. Contrast is instead verified numerically in
 * `theme/__tests__` (computed WCAG ratios) and re-checked in a real browser by
 * the Playwright specs. This keeps structural a11y (roles, names, labels)
 * enforced without false or incomplete contrast results.
 */
export function checkA11y(container: Element): Promise<axe.AxeResults> {
  return runAxe(container, { rules: { 'color-contrast': { enabled: false } } });
}

/** The matcher `vitest.setup.ts` gives `expect`: every violation, with where it is and why. */
export const a11yMatchers = {
  toHaveNoViolations(results: axe.AxeResults) {
    if (!Array.isArray(results?.violations)) {
      throw new TypeError('toHaveNoViolations expects the results of an axe run');
    }
    const { violations } = results;
    return {
      pass: violations.length === 0,
      actual: violations,
      message: () =>
        violations.length === 0
          ? 'expected accessibility violations, and axe found none'
          : violations
              .map(
                (violation) =>
                  `${violation.help} (${violation.id}, ${violation.impact ?? 'no impact'})\n${violation.nodes
                    .map((node) => `  at ${node.target.join(', ')}: ${node.failureSummary ?? ''}`)
                    .join('\n')}\n  ${violation.helpUrl}`,
              )
              .join('\n\n'),
    };
  },
};

// How vitest documents adding a matcher: `Assertion` extends `Matchers`. The
// type parameter must be declared exactly as vitest declares it.
declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: vitest declares `Matchers<T = any>`, and an augmentation must match.
  interface Matchers<T = any> {
    toHaveNoViolations(): T;
  }
}
