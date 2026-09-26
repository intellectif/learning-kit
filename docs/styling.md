# Styling

Learning Kit components are **token-driven and skinnable**. They ship semantic HTML + stable class hooks + CSS custom properties; you choose how much visual styling to adopt. Tailwind is **optional** and never required.

## The three layers

1. **Tokens (`defaults.css`)** — required. A single `:root { --lk-* }` block of design tokens (colors, spacing, radius, typography, motion). No element/reset/utility rules — it is purely additive and **cannot collide** with Tailwind preflight or your CSS (the `--lk-*` namespace is disjoint from `--tw-*` / `--color-*`).

   ```ts
   import '@intellectif/lk-react/theme/defaults.css';
   ```

2. **Optional skin (`skin.css`)** — a polished, neutral-monochrome look built **entirely** from the tokens.

   ```ts
   import '@intellectif/lk-react/theme/skin.css';
   ```

   Without it, components are functional but visually minimal (native form controls). With it, you get the look in the example app / Storybook.

3. **Your overrides** — see below. The skin is designed to be overridden with **plain CSS and no `!important`**.

## Overriding the skin

Every skin rule is inside the named cascade layer **`@layer lk-skin`**. By CSS cascade-layer precedence, **unlayered author styles always beat layered styles**. So you override any hook with ordinary CSS:

```css
/* your stylesheet — wins over the skin with no specificity war */
.lk-mc-option { border-radius: 0; }
.lk-fib-blank input { border-color: rebeccapurple; }
```

### Writing direction

The skin is direction-agnostic: it uses logical properties (`margin-inline-start`,
`inset-inline-start`, `padding-inline`) rather than `left` / `right`, so it follows the
`dir` that `<LkIntlProvider>` sets — or the one your own document sets. `defaults.css`
declares no directional properties at all. `e2e/rtl-layout.spec.ts` measures this in a
real browser in both directions, because a physical `margin-left` is invisible to every
other check when the page happens to be left-to-right.

Override with logical properties too, or an RTL learner gets your left-to-right layout
inside a right-to-left page. See [Internationalisation](./i18n.md).

### Class hooks

