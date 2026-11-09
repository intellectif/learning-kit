---
'@intellectif/lk-interactive-activities': minor
---

**What Happens: Show answer can be undone, with "Hide answer" bringing the supports back as they were.**

**Action required:** none, unless your `onEvent` handler switches over every `PlayerEvent` type; then add the new `answer.hidden`.

- **One button, both ways.** "Show answer" becomes "Hide answer" in place, and A works both ways. Hiding brings the telling step back exactly as it was: the prompt, and the supports open or closed as the learner left them, the open ones springing back in one after another. Any spoken answer stops.
- **Nobody loses their place.** Focus stays on the button, and the status region reads the answer out, or says it is hidden again. Pressed from anywhere else, A moves focus to the step's heading as before.
- **Never a dead end.** Once the answer has been seen, Next is offered beside Show answer. Every clip starts with its answer unseen.
- **Editors' words.** The new `copy.hideAnswer` and `copy.answerHidden` labels, in English and Spanish, can be renamed like every other label.
- **xAPI.** `answer.hidden` is `interacted`, with no score.
- **A changed.** A clip with no sample answer no longer treats A as "go on"; N and Enter do, as its button already said.
- **Fix.** On a phone, the "Sample answer" label is a small label again instead of a second large heading.

Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md#what-happens
