---
'@intellectif/lk-react': minor
---

Translatable UI: `<LkIntlProvider>`, a `strings` prop on every component, and RTL support.

Until now every string the SDK rendered itself was an English literal, so a learner
sitting a Spanish paper read a Spanish passage inside an English scaffold, and a
listening exam could not say "No quedan reproducciones" at all. All 50 of those
strings are now one `LkStrings` type that you can replace.

```tsx
import { LkIntlProvider } from '@intellectif/lk-react/i18n/LkIntlProvider';

<LkIntlProvider
  locale="es"
  strings={{
    submit: 'Enviar',
    questionProgress: (index, total) => `Pregunta ${index} de ${total}`,
    wordCount: (n) => `${n} ${n === 1 ? 'palabra' : 'palabras'}`,
    media: { noPlaysRemaining: 'No quedan reproducciones' },
  }}
>
  <ActivitySequence activities={paper} />
</LkIntlProvider>;
```

**Nothing changes if you do nothing.** The English defaults are byte-identical to
what shipped before, a component without a provider still renders them, and the
`mediaStrings` / `mediaBudget.strings` props from 7.0.0 still work and still win
over the provider for the audio transport.

- **Interpolation and plurals are functions, not format strings.** No parser, no
  catalogue format, no runtime dependency. A translation can reorder its
  arguments — which a positional token cannot — and TypeScript checks the arity.
- **Precedence**: English defaults → provider → a component's own `strings` prop →
  `mediaStrings` / `mediaBudget.strings`. Later wins key by key, and the `media`
  and `stimulusKind` groups merge one level deep, so overriding one label never
  blanks its siblings.
- **RTL**: the provider sets `lang` and derives `dir` from the locale (override
  it with `direction`), and declares **neither** when you supplied neither — so
  mounting it inside an `<html dir="rtl">` host purely to translate text cannot
  flip that host's own subtree back to left-to-right. `skin.css` now uses logical
  properties throughout — four physical declarations put the per-blank feedback
  gap and a blank's tooltip on the wrong edge in a right-to-left page.
- **Only English is bundled.** The mechanism ships; the translations are yours.
  Shipping locales nobody in this repository can review would put unreviewed words
  in front of a learner on a summative paper.
- **Thrown errors stay English on purpose.** They address the developer who wired
  the component up, not the learner, and translating them would make them
  unsearchable.

New exports (barrel and `@intellectif/lk-react/i18n/LkIntlProvider`):
`LkIntlProvider`, `useLkStrings`, `useLkDirection`, `directionForLocale`,
`DEFAULT_STRINGS`, `mergeStrings`, and the `LkStrings` / `LkStringsOverride` /
`LkDirection` / `LkIntlProviderProps` types.

**Two learner-facing bugs found while proving the above, and fixed with it:**

- **Fill in the Blanks announced "No grade available." over a real grade.** A
  `graded` outcome — a gap-fill marked by a human or an AI grader and handed
  back — fell into the same arm as `unscorable`, so `review` mode told the
  learner no grade existed while showing them one. It now announces the score,
  normalised by `maxScore` so a grader payload of 8.5 / 10 does not read as 850%.
  Multiple Choice gained the matching `unscorable` arm, which was silent.
- **The exam submit paths announced English regardless of your translation.**
  `<MultipleChoice>` and `<FillInTheBlanks>` read the key in `practice` but held
  a literal in `exam` — the mode a summative paper actually runs — and
  `<WrittenResponse>`'s hand-in confirmation had no key at all. All three now go
  through `LkStrings`, and the coverage test drives every submitting path in
  every render mode so they cannot drift back.

Full reference: `docs/i18n.md`.
