---
'@intellectif/lk-react': major
---

`<InteractiveVideo>` shows two caption languages at once: a first line and, when the learner asks for
it, a second under it — the language they are learning and their own, one line each.

- **Settings → Captions → Second language** picks the second line; the captions row reads
  `English + Español`. Picking the second line's language as the first swaps them. **C** turns both
  lines off and on, keeping both choices; **Shift + C** turns the second line off and on, and is listed
  in the shortcut sheet.
- Each line shows its own cue, so a translation segmented differently from the audio still reads
  line for line. The transcript shows the second language under each row, paired by overlap, and its
  search finds either language; the spoiler limit holds for both.
- Each language loads once for the life of the video, in parallel, and a late file never lands in a
  line that has moved on to another language. A second language that fails to load never takes the
  first with it, and the menu says which failed.
- **`defaultPreferences`** (new): preferences a host suggests, below what the learner chose — a
  language pair, say. `preferences` keeps its meaning and is now documented as a force.
  **`onPreferencesChange(next, change)`** (new) reports each change the learner makes, for a host that
  keeps the choice on the learner's account and passes it back as `defaultPreferences`.
  `VideoPreferences` gains `secondaryCaptionLanguage`. The player now stores only the fields a learner
  changed, so a host suggestion still reaches a learner who never chose that field; a payload stored
  by 15.x reads as every field chosen.
- **`resolveCaptionTracks(tracks, preferences)`** (new export): the rules the player uses to choose
  each line's track. A language now matches its regional tracks (`pt` finds `pt-BR`), and where two
  tracks share a language the `captions` one wins. A second line appears only when the learner asked
  for one — never a fallback.
- `dir="auto"` on every caption line, transcript row and menu item that shows a track's text, so an
  Arabic line's punctuation lands on the right side.
- Four optional tokens style the lines: `--lk-iv-caption-color`, `--lk-iv-caption-secondary-color`
  (warm yellow, clearing 4.5:1 on the caption box), `--lk-iv-caption-secondary-scale` and
  `--lk-iv-caption-gap`. The second line differs by position and size as well as colour. Four new
  strings, all in `docs/i18n.md`.

**One DOM change, for hosts that style the captions:** the lines now sit inside a
`<div class="lk-iv-captions">`, which is what is positioned over the video and rises with the
controls. Each line keeps `.lk-iv-caption`, its `span`, `data-size` and `data-background` (and gains
`data-role`, `lang` and `dir`), so rules that style a line's text still match. A rule that positions
`.lk-iv-caption` over the video should move to `.lk-iv-captions`.

**Major** because the peer range moves to `@intellectif/lk-core@^0.16.0`, whose tightened dictation
rule can refuse stored content. Nothing in this package was removed.

See `docs/interactive-video.md` and the 0.15 → 0.16 section of `docs/upgrading.md`.
