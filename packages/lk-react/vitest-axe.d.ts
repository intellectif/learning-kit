/**
 * `vitest-axe` registers its matcher at runtime via `expect.extend` in
 * vitest.setup.ts but ships no type augmentation, so `toHaveNoViolations` is
 * invisible to `tsc`. Declaring it here is what lets the typecheck gate see
 * the accessibility assertions instead of drowning in ~20 phantom errors.
 */
import 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
