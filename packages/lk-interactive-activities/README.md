# @intellectif/lk-interactive-activities

React player and activity contracts for hosted interactive activities in Learning Kit, starting with What Happens and Cine-Scramble.

This package has no runtime dependencies. It peers on [`@intellectif/lk-core`](https://www.npmjs.com/package/@intellectif/lk-core), [`@intellectif/lk-react`](https://www.npmjs.com/package/@intellectif/lk-react), `react`, and `react-dom`.

```bash
pnpm add @intellectif/lk-interactive-activities @intellectif/lk-core @intellectif/lk-react react react-dom
```

This private workspace package currently ships the template registry (`registerTemplate`, `getTemplate`, `listTemplates`) and the What Happens and Cine-Scramble contracts: validators registered with `@intellectif/lk-core`, JSON Schema for AI, and shipped English/Spanish chrome. The React players arrive in a later milestone. It is not published to npm yet.
