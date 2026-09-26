---
"@intellectif/lk-core": minor
---

**Smaller bundles, one list of built-in types, and two deprecations**: importing one function from lk-core no longer bundles all of zod.

**Action required:** none. Two things are deprecated and keep working throughout 1.x: a fill-in-the-blanks blank's `caseSensitive` / `trimWhitespace` (write `match: { caseSensitive, trim }`), and `seededShuffle` without a `version` (write `{ version: 1 }` to keep an order already recorded).

- **Smaller bundles.** An app that imports only `score`, or only `xAPIBuilder` from `/xapi`, used to bundle every one of zod's 60-odd locales: about 121 kB gzipped for `{ score }`. It is now about 54 kB. Grades, validation results and error messages are unchanged — every grade vector and validation expectation replays identically — and new size budgets hold lk-core to it.
- **`BUILT_IN_ACTIVITY_TYPES`, `BuiltInActivityType` and `isBuiltInActivityType`** name the types the SDK ships. `ActivityType` cannot, since a host's module augmentation widens it: use these to tell your own registered types from the SDK's.
- **`hintRevealsAnswer` withholds a hint it cannot check.** Given facts of a kind it cannot read, it now answers `true` — the hint reveals — where it answered `false` and let the hint through. No built-in type reaches that case today; a new one would have.
- **The built-in types are registered however your bundler splits lk-core.** They were registered as a module loaded, which held only because the build put that module beside the lookups; lk-core declares `sideEffects: false`, so a bundler may drop such a module. The registry is now created holding them.
- **Deprecated, still working throughout 1.x:** a blank's `caseSensitive` and `trimWhitespace` (`match.caseSensitive` and `match.trim` mean the same), and calling `seededShuffle` without `version` — it still draws version 1, but a 2.0 may make version 2 the default. See [Stability](https://github.com/intellectif/learning-kit/blob/main/docs/stability.md#deprecation).
- **Built with tsdown**, as tsup is no longer maintained. Every entry point exports the same names in ESM and CommonJS, the declarations describe the same API, and the grade and validation corpora replay identically; only the names of the internal chunk files differ.
