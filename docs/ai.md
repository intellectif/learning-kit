# AI help for learners

A learner can ask for **an explanation of a graded answer**, and for **hints before submitting one**.
The model is yours: the SDK never calls one, never holds a key, and never writes a prompt. It builds
the facts your model is given, from the item, the learner's answer and its own scorer, and checks
what comes back before a learner sees it.

It describes `@intellectif/lk-core` 0.17.0 and `@intellectif/lk-react` 17.0.0.

- [What a learner sees](#what-a-learner-sees)
- [Connecting your model](#connecting-your-model)
- [A question you draw yourself](#a-question-you-draw-yourself)
- [Where help appears, and who can switch it off](#where-help-appears-and-who-can-switch-it-off)
- [What your model is given](#what-your-model-is-given)
- [What the SDK refuses to show](#what-the-sdk-refuses-to-show)
- [Records, cost and privacy](#records-cost-and-privacy)
- [Testing your prompt](#testing-your-prompt)
- [What is not here yet](#what-is-not-here-yet)

## What a learner sees

| Activity | Before submit | After grading |
|---|---|---|
| Multiple choice | "Get a hint" | "Explain my answer" |
| Fill in the blanks | "Get a hint" | "Explain my answer" |
| Gap select | "Get a hint" | "Explain my answer" |
| Dictation | — (it has its own word-by-word hints) | "Explain my answer" |

- **Hints** are listed as "Hint 1", "Hint 2"…, up to your limit (3 by default, at most 10). They stay
  listed after submit, so the learner can see what they were given, but no more can be asked for —
  until a "Try again" reopens the answer, when the same list carries on toward the same limit. A
  different question starts with none. Under a [scoring policy](./scoring.md) that charges for hints,
  an AI hint costs what any hint costs, and the answer's `hintsRevealed` counts it.
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
    learnerLocale: learner.helpLanguage, // see "The language help is written in", below
  }}
>
  <ActivitySequence activities={lesson} />
</LkAiProvider>
```

- **Every component also takes an `ai` prop**, which wins over the provider whole. So do
  `<ActivitySequence>` and `<InteractiveVideo>`. A question you draw yourself — a sequence's
  `renderers` override, or the video's `renderQuestion` — is handed the ports in force as `ai`,
  except in `exam`, where no question is given them, and can offer the same help through the hooks in
  [A question you draw yourself](#a-question-you-draw-yourself).
- **Leave a port out to switch that help off.**
- **`learnerLocale`** is the language a model writes in. See
  [The language help is written in](#the-language-help-is-written-in).
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

### The language help is written in

The SDK writes nothing itself: it passes `learnerLocale` in every request, and your prompt decides
what a model does with it. Two languages are usually in play, and the request carries both:

- **`learnerLocale`**, the language to write in. Left out, it is the component's `locale` — the
  interface language, which the buttons, the SDK's own "Written by AI. It can make mistakes." and
  the rest of your page are in.
- **`facts.locale`**, the language the item is written in, when its author gave one. In a language
  course it is the language being learned — English items, explained in Spanish.

**Default to the interface language.** It is the language the learner chose to read your platform
in, and help in any other sits oddly under a button in that one. A learner's native language is a
fact about them, not a choice of what to read: a Spanish speaker who set their interface to English
may want exactly that. Where your learners ask for help in their own language — beginners often do —
make it a setting they choose ("Explain in: English / Español"), stored with them, and pass what they
chose.

Pass a language tag (`es`, `pt-BR`), and turn it into a name in your prompt with the platform's own
list rather than a table of your own, which will miss languages your learners speak:

```ts
const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(request.learnerLocale ?? 'en');
// 'es' → 'Spanish', 'pt-BR' → 'Brazilian Portuguese', 'uk' → 'Ukrainian'
```

The answer-leak check compares a hint with the answers as written. A hint that translates the
answer into the learner's language passes it, so say in your prompt that a translation of the answer
is the answer.

## A question you draw yourself

A host that draws its own question — a `renderers` override in `<ActivitySequence>`, or the video's
`renderQuestion` — gets the ports as `ai`, and the rules as two hooks:

```tsx
import { useAiExplanation, useAiHints } from '@intellectif/lk-react/ai/useAiHelp';

function MyMultipleChoice({ data, ai, renderMode, outcome, onInteraction }) {
  const [response, setResponse] = useState({ type: 'multiple-choice', selectedOptionIds: [] });
  const [submitted, setSubmitted] = useState(false);
  const shared = { data, response, submitted, renderMode, ai, onInteraction };
  const hints = useAiHints(shared);
  const explanation = useAiExplanation({ ...shared, outcome });
  // ... your own question, and then:
  return (
    <>
      {hints.offered && hints.used < hints.limit ? (
        <button type="button" onClick={hints.ask} aria-busy={hints.status === 'loading'}>
          Get a hint
        </button>
      ) : null}
      <ol>{hints.hints.map((hint) => <li key={hint.text}>{hint.text}</li>)}</ol>
      {explanation.explanation !== null ? <p>{explanation.explanation.text}</p> : null}
      {hints.used > 0 || explanation.explanation !== null ? (
        <p>Written by AI. It can make mistakes.</p>
      ) : null}
    </>
  );
}
```

They are what the SDK's own components use, so a question you draw follows the same rules, is given
the same facts and refuses the same answers. What they hand back is state — `offered`, `status`,
`hints`, `explanation`, `used`, `limit` — and one `ask` per feature, which keeps one identity for the
life of the question, so it is safe in an effect's dependencies.

- **`offered` is the rule, `ask` is the guard.** `ask` does nothing where `offered` is false, so a
  page that draws its own button reaches no model in an exam, however it asks, and none on an item
  whose author switched that help off.
- **The paper around the question has the last word on the mode.** Pass on the `renderMode` your
  question was given; leave it out and the set the question sits in answers for it, and an `exam`
  around it wins over anything you pass. A question standing on its own, in no set, is `practice` as
  before. So a renderer that forgets the mode, or defaults it to `practice` as components often do,
  still offers nothing on a paper of record — even under an `LkAiProvider` higher up the page.
- **Say who wrote it.** The SDK's own surfaces carry "Written by AI. It can make mistakes."; a page
  that drops that line passes a model's words off as the course's. Render `text` as text, never as
  HTML.
- **`ai` beats the provider**, exactly as it does on a component: pass the ports you were handed.

## Where help appears, and who can switch it off

| Mode | Hints | Explanation |
|---|---|---|
| `practice` | Before submit, unless the question is `disabled` | After submit |
| `exam` | **Never** | **Never** |
| `review` | Never | When the grade of record (`outcome`) is scored |

Help appears only where four things allow it:

1. **The mode**, as above. An exam question gives no help, whatever ports are passed.
2. **You**: a port for that kind of help.
3. **The item's author:** `ai: { hints: false }` or `ai: { explanations: false }` on the activity switches
   that help off wherever the item is delivered. Use it where any hint would give the answer away, as
   on a one-word vocabulary item. An author can only switch help off, never force it on. The field
   survives `redact()`, so a review honours it too.
4. **The school running the paper**, through its [delivery policy](./delivery.md):
   `delivery={{ ai: { explanations: false } }}` on a component or a pager switches a feature off for
   that paper, and `hints: false` switches every hint off, the author's included. An explanation also
   needs the policy's `feedback` and `solutions`: it explains a grade and all but always names the
   right answer, so it cannot appear where either is hidden. Like the author, a policy can only switch
   help off.

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

- **Three interactions** reach `onInteraction`:
  - `ai-hint-shown`, with `hintNumber`;
  - `ai-explanation-shown`;
  - `ai-help-refused`, with `feature` (`hint` or `explanation`), `reason` (a refusal from the table
    above) and, for a hint, `hintNumber`.

  The two "shown" events carry the port's `provenance` when it sent one (`model`, `promptHash`,
  `generatedAt`) and its `usage` when it sent that, and each is emitted only for help the learner
  actually saw. Keep them beside the attempt: they are how a teacher, or an appeal, knows the learner
  had help.

  **A refusal never carries the text.** A hint refused for revealing the answer contains the answer,
  and this event is logged. The reason is what a host needs.
- **What a call cost** rides back on the result, if your port puts it there:

  ```ts
  return { text, verdict, provenance: { model: MODEL_ID }, usage: await priceOf(response) };
  // usage: { promptTokens?, completionTokens?, costUsd? } — the same shape a GradeRecord carries
  ```

  The SDK never estimates it, never adds it up, and drops a number that cannot be a cost. It carries
  what you send to `onInteraction`, so what a learner was shown and what it cost are one record.
- **Tokens, quotas and rate limits are yours**, and belong on your server: it holds the key, the
  model, the billing and the identity of the learner, and the SDK has none of those. Your port is the
  one place every call passes through, which makes it the place to count them.
- **Hints do not change a score in this release.** A penalty for hints comes with scoring policies,
  the next milestone on the [roadmap](./roadmap.md): it changes grades, so it ships with grade vectors.
- **Cost:** a call happens only when a learner presses a button. Two calls asking the same thing have
  the same request, so `contentHash(request)` from lk-core is a cache key: canonical, key-order
  independent, and the same on your server as in the browser.
- **Privacy:** a request carries the learner's answer and nothing that identifies them. It leaves the
  browser only through your port, under your agreements with your provider.

## Testing your prompt

Your prompt is the part of this the SDK cannot see, and the part most likely to change. It ships a
kit that makes the calls a learner's questions would make — on items whose answers it knows — and
runs the same checks it runs before a learner sees anything:

```ts
// prompts.test.ts, in your CI, with your key
import { formatAiCheckReport, runAiCheck } from '@intellectif/lk-core/ai-check';

const report = await runAiCheck({
  explain: (request) => callMyModel(EXPLAIN_PROMPT, request),
  hint: (request) => callMyModel(HINT_PROMPT, request),
});
console.log(formatAiCheckReport(report));
// ai-check: 14/16 shown, 2 refused, 0 failed — slowest 1840 ms
//   reveals-answer: 2
//   ✗ fib-hint-1 [hint] Both blanks empty: reveals-answer
//       The first blank is "is" — as in "My name is Rossi".
expect(report.refused).toBe(0);
```

- **The cases are ordinary calls**, built by `aiExplanationRequest` and `aiHintRequest`: every type
  the SDK explains, answered right, wrong and partly right; every type it hints for, before an answer
  and after a wrong one. They include what a model slips on — an answer a hint can hardly avoid
  naming (`Madrid`), an answer of one short word (`is`), an accented answer (`cañón`), and a passage
  with more than one blank.
- **`aiCheckCases()`** hands them over, so you can filter to one type — or pass `cases` of your own,
  built on your own items with the same two functions. That is how you test a prompt against the
  content your learners actually see.
- **A refusal is a failure, not a warning:** it is help a learner asked for and did not get.
  `reveals-answer` is the one to treat most seriously — that prompt gives answers away.
- **It runs one call at a time** by default, because a run in CI meets a rate limit long before it
  runs out of patience; `concurrency` raises it.
- A port you leave out has its cases skipped rather than failed, and a port that throws is an
  `error` in the report — one bad call never hides the rest.

## What is not here yet

- **Feedback on written responses, and pronunciation coaching** for read-aloud.
- **Assistants for authors:** generated drafts, an item critic, suggested distractors and accepted
  answers.
- **Assisted grading** with a calibration gate.
- **Hint penalties**, which come with scoring policies. The per-deployment switches shipped as the
  [delivery policy](./delivery.md).

Each is on the [roadmap](./roadmap.md#next--the-delivery-policy-then-ai).
