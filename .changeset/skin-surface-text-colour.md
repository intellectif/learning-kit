---
'@intellectif/lk-react': patch
---

**Readable on any page**: every surface the skin paints now sets the text on it, so AI help, a grade and a question set's passage no longer take the host page's text colour.

**Action required:** none. Only the skin changes. On a page whose text colour follows the theme, these surfaces change by a shade at most.

- `<ThemeProvider>` applies the dark tokens when the system prefers dark. On a page that stays light, a surface that painted the theme's background but left the text to the page drew black on near-black, about 1.1:1. That hit the feedback on a draft, a written response's grade, a group's passage in `<ActivitySequence>`, and the AI hints and explanation in a gap select. A dark page under the light theme gave the reverse.
- `.lk-ai-panel`, `.lk-ai-hint`, `.lk-stimulus`, `.lk-wr-outcome` and the SDK's audio transport (`.lk-media[data-controls="minimal"]`) now set `color: var(--lk-color-text)` beside their background, as the multiple-choice, dictation and read-aloud cards already did.
