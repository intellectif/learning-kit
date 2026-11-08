# @intellectif/lk-interactive-activities

React player and activity contracts for hosted interactive activities in Learning Kit, starting with What Happens and Cine-Scramble.

This package has no runtime dependencies. It peers on [`@intellectif/lk-core`](https://www.npmjs.com/package/@intellectif/lk-core), [`@intellectif/lk-react`](https://www.npmjs.com/package/@intellectif/lk-react), `react`, and `react-dom`.

```bash
pnpm add @intellectif/lk-interactive-activities @intellectif/lk-core @intellectif/lk-react react react-dom
```

This private workspace package currently ships the template registry (`registerTemplate`, `getTemplate`, `listTemplates`), the What Happens and Cine-Scramble contracts (validators registered with `@intellectif/lk-core`, JSON Schema for AI, and English/Spanish chrome), and the style system: named style and motion catalogs, tokens mapped to `--lkia-*` CSS variables, CSS-only animations with a `prefers-reduced-motion` path, and Google Fonts helpers that build a CDN stylesheet URL for hosted playback and list the files to bundle for an offline export. The React players arrive in a later milestone. It is not published to npm yet.
