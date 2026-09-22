# AI help for learners

A learner can ask for **an explanation of a graded answer**, and for **hints before submitting one**.
The model is yours: the SDK never calls one, never holds a key, and never writes a prompt. It builds
the facts your model is given, from the item, the learner's answer and its own scorer, and checks
what comes back before a learner sees it.

It describes `@intellectif/lk-core` 0.17.0 and `@intellectif/lk-react` 17.0.0.

- [What a learner sees](#what-a-learner-sees)
- [Connecting your model](#connecting-your-model)
- [Where help appears, and who can switch it off](#where-help-appears-and-who-can-switch-it-off)
- [What your model is given](#what-your-model-is-given)
- [What the SDK refuses to show](#what-the-sdk-refuses-to-show)
- [Records, cost and privacy](#records-cost-and-privacy)
- [What is not here yet](#what-is-not-here-yet)

## What a learner sees

| Activity | Before submit | After grading |
|---|---|---|
| Multiple choice | "Get a hint" | "Explain my answer" |
| Fill in the blanks | "Get a hint" | "Explain my answer" |
| Gap select | "Get a hint" | "Explain my answer" |
| Dictation | — (it has its own word-by-word hints) | "Explain my answer" |

- **Hints** are listed as "Hint 1", "Hint 2"…, up to your limit (3 by default, at most 10). They stay
  listed after submit, so the learner can see what they were given, but no more can be asked for. A
  different question starts with none.
- **An explanation** appears under the graded answer, with its heading. When it arrives, focus moves
  to it from the button that asked.
- **Everything a model wrote is marked:** "Written by AI. It can make mistakes."
- **A call that fails or is refused** says so ("No hint is available right now.") and leaves the
  question exactly as it was. The learner can ask again, and a failure never blocks an answer.

## Connecting your model

A port is an async function, usually a request to your own server, which holds the key and the
prompt and chooses the model:

```tsx
import { LkAiProvider } from '@intellectif/lk-react/ai/LkAiProvider';

<LkAiProvider
  ai={{
    explain: (request, { signal }) => post('/api/ai/explain', request, signal),
    hint: (request, { signal }) => post('/api/ai/hint', request, signal),
    maxHints: 3,
    learnerLocale: learner.nativeLanguage, // explanations in the learner's own language
  }}
>
  <ActivitySequence activities={lesson} />
</LkAiProvider>
```

- **Every component also takes an `ai` prop**, which wins over the provider whole. So do
  `<ActivitySequence>` and `<InteractiveVideo>`. A question you draw yourself — a sequence's
  `renderers` override, or the video's `renderQuestion` — is handed the ports in force as `ai`,
  except in `exam`, where no question is given them.
- **Leave a port out to switch that help off.**
- **`learnerLocale`** is the language to write in. It defaults to the component's `locale`. In a
  language course that is often not the item's language: English items, explained in Spanish.
- **A port is called only when the learner presses a button**, never on render. It gets an
  `AbortSignal` that fires when the answer it was about goes away: the learner submits, the question
  changes, or the component unmounts. A late answer is dropped whether or not you honour the signal.

On your server, the request carries everything a prompt needs. Ask the model for the verdict it is
explaining, as well as the text: the SDK refuses an explanation of a verdict it did not reach. The
check works only on a verdict the model itself produced. An explanation without one is shown
unchecked, because agreement cannot be read out of prose. Echoing `request.grade.category` back
passes the check without testing anything.

```ts
import { type AiExplanationRequest, checkAiExplanation } from '@intellectif/lk-core';

app.post('/api/ai/explain', async (req, res) => {
  const request: AiExplanationRequest = req.body;
  const out = await model.json(EXPLAIN_PROMPT, {
    facts: request.facts, // the item, the answer, and the SDK's verdict part by part
    grade: request.grade, // score, maxScore, passed, and category
    language: request.learnerLocale,
  }); // → { verdict: 'incorrect', text: '…' }
  const result = { ...out, provenance: { model: MODEL_ID, promptHash: EXPLAIN_PROMPT_HASH } };
  // The same check the component runs; running it here too keeps a refusal out of your logs of
  // "what learners were shown".
  res.json(checkAiExplanation(result, request).ok ? result : { text: '' });
});
```

**The request is built in the browser.** In practice the browser already holds the answer key, so it
reveals nothing. A server that does not want to trust it can rebuild the request from its own copy of
the item and the submitted answer, with `aiExplanationRequest` and `aiHintRequest` from lk-core.

## Where help appears, and who can switch it off

| Mode | Hints | Explanation |
|---|---|---|
| `practice` | Before submit, unless the question is `disabled` | After submit |
| `exam` | **Never** | **Never** |
| `review` | Never | When the grade of record (`outcome`) is scored |

Help appears only where three things allow it:

1. **The mode**, as above. An exam question gives no help, whatever ports are passed.
2. **You**: a port for that kind of help.
3. **The item's author:** `ai: { hints: false }` or `ai: { explanations: false }` on the activity switches
   that help off wherever the item is delivered. Use it where any hint would give the answer away, as
   on a one-word vocabulary item. An author can only switch help off, never force it on. The field
   survives `redact()`, so a review honours it too.

## What your model is given

`request.facts` describes the item as the learner saw it, their answer, and the SDK's own verdict on
each part:

| Type | Facts |
|---|---|
| Multiple choice | The question, `mode`, and every option: its text, whether chosen, whether correct, the author's feedback |
| Fill in the blanks | The passage with each blank written `[1]`, `[2]`… in passage order, and per blank what was typed, the accepted answers, the verdict, the author's hint and feedback |
| Gap select | The passage the same way, and per gap the words offered, the one chosen, the right one, the verdict, the author's feedback |
| Dictation | The transcript, what was typed, and the SDK's word-by-word alignment (`correct`, `incorrect`, `missing`, `extra`) |

- **An explanation request** adds `grade`: the score, the maximum, whether it passed, and a
  `category` of `correct`, `partly-correct` or `incorrect`. In `review` it is the grade of record from
  `outcome`, so the explanation speaks to the grade on the screen. A grade of record whose numbers
  cannot be a grade — a `score` or `maxScore` that is not a finite number, a `maxScore` of 0 or less,
  a `score` below 0 or above `maxScore` beyond float noise — gets no explanation (0.18.0): there is no
  request, your port is not called, and the learner reads "No explanation is available right now."
- **A hint request** adds `hintNumber` and `previousHints`, and its facts carry the key and the
  learner's answer so far, marked part by part. The model can then hint where it helps ("look again at
  blank 2"). The learner never sees the facts.
- **On a redacted item** (a review after an exam), the facts carry no key: `correct`, `accepted`,
  `answer` and `transcript` are `null` except where the server's outcome supplies them. A port that
  needs the key loads the item on its server by `facts.activityId`.

## What the SDK refuses to show

Whatever a port resolves to is checked before a learner sees it. A refused answer shows as "not
available", is never counted as a hint, and is reported in development as a console warning naming
the reason:

| Refusal | When |
|---|---|
| `malformed` | Not an object with a string `text`, or a `verdict` it does not know |
| `empty` | Nothing left once cleaned. Control characters are removed, line breaks kept |
| `too-long` | Over 2,000 characters. Refused rather than cut, so a learner never reads half a sentence |
| `contradicts-grade` | An explanation stating a `verdict` other than the SDK's |
| `reveals-answer` | A hint containing an answer |

Text is always rendered as text, never as HTML.

**The answer check** (`hintRevealsAnswer`) finds an answer written out, ignoring case, accents and
punctuation, and reading compatibility forms such as fullwidth letters as the letters they stand for:

- **Multiple choice:** the text of any correct option, as whole words ("cat" is not found in
  "category").
- **Fill in the blanks and gap select:** any accepted answer, as whole words. An answer of one short
  word ("is", "the", "26") counts only where the hint writes it beside a word that neighbours it in the
  passage ("name is", "is Rossi"), so a hint can still say "the verb is irregular".

It is a floor, not a proof: it cannot catch an answer spelled out letter by letter, or described. Your
prompt should forbid giving the answer, and this check catches the model that does it anyway.

## Records, cost and privacy

- **Two interactions** reach `onInteraction`:
  - `ai-hint-shown`, with `hintNumber`;
  - `ai-explanation-shown`.

  Each carries the port's `provenance` when it sent one (`model`, `promptHash`, `generatedAt`), and
  each is emitted only for help the learner actually saw. Keep them beside the attempt: they are how a
  teacher, or an appeal, knows the learner had help.
- **Hints do not change a score in this release.** A penalty for hints belongs to the delivery policy,
  the next milestone on the [roadmap](./roadmap.md).
- **Cost:** a call happens only when a learner presses a button. It can be cached by
  `facts` + `grade`, or by `facts` + `hintNumber`: the same answer asks the same question.
- **Privacy:** a request carries the learner's answer and nothing that identifies them. It leaves the
  browser only through your port, under your agreements with your provider.

## What is not here yet

- **Feedback on written responses, and pronunciation coaching** for read-aloud.
- **Assistants for authors:** generated drafts, an item critic, suggested distractors and accepted
  answers.
- **Assisted grading** with a calibration gate.
- **Hint penalties and per-deployment AI switches**, which come with the delivery policy.

Each is on the [roadmap](./roadmap.md#next--the-delivery-policy-then-ai).
