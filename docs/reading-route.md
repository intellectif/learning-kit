# Reading routes

A reading route is **guided practice in how to read an exam passage for its questions**: where a
skilled candidate looks first, what they scan for, what they read carefully, and how they decide —
shown one step at a time, then faded until the learner does it alone. It serves the reading papers
of IELTS (Academic and General Training) and Cambridge English (B2 First, C1 Advanced,
C2 Proficiency), and any timed paper built from the same tasks.

Like an [interactive video](./interactive-video.md), it is not a new activity type: it is an
ordinary **item group** — a passage and its questions — that carries a `route`. Every question
stays its own question and grades exactly as it would without one.

**It is a formative tool**: for practice, not for a paper of record. `<ActivitySequence>` presents
the same group as an ordinary testlet for an exam.

It describes `@intellectif/lk-core` 1.11.0 and `@intellectif/lk-react` 23.8.0.

- [What it teaches, and why](#what-it-teaches-and-why)
- [The model](#the-model)
- [Strategies](#strategies)
- [Levels and fading](#levels-and-fading)
- [Rendering it](#rendering-it)
- [The debrief, the trace and the summary](#the-debrief-the-trace-and-the-summary)
- [Authoring one](#authoring-one)
- [Translating it](#translating-it)
- [Accessibility](#accessibility)
- [What it does not do](#what-it-does-not-do)
- [Sources](#sources)

## What it teaches, and why

Eye-tracking studies of real IELTS items found that successful candidates find a **small, relevant
part of the text and read it carefully**, while weaker ones spend longer on larger chunks (Bax,
2013). Exam reading interleaves fast search with careful reading of what was found (Weir et al.,
2009), and the answers are hidden behind **paraphrase**: the board itself warns that a statement
which only repeats the text's words may be False or Not Given. So each route walks the same loop
— *find the key words, scan for them or their paraphrase, read around what you found, match the
meaning, decide* — and adds what a task needs on top: a word limit, the main idea of a paragraph,
the words that tie a removed paragraph to its gap.

How it is taught follows the evidence on learning complex skills:

- **Worked examples that fade.** A step-by-step model helps a novice and gets in the way of an
  expert (the expertise-reversal effect); removing it as the learner shows the skill eases the move
  to working alone. Help fades **per strategy**, because a learner can scan for dates well and
  still miss paraphrases.
- **Predict before being shown.** At the decisive step the learner chooses the sentence they would
  read *before* the guide highlights it. Generating an answer beats reading one, and a highlight that
  always arrives first teaches waiting for it.
- **Signalling, beside the text.** Highlights in the passage and in the question, and the reason for
  each step next to them. Instructor highlighting helps comprehension; a highlight that never fades
  becomes a crutch, which is why it fades.
- **Feedback on the process, not only the product.** The debrief shows where the evidence was, the
  paraphrases the question used, the trap an option set, and *why* each wrong answer went wrong.

What it does **not** do, because the evidence is against it: speed reading, suppressing
inner speech, one-word-at-a-time displays, "bionic" bold, eye-movement drills, or webcam eye tracking.
Faster reading at the same comprehension comes from language, above all vocabulary — so a route
teaches where to spend careful reading, and its paraphrase pairs are vocabulary in context.
Strategy instruction helps, by a moderate amount; it is no substitute for language.

## The model

```text
ItemGroup
  stimulus     a text: the passage (body)
  items        multiple-choice, fill-in-the-blanks, gap-select
  route
    routeVersion '1.0'
    startAt          the first question's number (IELTS Passage 2 starts at 14)
    paragraphLabels  'A', 'B'... one per paragraph (paragraphs are separated by a blank line)
    sections         several texts in one stimulus: cross-text, gapped text, multiple matching
    questions        one per question of the items
      itemId, partId     the item, and its blank or gap (fill-in-the-blanks, gap-select)
      strategy           which technique it practises (see Strategies)
      evidence           quotes of the passage that justify the answer
      evidenceMatch      'any' (default) or 'all' quotes are needed
      keywords           the question's words, and the passage's words for them
      links              reference words and linkers inside the passage (gapped text)
      wordLimit          the most words an answer may have (completion)
      traps              wrong options, why they attract, and what they borrow from the text
      notes              the author's own words for a step
```

**A question** is what an exam awards one mark for: a multiple-choice item, or one blank of a
fill-in-the-blanks item, or one gap of a gap-select item. Questions are numbered as on the paper,
from `startAt`, in item order and then blank order.

**Places in the passage are quotes, never offsets.** An author copies the words; the SDK finds them.
A quote survives an edit elsewhere in the passage, and is matched ignoring runs of whitespace and
curly versus straight quotation marks — what copying out of a document changes — and nothing else.
Where the words appear more than once, say which: `{ "text": "the city", "occurrence": 2 }`.

**For a Not Given answer,** the evidence is where the text discusses the topic without settling it:
the place a candidate must read to see that it does not say.

```json
{
  "itemId": "tf3",
  "strategy": "tfng",
  "evidence": ["roughly double the original forecast"],
  "keywords": [
    { "question": "fewer passengers than expected", "passage": "roughly double the original forecast" }
  ],
  "traps": [{ "optionId": "t", "kind": "opposite" }]
}
```

Everything that locates an answer — `evidence`, `keywords`, `links`, `traps`, `notes` — is
**answer-key**: `redactItemGroup` removes it, and `reveal: 'after-submit'` returns it for a
debrief. Which strategy each question practises, its word limit, the labels and sections are
public. An lk-core that does not know `route` keeps it in content and presents the group as a
testlet; its *redacted* schema is strict, so a learner's copy redacted by 1.11.0 or later is
refused by an older client's `assertRedactedItemGroup`. Upgrade clients before servers.

## Strategies

Twelve built-in strategies, in `ROUTE_STRATEGIES`. Each is a technique, not an exam: the SDK ships
no exam content.

| Strategy | Serves | Written as | Its steps |
| --- | --- | --- | --- |
| `tfng` | IELTS True / False / Not Given | multiple-choice, gap-select | instructions, key words, locate, read around, match the meaning, decide |
| `ynng` | IELTS Yes / No / Not Given (the writer's views) | multiple-choice, gap-select | as `tfng`, deciding on the writer's view |
| `multiple-choice` | IELTS multiple choice; C1/C2 Part 5 | multiple-choice | key words, predict, locate, read around, match the meaning, rule out the traps |
| `matching-headings` | IELTS matching headings | multiple-choice, gap-select | skim, the main-idea sentence, match the meaning, rule out the traps |
| `matching-information` | IELTS "which paragraph contains" | multiple-choice, gap-select | key words (the kind of information), locate anywhere, read around, match |
| `matching-features` | IELTS matching features | multiple-choice, gap-select | key words, locate anywhere, read around, match |
| `multiple-matching` | C1 Part 8, C2 Part 7 | multiple-choice, gap-select | skim, key words, locate anywhere, read around, match |
| `sentence-endings` | IELTS sentence endings | multiple-choice, gap-select | key words, predict, locate, read around, rule out |
| `completion` | IELTS sentence, note, table, flow-chart completion; short answers | fill-in-the-blanks | instructions and word limit, key words, predict the word, locate, read around, check the answer |
| `summary-word-list` | IELTS summary completion from a list | gap-select | key words, predict, locate, read around, match, check |
| `gapped-text` | C1 Part 7, C2 Part 6 | multiple-choice, gap-select | read the text, the sentences either side of the gap, follow the links, test the fit |
| `cross-text` | C1 Part 6 | multiple-choice, gap-select | skim each text, key words, find every writer's view, compare |

Where answers follow the order of the text (`followsOrder`), each search starts after the previous
answer: the guide says so, and dims the text before it. A heading's search is its own paragraph.
The words of each step are `routeStepText(step)`; an author's `notes` for a step replace them.

## Levels and fading

Three levels, per strategy:

| Level | What the learner sees | What the learner does |
| --- | --- | --- |
| `walkthrough` | Every step, with what to look at highlighted and why | Chooses where they would look before the evidence is shown, then steps on |
| `coached` | Each step named, with no location and no key words | Finds the evidence; may try again, or ask to be shown |
| `solo` | Nothing until the debrief | Answers as in the exam, marking the sentence that proves each answer |

`nextRouteLearnerState(state, summary, options)` moves each strategy between levels. A question
**succeeds** when it is right, its evidence was not missed, and the learner did not ask to be
shown; two successes in a row (`promoteAfter`) take one level of help away, two failures
(`demoteAfter`) give one back, and **one passage moves a strategy at most one level**. A passage the
learner has already done changes nothing: a second attempt is memory of where the answers were,
not skill. The host stores the state and passes it back; `routeLevels(group, state)` reads it.

A delivery policy with `hints: false` makes every strategy `solo`: the guide is help.

## Rendering it

```tsx
import { ReadingRoute } from '@intellectif/lk-react/components/ReadingRoute';

<ReadingRoute
  group={group}                    // full content: practice grades in the browser
  learnerState={stored}            // from the last onFinish, or nothing for a new learner
  pace                             // a suggested time: 90 s a question, or a number of seconds
  onTraceChange={autosave}         // everything the learner did, after each thing
  onFinish={({ summary, trace, state, responses }) => save({ summary, trace, state, responses })}
/>
```

The passage and its questions sit side by side where there is room, one above the other where there
is not. The guide sits above both. Nothing moves by itself: every step waits for the learner, and
**Skip the guide** leaves it at any point with every question still answerable. The questions are
the SDK's own components, graded as anywhere else; answering `solo` shows no marks until the
debrief, as in the exam.

| Prop | |
| --- | --- |
| `group` | An item group with a `route` |
| `renderMode` | `practice` (default), or `review`: the debrief of a stored attempt from `trace` and `responses` (and `outcomes`, where a server holds the grades) |
| `learnerState`, `level`, `entryLevel`, `fading` | Where each strategy starts, and how help fades |
| `pace` | A suggested time, shown against the time taken. Advisory: nothing ends when it runs out |
| `onFinish`, `onTraceChange` | What to store |
| `now` | The clock that stamps the trace (default `Date.now`) |
| `delivery`, `scoring`, `strings`, `locale`, `theme`, `sanitizeHtml`, `ai`, `onInteraction` | As on every activity |

Its colours are tokens: `--lk-route-highlight` (a step's target), `--lk-route-context` (the
sentences around it), `--lk-route-pair` (key words and their paraphrases), `--lk-route-mark` (the
learner's marks) and `--lk-route-dim` (text outside the search). Each mark also has a shape — an
outline, an underline, a wavy line — so none is told by colour alone.

## The debrief, the trace and the summary

After **Finish and review**, the guide becomes a debrief: the score, how often the evidence was
found, each strategy's level now and next time, and every question with the cause of a wrong answer.
Opening one highlights its evidence in the passage, numbers the paraphrase pairs in the passage and
in a list, marks the text a trapped option borrowed from, and shows what the learner marked.

| Cause | Means |
| --- | --- |
| `search` | The learner did not find the evidence |
| `meaning` | They found it, and still misread it |
| `trap` | They chose an option the author tagged as a trap |
| `limit` | They wrote more words than the question allows |
| `unanswered` | No answer |
| `unknown` | Answered alone without marking evidence, so nothing tells |

Finding the evidence is judged by the first sentence chosen at a locate step, or by the sentences
marked when answering alone — **one of them holds the evidence, and no more were marked than it spans
plus one**: marking a whole paragraph is what weaker readers do, and it is not finding the answer.
The order the learner looked in is never part of it.

**None of it is a grade.** The questions grade as they always do; the summary is the report beside
the grade. The trace (`RouteTrace`) is the learner's actions stamped by the host's clock, stored
apart from the attempt as `MediaProgress` is; `readRouteTrace` reads one back and never throws.
`summarizeRoute(group, trace, routeAnswers(group, responses, outcomes))` rebuilds the summary
anywhere, a server included.

## Authoring one

```ts
import { createReadingRouteDraft, validateItemGroupDraft } from '@intellectif/lk-core';

const draft = createReadingRouteDraft({ newId: () => crypto.randomUUID() });
// …add the passage, the questions, and one route entry per question…
const { status, issues } = validateItemGroupDraft(draft);
```

A route's own codes are the `ig_route_*` rows of [docs/authoring.md](./authoring.md). Among them:
a quote that is not in the passage, or appears twice; key words the question does not contain; a
trap on the right answer; **an accepted answer longer than the word limit**, which a learner would
lose the mark for; and an author's note that names the answer. Naming every option — "True if it
agrees, False if it contradicts, Not Given if it is silent" — is the rule, not the answer, and is
allowed.

`planRoute(group, { levels })` shows exactly what a learner will be walked through, and
`passageLayout(body)` how the passage is cut into paragraphs and sentences. The sentences are cut by
the SDK's own rules (`ROUTE_SEGMENTER`), never by the browser's, so a server and every browser
number them alike. Run the passage through it once to see where your evidence falls.

## Translating it

The chrome is `LkStrings` (`route*`), as for every component. The words of the steps, the
strategy names and the trap explanations are lk-core's English (`routeStepText`,
`ROUTE_STRATEGIES`, `routeTrapText`), and three optional strings replace them: `routeStep(step)`,
`routeStrategy(id)` and `routeTrap(trap)`. A translation can call lk-core's for any step it does
not translate.

## Accessibility

- Nothing moves by itself, and scrolling a target into view is instant.
- Every mark has a shape as well as a colour, and the text keeps 4.5:1 on every highlight.
- Choosing a sentence works by keyboard: **Choose a sentence** moves focus into the passage, the
  arrow keys move between sentences, Enter or Space chooses. While choosing or marking, each
  sentence is a button (`aria-pressed` when marking); otherwise the passage is plain text.
- Each step is announced in a polite live region: the question, the step, its name and its words.

## What it does not do

- It is not a speed-reading, eye-training or reading-font feature, and it tracks no eyes.
- It is not a timer: `pace` is advisory, and timing a paper of record stays the host's.
- It is not an adaptive sequencer: fading changes the help inside a passage, never which passage
  comes next.
- It is not a grader of process: grades are the questions' own.
- It does not write passages or routes. A route is authored content, reviewed like any other.

## Sources

- Bax, S. (2013). The cognitive processing of candidates during reading tests: Evidence from
  eye-tracking. *Language Testing*, 30(4).
- Weir, C., Hawkey, R., Green, A., & Devi, S. (2009). The cognitive processes underlying the academic
  reading construct as measured by IELTS. *IELTS Research Reports*, 9.
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect.
  *Educational Psychologist*, 38(1).
- Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem
  solving in cognitive skill acquisition. *Educational Psychologist*, 38(1).
- Bertsch, S., Pesta, B. J., Wiscott, R., & McDaniel, M. A. (2007). The generation effect: A
  meta-analytic review. *Memory & Cognition*, 35(2).
- Schneider, S., Beege, M., Nebel, S., & Rey, G. D. (2018). A meta-analysis of how signaling affects
  learning with media. *Educational Research Review*, 23.
- Ponce, H. R., Mayer, R. E., & Méndez, E. E. (2022). Effects of learner-generated highlighting and
  instructor-provided highlighting on learning from text: A meta-analysis. *Educational Psychology
  Review*, 34.
- Rayner, K., Schotter, E. R., Masson, M. E. J., Potter, M. C., & Treiman, R. (2016). So much to
  read, so little time: How do we read, and can speed reading help? *Psychological Science in the
  Public Interest*, 17(1).
- Okkinga, M., et al. (2018). Effectiveness of reading-strategy interventions in whole classrooms:
  A meta-analysis. *Educational Psychology Review*, 30.
- IELTS, [Academic Reading format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading).
- Cambridge English, [C1 Advanced format](https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/format/)
  and [C2 Proficiency format](https://www.cambridgeenglish.org/exams-and-tests/qualifications/proficiency/format/).
