/**
 * Vite's `?raw` suffix returns a module's source as a string. It is how the
 * theme tests read `defaults.css` / `skin.css` — this package targets the
 * browser and carries no `@types/node`, so `fs.readFileSync` would not survive
 * the typecheck gate.
 */
declare module '*.css?raw' {
  const content: string;
  export default content;
}
