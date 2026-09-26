---
"@intellectif/lk-react": patch
---

**Components declare their return type**: every component's declaration now reads `React.JSX.Element`. The type is unchanged; only its spelling in the `.d.ts` files is.

**Action required:** none.

- Ten components (`ActivityPreview`, `Dictation`, `FillInTheBlanks`, `GapSelect`, `InteractiveVideo`, `MultipleChoice`, `PronunciationFeedback`, `ReadAloud`, `ThemeProvider` and `WrittenResponse`) left their return type to inference. The declarations therefore named it after the file TypeScript found it in: `import("react/jsx-runtime").JSX.Element`. `@types/react` 19.3 moved that type into `react`, so the same code built under it declared `import("react").JSX.Element` instead. They now declare `React.JSX.Element`, as the other components already did. Under `@types/react` 19.2 and 19.3, the old and new spellings are one type.
- The API report now rejects an exported type named through `import("…")`, so a dependency upgrade can no longer change what the package declares.
