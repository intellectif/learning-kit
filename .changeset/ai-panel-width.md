---
'@intellectif/lk-react': patch
---

**AI help spans the answer**: the "Explain my answer" panel and the list of hints now take the full width of the question, as feedback on a draft already did.

**Action required:** none. Only the skin changes: no markup, prop or string.

- The live region inside `.lk-ai` lined up at the start like the button beside it, so it shrank to its content: a short explanation sat in a panel only as wide as its text, and the hints widened each time a longer one arrived. `.lk-ai > [aria-live]` now stretches, which covers the explanation, the hints and feedback on a draft, so feedback on a draft no longer needs a rule of its own.
- Where the text already filled the line, as on a phone, nothing moves.
