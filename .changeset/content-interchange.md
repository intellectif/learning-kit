---
"@intellectif/lk-core": minor
---

**Exporting and importing content**: list and re-point every file an item or a group uses, keep what each recording says for the author's side only, and describe content in one JSON Schema.

**Action required:** none. Every field is optional and every function new. Two cases to check:
- **A field you already store under these names.** If your content keeps a media `transcript` that is not a string, or a `script` that is not a list of `{ speaker, text }` turns, it now fails validation.
- **A `switch` over the critic's codes.** The critic has three new codes, so a `switch` over them without a `default` branch needs them.

- **Files:** `listMediaRefs(entry)` lists every media address in an activity or an item group: each one's path, kind, owner and language. It covers an item's `media`, a multiple-choice option's `media`, dictation's and read-aloud's `slowMedia`, and a stimulus's `media`, with their captions, tracks and posters. A recording with no file yet is listed with `url: null`.

  ```ts
  const files = listMediaRefs(entry).filter((ref) => ref.url !== null);
  ```

  `mapMediaRefs(entry, fn)` returns a copy with each address replaced and nothing else changed. With `(ref) => ref.url` the copy equals the input. A type you register says where it keeps files with `mediaSlots` on its descriptor.

  ```ts
  const imported = mapMediaRefs(entry, (ref) => (ref.url === null ? null : storedUrlFor(ref.url)));
  ```
- **What a recording says:** an item's media, a listening option's media and a stimulus can carry an author-only `transcript` (plain text) and `script` (turns, each a `speaker` and a `text`).
  - Both are removed by `redact()` and `redactItemGroup()` at every reveal level, and refused by `assertRedacted()`. No request for a learner's AI help reads them.
  - `transcriptOf(holder)` gives the author-side text, the script as `Speaker: text` lines when there is no transcript. Pass it to `aiDraftsRequest` as its `source`.

  ```jsonc
  { "type": "audio", "url": "https://cdn.example/station.mp3",
    "transcript": "Where does the train leave from? Platform four.",
    "script": [{ "speaker": "Anna", "text": "Where does the train leave from?" }, { "speaker": "Ben", "text": "Platform four." }] }
  ```
- **Practice scored in the browser:** `withoutAuthorOnly(entry)` returns an item or a group without its author-only fields, and with its key and your own fields. Unlike `redact()`, whose output scorers refuse, it scores exactly as the stored item. Every vector of the grade-stability corpus shows it. Exams still go through `redact()`.

  ```ts
  res.json(withoutAuthorOnly(practiceItem));
  ```
- **The critic's new codes:** `media_script_differs` (a transcript and a script that say different words), `media_transcript_differs` (a dictation's or a read-aloud's recording saying other words than the item), and `media_transcript_unused` (on a picture or an embed). The AI critic now reads a recording's transcript and script. It no longer reads a caption track's address or language, a poster, or a speaker's label.
- **JSON Schema:** `contentJsonSchema()` is one draft 2020-12 document whose root is a sequence entry: any registered activity type, or an item group with typed items. `jsonSchemaFor(type, { target: 'draft-2020-12' })` gives one type's schema in that draft. Draft 7 stays the default, so the existing exports do not change.

  ```ts
  writeFileSync('schema.json', JSON.stringify(contentJsonSchema(), null, 2));
  ```

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md#exporting-and-importing-content-16
