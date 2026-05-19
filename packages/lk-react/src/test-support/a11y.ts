import { axe } from 'vitest-axe';

/**
 * Runs axe-core, disabling `color-contrast`. jsdom has no real layout/canvas
 * (`HTMLCanvasElement.getContext` is unimplemented), so axe cannot evaluate
 * contrast reliably here. Contrast is instead verified numerically in
 * `theme/__tests__` (Task 10.1 computed WCAG ratios) and re-checked in a real
 * browser via Playwright (Task 19). This keeps structural a11y (roles, names,
 * labels — Req 14.6) enforced without false/incomplete contrast results.
 */
export function checkA11y(container: Element): Promise<unknown> {
  return axe(container, { rules: { 'color-contrast': { enabled: false } } });
}