| Hook | Element |
|---|---|
| `.lk-mc`, `.lk-mc-option`, `.lk-mc-option-feedback` | Multiple Choice container / option / per-option feedback |
| `.lk-fib`, `.lk-fib-passage`, `.lk-fib-blank`, `.lk-fib-answer` | Fill-in-the-Blanks |
| `.lk-fib-hint-btn`, `.lk-fib-hint-icon` | Hint button (default icon) — restyle/replace the glyph here; the accessible name is fixed by the SDK |
| `.lk-fib-blank-feedback`, `.lk-fib-feedback-toggle` | Per-blank feedback note + the Hide/Show feedback toggle |
| `.lk-gs`, `.lk-gs-passage`, `.lk-gs-gap`, `.lk-gs-select` | Gap Select container / passage / one gap / its selector — `data-correct` lands on the `select` itself after submit |
| `.lk-gs-gap-feedback`, `.lk-gs-feedback-toggle` | Per-gap feedback note + the Hide/Show feedback toggle |
| `.lk-dc`, `.lk-dc-title`, `.lk-dc-recordings`, `.lk-dc-recording`, `.lk-dc-recording-label` | Dictation container / title / the recordings block / one recording's fieldset (`[data-slow="true"]` for the slower file) / its legend |
| `.lk-ai`, `.lk-ai-hint-area` | AI help: the block under an answer (an explanation) or before submit (hints), `data-state="idle" \| "loading" \| "shown" \| "unavailable"` |
| `.lk-ai-button` | "Explain my answer" / "Get a hint". While a call is on its way it is `[aria-busy="true"][aria-disabled="true"]`, not `:disabled`, so focus stays on it |
| `.lk-ai-panel`, `.lk-ai-heading`, `.lk-ai-text` | An explanation: its dashed panel (focusable, `tabIndex=-1`, so focus can move to it), its heading, and the model's plain text (`white-space: pre-line`) |
| `.lk-ai-hints`, `.lk-ai-hint`, `.lk-ai-hint-label` | The list of hints given, one item each, and its "Hint 1" label |
| `.lk-ai-notice`, `.lk-ai-note`, `.lk-ai-unavailable` | "Written by AI…" under every AI text; "No more hints…"; and "not available" after a failed or refused call |
| `.lk-dc-hints`, `.lk-dc-hint-btn`, `.lk-dc-hint-reset`, `.lk-dc-hint` | Progressive hints: the block, the reveal button, the reset button, and the live paragraph holding the revealed words. Once every word is shown the reveal button is `[aria-disabled="true"]`, not `:disabled`, so keyboard focus stays on it: style both |
| `.lk-dc-input` | The answer box; `data-correct="true\|false"` carries the pass state once the attempt is marked |
| `.lk-dc-result`, `.lk-dc-nothing` | The marked result block, and the note shown when nothing was typed |
| `.lk-dc-words`, `.lk-dc-word[data-state="correct\|incorrect\|missing\|extra"]`, `.lk-dc-word-text` | The word list (the assistive-technology channel), one item per word with its state, and the visible token inside it (`aria-hidden`) |
| `.lk-dc-op[data-op="equal\|substitute\|missing\|extra"]` | A character as it is drawn inside a wrong word or the whole-sentence diff, or a run of correct ones — decoration, `aria-hidden`; `[data-ligatures="decorative"]` on a run whose letters are all Latin, Greek or Cyrillic |
| `.lk-dc-diff`, `.lk-dc-legend`, `.lk-dc-diff-note` | The whole-sentence character diff, the legend (`li[data-state]`, styled like the words and the ops), and the note about normalisation |
| `.lk-dc-solution-toggle`, `.lk-dc-solution`, `.lk-dc-solution-alternatives` | The Show/Hide solution toggle, the revealed transcript, and its accepted alternatives |
| `.lk-ra`, `.lk-ra-title`, `.lk-ra-instructions`, `.lk-ra-reference` | Read Aloud form / title / instructions / the text the learner reads aloud |
| `.lk-ra-models`, `.lk-ra-model`, `.lk-ra-model-label` | The model recordings block, one model's fieldset (`[data-slow="true"]` for the slower file) and its legend |
| `.lk-ra-recorder`, `.lk-ra-record`, `.lk-ra-stop`, `.lk-ra-progress`, `.lk-ra-takes` | The recorder, its Record / Stop controls, the elapsed-time counter and the takes-remaining line. The counter is `aria-hidden` and is not a live region — read out every second it would be spoken into the take being assessed — so the start and the end of a take are announced by the component instead; select it by its class. `data-status` on `.lk-ra-recorder` is the recorder's state (`idle`, `requesting-permission`, `recording`, `recorded`, `error`); `data-level` is a 0–10 input level, present only while recording, and the skin draws it as a bar — decoration, safe to drop |
| `.lk-ra-take` | The `<audio controls>` playing the learner's own take; `data-take` is which take it is |
| `.lk-ra-actions`, `.lk-ra-submit`, `.lk-ra-submit-blank`, `.lk-ra-retry` | The actions row, Submit, the `exam`-only "submit without recording", and the retry a failed upload or a failed assessment offers. A control that is not ready is `[aria-disabled="true"]`, not `:disabled`, so focus stays: style both |
| `.lk-ra-pending`, `.lk-ra-alert` | The `aria-busy` pending line (uploading / checking) and the `role="alert"` failure, re-keyed so a repeated message announces again |
| `.lk-ra-marks`, `.lk-ra-words`, `.lk-ra-word[data-state]`, `.lk-ra-word-text`, `.lk-ra-legend` | `review`'s word marks rebuilt from a stored grade's details: the block, the list, one word with its state, the visible token inside it (`aria-hidden`) and the legend (`li[data-state]`). Three states, not four — a stored mark set carries no insertions |
| `.lk-ra-outcome`, `.lk-ra-grade`, `.lk-ra-grade-feedback` | The `review` outcome block (`data-status`, `data-passed`, and `data-code` on an unscorable one — the code is never rendered as text), the score sentence and the grader's words |
| `.lk-pf`, `.lk-pf-grade`, `.lk-pf-score`, `.lk-pf-grade-feedback` | Pronunciation feedback panel / the grade block (`data-passed`) / the score sentence / the grader's words. Rendered inside `.lk-ra` in `practice`, and standalone anywhere else |
| `.lk-pf-dimensions`, `.lk-pf-dimension[data-dimension]`, `.lk-pf-dimension-name`, `.lk-pf-dimension-score` | The four scored dimensions (`accuracy`, `fluency`, `completeness`, `prosody`); an unmeasured one reads "Not assessed" and is never 0% |
| `.lk-pf-words`, `.lk-pf-word[data-state="correct\|mispronounced\|omitted\|inserted"]`, `.lk-pf-word-text`, `.lk-pf-legend` | The word-by-word marks (the assistive-technology channel), one item per word with its state, the visible token inside it (`aria-hidden`), and the legend |
| `.lk-pf-word-toggle`, `.lk-pf-word-detail`, `.lk-pf-word-facts`, `.lk-pf-word-play` | One word's disclosure (`aria-expanded` / `aria-controls`), the panel it opens, the facts list inside it, and the button that plays just that word out of the take |
| `.lk-pf-syllables`, `.lk-pf-phonemes`, `.lk-pf-phoneme`, `.lk-pf-phoneme-symbol`, `.lk-pf-heard-label`, `.lk-pf-heard-as` | A word's syllables, its sounds, one sound, its symbol, and the sounds the engine thought it heard in that one's place |
| `.lk-pf-break[data-break="unexpected\|missing"]`, `.lk-pf-monotone`, `.lk-pf-alphabet` | The pause notes (shown only past the `breakThreshold` you pass), the monotone note (past your `monotoneThreshold`), and the note naming the phonetic alphabet |
| `.lk-pf-audio` | The take the per-word play buttons drive. No controls, never played whole; the skin hides it, which does not stop it playing |
| `.lk-visually-hidden` | Present for assistive technology, invisible on screen (the dictation's and the read-aloud's per-word sentences). The component hides it with an inline style, so it stays hidden without the skin; the class is there to select it. A Content Security Policy that refuses inline styles can stop that style applying; there, load the skin or give this class a visually-hidden rule of your own |
| `.lk-media`, `.lk-media-el`, `.lk-media-embed` | Activity media (image/audio/video / iframe wrapper) |
| `.lk-wr`, `.lk-wr-prompt`, `.lk-wr-textarea`, `.lk-wr-counter`, `.lk-wr-submit` | Written Response container / prompt / input / word counter / submit |
| `.lk-wr-outcome`, `.lk-wr-grade`, `.lk-wr-grade-feedback`, `.lk-wr-review-flag` | Submitted-but-ungraded notice, and the returned grade block |
| `.lk-wr-criteria`, `.lk-wr-criterion`, `.lk-wr-criterion-name`, `.lk-wr-criterion-score`, `.lk-wr-criterion-comment` | Per-criterion rubric breakdown in `review` mode |
| `.lk-wr-corrections`, `.lk-wr-correction`, `.lk-wr-correction-original`, `.lk-wr-correction-corrected`, `.lk-wr-correction-explanation` | Inline corrections anchored in the learner's text |
| `.lk-stimulus`, `.lk-stimulus-title`, `.lk-stimulus-body`, `.lk-stimulus-range`, `.lk-stimulus-attribution` | Shared stimulus panel (an item group's passage / recording) |
| `.lk-media`, `.lk-media-el`, `.lk-media-embed` | Media block, the element itself, and the responsive embed wrapper |
| `.lk-media[data-controls="minimal"]`, `.lk-media-transport` | The SDK audio transport, rendered when a playback policy has something to enforce |
| `.lk-media-play`, `.lk-media-mute`, `.lk-media-time`, `.lk-media-scrub`, `.lk-media-volume`, `.lk-media-rate` | Transport controls. `.lk-media-play[aria-disabled="true"]` is the exhausted state — styled as unavailable but still focusable, so a learner who tabs to it is told why |
| `.lk-media-plays`, `.lk-media-notice` | Live plays-remaining status (polite) and the refusal / blocked-seek alert (assertive) |
| `.lk-media-confirm`, `.lk-media-confirm-start`, `.lk-media-confirm-cancel` | Last-play confirmation, so a stray press cannot spend the final play |
| `.lk-iv`, `.lk-iv-stage`, `.lk-iv-video`, `.lk-iv-label` | Interactive video shell (`data-render-mode`, `data-quiz-open`, `data-fullscreen`, `data-chrome="shown\|hidden"`), the box holding the video and every layer over it, the video element, and the corner label |
| `.lk-iv-chrome`, `.lk-iv-bar`, `.lk-iv-bar-group`, `.lk-iv-button`, `.lk-iv-wide` | The controls, their rows, one control, and the ones a narrow player drops. The chrome is `inert` while a quiz is open; a toggle that is on carries `aria-pressed="true"` |
| `.lk-iv-scrubber`, `.lk-iv-scrubber-track`, `.lk-iv-scrubber-buffered`, `.lk-iv-scrubber-played`, `.lk-iv-scrubber-gap`, `.lk-iv-scrubber-thumb` | The progress bar (`role="slider"`, `data-dragging`), its line, what has loaded, what has played, a chapter break, and the handle |
| `.lk-iv-marker[data-state][data-required]` | A quiz on the bar — see the marking contract below |
| `.lk-iv-bubble`, `.lk-iv-bubble-time`, `.lk-iv-bubble-chapter`, `.lk-iv-bubble-quiz`, `.lk-iv-bubble-caption` | The preview under the pointer: the time, the chapter, the quiz it is over, and the caption line at that moment |
| `.lk-iv-volume`, `.lk-iv-volume-slider`, `.lk-iv-time`, `.lk-iv-time-total`, `.lk-iv-speed` | Volume and its slider (hidden on a coarse pointer), the time readout and the duration inside it, and the speed button |
| `.lk-iv-menu-anchor`, `.lk-iv-menu`, `.lk-iv-menu-item`, `.lk-iv-menu-value`, `.lk-iv-menu-back`, `.lk-iv-menu-note`, `.lk-iv-kbd` | The speed and settings menus: the anchor, the popover (`role="menu"`, arrow keys, Escape), a row, its value, the back row of a sub-page, the captions-failed note, and a key cap |
| `.lk-iv-sheet`, `.lk-iv-sheet-head`, `.lk-iv-sheet-title`, `.lk-iv-shortcuts`, `.lk-iv-shortcut` | The keyboard-shortcut sheet and its rows |
| `.lk-iv-big-play`, `.lk-iv-spinner`, `.lk-iv-error` | The centre play button, the buffering ring, and the failure message |
| `.lk-iv-captions[data-size][data-background]`, `.lk-iv-caption[data-role="primary\|secondary"]` | The drawn captions: the container over the video, which rises with the controls, and one line per language inside it — the second language under the first. Each line also carries `data-size`, `data-background`, `lang` and `dir="auto"`. Styled by `--lk-iv-caption-color`, `--lk-iv-caption-secondary-color`, `--lk-iv-caption-secondary-scale` and `--lk-iv-caption-gap`; keep the second line smaller as well as a different colour, or the two differ by colour alone |
| `.lk-iv-quiz`, `.lk-iv-quiz-head`, `.lk-iv-quiz-title`, `.lk-iv-quiz-time`, `.lk-iv-tag` | The quiz panel over the video (`role="dialog"`, `hidden` when closed — keep that rule if you restyle it), its header, the quiz's name, its moment, and the "Required" tag |
| `.lk-iv-steps`, `.lk-iv-steps-label`, `.lk-iv-steps-dots`, `.lk-iv-step[data-current][data-answered]` | Where the learner is inside a quiz of several questions, and one step |
| `.lk-iv-quiz-body`, `.lk-iv-question` | The panel's body and one question. Every question of an opened quiz stays mounted behind `hidden`, so an answer survives a rewind — a rule that makes `[hidden]` visible shows all of them at once |
| `.lk-iv-quiz-foot`, `.lk-iv-quiz-foot-start`, `.lk-iv-quiz-foot-end`, `.lk-iv-link`, `.lk-iv-action`, `.lk-iv-action-primary`, `.lk-iv-saved` | The footer, its two ends, Rewatch / Skip quiz, the button that moves on (`aria-disabled` while a required question is unanswered, never `:disabled`), and the exam's "Answer saved" |
| `.lk-iv-end`, `.lk-iv-end-card`, `.lk-iv-end-title`, `.lk-iv-end-summary`, `.lk-iv-end-list`, `.lk-iv-end-actions` | The end card over the last frame, clear of the controls so the learner can still scrub back |
| `.lk-iv-end-pending` | The status line under the summary while an answer is still being stored or graded; Finish is `aria-disabled` and described by it |
| `.lk-iv-panel`, `.lk-iv-tabs`, `.lk-iv-tab`, `.lk-iv-contents`, `.lk-iv-contents-chapter`, `.lk-iv-contents-quiz` | The panel below the video, its tabs, the contents list, a chapter row and a quiz row |
| `.lk-iv-row`, `.lk-iv-row-time`, `.lk-iv-row-title`, `.lk-iv-row-status`, `.lk-iv-marker-dot[data-state]` | A row in the contents or on the end card: its time, its name, how much of it is answered, and the quiz's state as a dot |
| `.lk-iv-transcript`, `.lk-iv-search`, `.lk-iv-lines`, `.lk-iv-line[data-active]`, `.lk-iv-empty` | The transcript, its search box, the list, the line being spoken, and the no-match note |
| `.lk-iv-line-text`, `.lk-iv-line-secondary` | With a second caption language chosen: a row's two texts, and the second language's under the first (smaller, set in, the theme's muted colour — the caption colour is for the dark caption box). Absent with none, so the row is as it was |
| `.lk-iv-live` | The player's polite live region (visually hidden) |
| `.lk-iv-portal` | `portalContainer`: the last child of the shell, where a question drawn by `renderQuestion` portals its popovers. Out of the flow and lifted above the stage, so what is portalled into it paints over the quiz and in fullscreen |
| `.lk-seq`, `.lk-seq-progress`, `.lk-seq-question`, `.lk-seq-nav` | ActivitySequence pager |
| `.lk-seq-prev`, `.lk-seq-next`, `.lk-seq-slot`, `.lk-seq-stimulus`, `.lk-seq-unsupported` | Pager buttons, the per-question pane, its stimulus wrapper, and the fallback for an unregistered activity type |
| `.lk-seq-portal` | An empty node inside a host-drawn question's pane, for its own popovers (`SequenceQuestion.portalContainer`). Style it only to position what you put in it |
| `[aria-live]` (within `.lk-mc` / `.lk-fib`) | Feedback / status region |

State is exposed via `data-correct="true|false"` after submission, but **not at the same level for both types**: on Multiple Choice it lands on `.lk-mc-option` itself, while on Fill-in-the-Blanks it lands on the `input` *inside* `.lk-fib-blank`. So target `.lk-mc-option[data-correct="false"]` but `.lk-fib-blank input[data-correct="false"]` — a rule written against `.lk-fib-blank[data-correct]` silently never matches. (The bundled skin does exactly this; compare its `.lk-mc-option` and `.lk-fib-blank input` rules.) `:has(input:checked)` is for Multiple Choice selection.

**The dictation marking contract.** A dictation is marked word by word, and each of its four states is carried by three things at once: a glyph via `::before` (`✓ ✗ ∅ +`), a text decoration (none, wavy underline, dotted outline, line-through) and a colour — so no state is colour-only, and the decorations survive `forced-colors: active`, where the skin restates them in `CanvasText`. The same vocabulary is used at three levels: `.lk-dc-word[data-state]` for a word, `.lk-dc-op[data-op]` for a character inside a wrong word or in the whole-sentence diff (`substitute` reuses the wavy underline, `missing` the dotted outline with a `•` standing in for the character, `extra` the line-through), and `.lk-dc-legend li[data-state]` for the legend rows that explain both. A wrong word the component compared itself is drawn as its character marks and carries `data-marks="characters"` on `.lk-dc-word-text`; it then has no underline of its own — it would run under the right characters too, and the wrong ones would differ from them by colour alone — so the marks carry the decoration, and only a wrong word rebuilt from stored details is underlined whole. A `.lk-dc-op` is a character as it is drawn, not always one code point. A combining mark, a joiner, a skin tone, a Thai or Lao SARA AM, the alef of a lam-alef, the letter after a Malayalam dot reph, the vowel after a Mongolian vowel separator, and the letter after a virama that stacks it — Devanagari, Bengali, Kannada, Khmer, Chakma, Brahmi and the other scripts that draw a conjunct without being asked; in Sinhala only after a zero-width joiner; in Gurmukhi only RA, YA and VA, which fonts set under the consonant; in Tamil only the conjuncts KSSA (`க்ஷ`) and SHRII (`ஸ்ரீ`), otherwise leaving the next letter on its own — is drawn into the character before it and has no width of its own, so it shares that character's `.lk-dc-op`. A shared op led by a missing character's `•` is marked `missing`, whatever marks sit on the bullet; a bullet carries only the marks drawn onto it, never a letter drawn apart. Otherwise a shared op takes the kind of its wrong characters when they are all of one kind — a correct letter with an extra mark is `extra` — and is `substitute` when they are not. Correct characters next to each other are one `.lk-dc-op[data-op="equal"]`, so an engine that shapes each element on its own, such as WebKit, still draws a correctly typed conjunct or a joined Mongolian word whole. The grouping is by syllable, not by glyph: a correct half form grouped with the wrong letter after it, or the correct half of a flag a platform draws as two letters, is marked with it. A `•` carries a left-to-right or right-to-left mark on each side — the direction of the character it stands for; left to right for a currency, degree or per-mille sign beside a digit, with no Arabic letter before it, as the number beside it is laid out; or, for a missing space or punctuation mark, the direction of the characters on both sides of it when they agree, and the dictation's when they do not — so it keeps its place inside a number, inside a word of the other direction, and between the two. One place it can lose: a missing digit of a number that follows a word of the other direction, in text laid out in the first direction, can be drawn on the far side of that word, because the digits before the bullet belong to the word's run. The wavy underline does not skip ink (`text-decoration-skip-ink: none`): broken around a descender or a stacked letter, it could leave a wrong character with nothing to mark it. A run whose letters are all Latin, Greek or Cyrillic carries `data-ligatures="decorative"`, and the skin turns off its common ligatures (`font-variant-ligatures: no-common-ligatures`) for the same reason: a font's "fi" draws two characters as one glyph, and the second one's mark would have nothing to be painted on. It is not turned off for other scripts, whose fonts build required forms from the same feature — Tai Tham stacks its consonants with it. Restyle any of them with an unlayered rule on the same selectors; keep a non-colour channel per state if you do, keep `.lk-dc-op` inline — a text decoration is not drawn through an inline-block — keep ink skipping off where characters are marked, and turn common ligatures off only where they are decorative. The screen-reader text is the component's (`.lk-visually-hidden` sentences), so the stylesheet bakes in no words.

**The read-aloud marking contract.** It is the dictation's, deliberately. A read-aloud take is marked word by word in four states — `correct`, `mispronounced`, `omitted`, `inserted` — and each is carried by the same three channels the dictation uses: a glyph via `::before` (`✓ ✗ ∅ +`), a text decoration (none, wavy underline, dotted outline, line-through) and a colour (`--lk-color-success`, `--lk-color-error`, `--lk-color-warning`, `--lk-color-text-muted`). `mispronounced` stands exactly where `incorrect` stands there. So a learner who meets both activity types reads one vocabulary, a translator meets no new concept, and the skin invents no token. Only the classes differ, which is what lets you restyle the two apart: `.lk-pf-word[data-state]` for a mark the pronunciation panel shows, `.lk-pf-legend li[data-state]` for its legend, and `.lk-ra-word[data-state]` / `.lk-ra-legend li[data-state]` for the marks a `review` rebuilds from a stored grade when no assessment was kept. There is no character-level marking: a read-aloud is judged on sounds, and there is no second alphabet to diff a word against. The states are restated under `forced-colors: active` in `CanvasText` for the same reason the dictation's are, transitions go under `prefers-reduced-motion: reduce`, and every control has a `:focus-visible` outline. The screen-reader text is the component's (`.lk-visually-hidden` sentences), so the stylesheet bakes in no words — and the visible glyph is `aria-hidden`, so nobody hears "check mark".

**The interactive-video marking contract.** A quiz on the progress bar is a `.lk-iv-marker`, and in
a list a `.lk-iv-marker-dot`; both carry the same `data-state`, and each state has its own **shape**,
never a colour alone: `unreached` a hollow ring, `open` a half-filled ring (some of it answered),
`answered` a filled ring, `correct` a filled ring in green, `partial` a half fill in amber,
`incorrect` a diamond in red, and `pending` a dashed ring for a grade that has not come back — bright
tones chosen for the dark bar, not the theme's `--lk-color-success`, `--lk-color-warning` and
`--lk-color-error`, which are drawn for light surfaces. `data-required` marks a quiz that holds the way on. The bar's own colours are
literals rather than tokens — the chrome is always dark, because it sits on moving pictures — with
one exception: `--lk-color-media-accent` is the accent it draws (the played part of the bar, the
markers' fill, the focus ring on the chrome), and it defaults to white, which reads on any video. Set
it to a brand colour and the player follows. Everything above it — the quiz panel, the end card, the
panel below the video — is content and takes the theme like any activity. Every state is restated
under `forced-colors: active` in the system palette, transitions go under
`prefers-reduced-motion: reduce`, and the layout uses logical properties so the controls mirror in
RTL while the bar still runs in the direction time does.

**The marking contract after submit.** Hue says correctness; *weight* says whether the learner chose it. A correct **and chosen** option is a solid green border with a tint and a `✓`; a wrong-and-chosen option is solid red with a tint and a `✗`; the correct answer the learner **missed** is the same green but **dashed**, with a hollow `○` and no fill — the key revealed, not a win. Untouched distractors recede to 70% opacity, which keeps the default text above AA (6.6:1). The glyphs are CSS generated content declared decorative (`content: "✓" / ""`): they satisfy WCAG 1.4.1 for sighted users without baking English into the stylesheet, and a translatable screen-reader announcement is the component's job. Override any of it with an unlayered rule on the same selectors.

## Theming with `ThemeProvider`

`ThemeProvider` injects token **values** as scoped CSS variables on a wrapper, so the skin (and your token-based CSS) restyle automatically.

```tsx
import { ThemeProvider, darkTheme } from '@intellectif/lk-react/theme/ThemeProvider';

<ThemeProvider theme={{ '--lk-color-primary': '#7c3aed', '--lk-radius-base': '0.75rem' }}>
  <App />
</ThemeProvider>;
```

- **Dark mode:** if no `theme` prop is set and the OS is in `prefers-color-scheme: dark`, the bundled `darkTheme` is applied automatically (SSR-safe via `useSyncExternalStore`). Pass `theme={darkTheme}` to force it.
- **Per-instance:** every activity component also accepts a `theme` prop for one-off token overrides.
- `useTheme()` returns the active tokens for building matching custom UI.

Both the light and dark default palettes are verified to meet **WCAG 2.2 AA** contrast (numeric test in `lk-react`).

## Tailwind (optional)

Tailwind is not needed. If you already use it and want your **own** utilities to share the SDK palette, spread `createTailwindTheme` into `theme.extend`:

```ts
// tailwind.config.ts
import { createTailwindTheme } from '@intellectif/lk-react/theme/ThemeProvider';

export default {
  theme: { extend: createTailwindTheme({}) }, // → colors/spacing/borderRadius/fontFamily/fontSize
};
// usage: class="bg-lk-primary text-lk-surface rounded-lk-base"
```

Each entry is a `var(--lk-*, <fallback>)` reference, so utilities respond live to `ThemeProvider` / dark mode **and** work with zero setup. This styles *your* markup — it does not restyle the SDK's internals (use the class hooks above for that). `defaults.css` is Tailwind-preflight-safe by contract.

## Recommended setups

- **Just want it to look good:** import `defaults.css` + `skin.css`, optionally wrap in `ThemeProvider` with a few brand token overrides.
- **Full custom design:** import `defaults.css` only, skip the skin, write your own CSS against the class hooks using the `--lk-*` tokens.
- **Tailwind shop:** import `defaults.css` (+ skin if desired), add `createTailwindTheme` for your own components.
