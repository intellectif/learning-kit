/**
 * Minimal declarations for the Node builtins the Playwright specs use.
 *
 * These specs run in Node, but this package targets the browser and carries no
 * `@types/node` — and adding it would widen the type surface of every `src`
 * file to include Node globals, which is exactly what this package should not
 * compile against. Declaring the handful of imports the e2e suite actually
 * needs keeps the typecheck gate over `e2e/` (where it has already caught real
 * mistakes) without that trade.
 *
 * Same reasoning as `css-raw.d.ts` at the package root.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
