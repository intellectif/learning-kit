---
'@intellectif/lk-react': minor
---

**`<LkIntlProvider direction="auto">` reads a tag's script subtag, 35 right-to-left languages and `_`: `ku-Latn` turns left-to-right, `ckb` and `ar_EG` right-to-left**

**Action required:** look for the tags below in what you give `<LkIntlProvider locale>` and `directionForLocale()`: for each one, the interface turns the other way. Pass `direction` to keep the old one, and render and hydrate a page with the same lk-react version.

- **Right-to-left → left-to-right:** `ar`, `arc`, `dv`, `fa`, `he`, `ku`, `ps`, `sd`, `ug`, `ur` or `yi`, followed by `-`, with a left-to-right script subtag: `ar-Latn`, `he-Latn`, `ku-Latn`, `sd-Deva`, `ug-Cyrl`.
- **Left-to-right → right-to-left:** 27 more languages written right to left in every script they are commonly written in, unless a script subtag says otherwise — `ckb`, `syr`, `nqo`, `iw`, `ji`, `azb`, `mzn`, `pnb`, `prs` and the Arabic varieties with tags of their own; any other language with a right-to-left script subtag (`pa-Arab`, `ff-Adlm`, `und-Hebr`); and a tag whose first separator is `_` that reads right-to-left (`ar_EG`, `he_IL`, `ku_IQ`).
- **Unchanged:** `ku`, `sd` and `ug` without a script subtag stay right-to-left; the 11 languages without one stay right-to-left; private-use and grandfathered tags stay left-to-right; no `locale` still writes no `dir`.
- **Read from the tag alone**, as a dictation reads its own, and never from `Intl.Locale`, whose data a server and a browser need not share: a provider rendered on one and hydrated on the other writes the same `dir`. `lang` is still written as given, so give it `ar-EG`, not `ar_EG`.
- **Why a minor:** the interface's direction changes for the tags above. No export, type or grade changes.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md#236--237-lk-react
