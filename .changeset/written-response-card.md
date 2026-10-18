---
'@intellectif/lk-react': patch
---

**A written response is a card, like every other activity**: its prompt, word counter and status now sit on the theme's surface, whatever colour your page is.

**Action required:** none. Only the skin changes. If you set a written response inside a card of your own, it now draws one too: drop yours, or restyle `.lk-wr` with plain CSS, which wins over the skin's layer.

- `<ThemeProvider>` applies the dark tokens when the system prefers dark. A written response painted no surface of its own, so its prompt, in the theme's text colour, was drawn straight on the host page: 1.04:1 on a light page under the dark theme, with its word counter and status line about 2.5:1. A light theme on a dark page failed the same way.
- `.lk-wr` now sets the background, text colour, padding, border and radius the multiple-choice and fill-in-the-blanks cards set. Inside an `<InteractiveVideo>` quiz the panel stays the question's card, as it is for the other types.
- The question set's progress line, "Question 3 of 5", had the same fault outside the questions' cards. It now sits on a small chip of the theme's surface, as the navigation buttons already did.
- An end-to-end test fails on any text in the skin's colours drawn straight on the page.
