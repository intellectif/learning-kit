/**
 * Reading routes: guided practice in how a skilled candidate reads an exam
 * reading paper — where to look first, what to scan for, what to read
 * carefully, and how to decide — faded from a step-by-step walkthrough to the
 * learner working alone.
 *
 * A route is an ARRANGEMENT of an item group, as a timeline is: the passage
 * and its questions stay ordinary content, scored exactly as they are without
 * a route, and the route adds where each answer is justified in the text, the
 * question's key words with the passage's paraphrase of them, and the traps in
 * its options. Everything else — the steps, their order, what each highlights
 * — is planned from those facts by `planRoute`, so content never stores a
 * step that could go stale.
 *
 * Nothing in a route is a character offset. Places in the passage are QUOTES
 * of it (the W3C Web Annotation text-quote selector), so a route survives an
 * edit elsewhere in the passage, and an author writes it by copying words.
 */

/**
 * Words copied from the passage (`stimulus.body`). A string is the quote
 * itself; the object form names which occurrence is meant when the words
 * appear more than once (1 is the first). Matching ignores differences in
 * whitespace and in curly versus straight quotation marks, nothing else.
 */
export type RouteQuote = string | { text: string; occurrence?: number };

/**
 * The reading strategies the SDK plans routes for. Each is the technique an
 * exam task rewards, not an exam: `tfng` serves IELTS True/False/Not Given,
 * `multiple-choice` serves IELTS multiple choice and Cambridge C1/C2 Part 5,
 * `gapped-text` serves Cambridge C1 Part 7 and C2 Part 6, and so on (see
 * `ROUTE_STRATEGIES`).
 */
export type RouteStrategyId =
  | 'tfng'
  | 'ynng'
  | 'multiple-choice'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'multiple-matching'
  | 'sentence-endings'
  | 'completion'
  | 'summary-word-list'
  | 'gapped-text'
  | 'cross-text';

/** One step of a strategy. Each has the same meaning in every strategy that uses it. */
export type RouteMoveId =
  | 'read-instructions'
  | 'survey'
  | 'keywords'
  | 'predict'
  | 'locate'
  | 'read-around'
  | 'paraphrase'
  | 'decide'
  | 'eliminate'
  | 'cohesion'
  | 'check-answer'
  | 'compare-views';

/**
 * Why a wrong option attracts candidates. Shown in the debrief beside the
 * place in the text it borrows from, so the learner sees the trap work.
 */
export type RouteTrapKind =
  /** Repeats words from the text, but the text says something else about them. */
  | 'word-match'
  /** Says the opposite of the text. */
  | 'opposite'
  /** Only part of it is supported by the text. */
  | 'partial'
  /** May be true in the world, but this text does not say it. */
  | 'outside-knowledge'
  /** Broader than what the text says. */
  | 'too-general'
  /** Matches one detail, not the whole idea. */
  | 'too-specific'
  /** True according to the text, but not an answer to this question. */
  | 'not-the-question';

/** A key word or phrase of the question, and what the passage says instead. */
export interface RouteKeyword {
  /** Words exactly as the question writes them: in its stem, its sentence or one of its options. */
  question: string;
  /** The passage's words for the same idea. Absent when the passage repeats the question's words. */
  passage?: RouteQuote;
}

/** A link inside the passage that decides a gapped-text answer: a reference word and what it refers to, a linker and what it joins. */
export interface RouteLink {
  from: RouteQuote;
  to: RouteQuote;
}

/** A wrong option or choice, and why it attracts. */
export interface RouteTrap {
  /** The multiple-choice option id, or the gap-select choice id. */
  optionId: string;
  kind: RouteTrapKind;
  /** Where in the passage the trap borrows its words from. */
  lure?: RouteQuote;
}

/**
 * One question of the paper: a multiple-choice item, or one blank of a
 * fill-in-the-blanks item, or one gap of a gap-select item — the unit an exam
 * awards one mark for.
 */
export interface RouteQuestion {
  /** The item's `id`. */
  itemId: string;
  /** The blank, gap or prompt id. Required for fill-in-the-blanks, gap-select and matching; absent for multiple-choice. */
  partId?: string;
  strategy: RouteStrategyId;
  /**
   * Where the text justifies the answer. For a Not Given answer, where the text
   * discusses the topic without settling it — the place a candidate must read
   * to see that it does not.
   */
  evidence: RouteQuote[];
  /**
   * `any` (default): one of the quotes is enough. `all`: the answer needs every
   * one of them — a view in each of several texts, or two sentences read together.
   */
  evidenceMatch?: 'any' | 'all';
  keywords?: RouteKeyword[];
  links?: RouteLink[];
  /** The most words the answer may have (fill-in-the-blanks only). Every accepted answer must fit. */
  wordLimit?: number;
  traps?: RouteTrap[];
  /**
   * The author's own words for a step of this question, replacing the
   * strategy's (key: the step's move). At most 280 characters, and never the
   * answer.
   */
  notes?: Partial<Record<RouteMoveId, string>>;
}

/** A run of consecutive paragraphs that is one text or section of the stimulus. */
export interface RouteSection {
  /** Learner-visible label: "A", "Text 2", "Reviewer 1". */
  label: string;
  title?: string;
  /** How many paragraphs it spans, counted on from the previous section's last. */
  paragraphs: number;
}

/**
 * The route over an item group's passage. Lives on `ItemGroup.route`; an
 * lk-core that does not know it presents the group as an ordinary testlet,
 * with the same slots and grades.
 */
export interface ReadingRoute {
  routeVersion: '1.0';
  /** The number of the first question, as on the paper (IELTS Passage 2 starts at 14). Default 1. */
  startAt?: number;
  /**
   * Labels for the passage's paragraphs, in order — paragraphs are runs of text
   * separated by a blank line in `stimulus.body`. `""` leaves a paragraph
   * unlabelled. When given, one per paragraph.
   */
  paragraphLabels?: string[];
  /** The stimulus's texts or sections, when it has several (cross-text, multiple matching). Their paragraphs add up to the passage's. */
  sections?: RouteSection[];
  /** One per question of the group, in any order: numbering follows the items and their blanks, gaps or prompts. */
  questions: RouteQuestion[];
}

// ── Planning (runtime only, never stored) ─────────────────────────────────

/**
 * How much the route shows for a strategy.
 *
 * - `walkthrough` — every step in turn, with what to look at highlighted and
 *   why; at the decisive step the learner first predicts where to look.
 * - `coached` — each step named without its location; the learner finds the
 *   evidence, and is shown it only after finding it or asking.
 * - `solo` — no steps; the learner answers alone and may mark the sentence
 *   that justifies each answer. The route is shown in the debrief.
 */
export type RouteLevel = 'walkthrough' | 'coached' | 'solo';

/** A stretch of `stimulus.body`, in UTF-16 indices: `body.slice(start, end)`. Computed, never stored. */
export interface TextRange {
  start: number;
  end: number;
}

/** A stretch of the passage with the words it covers. */
export interface QuotedRange extends TextRange {
  text: string;
}

/** A trapped option of a planned question. */
export interface PlannedTrap {
  optionId: string;
  kind: RouteTrapKind;
  /** The option's or choice's own text. */
  option?: string;
  /** Where in the passage it borrows from. */
  lure?: QuotedRange;
}

/** A question word and the passage's word for it, or a link inside the passage. */
export interface PlannedPair {
  /** Numbered from 1 within its question, so a highlight in the passage and one in the question can be matched. */
  index: number;
  /** The question's words. */
  question?: string;
  /** The passage's words for them. */
  passage?: QuotedRange;
  /** A link inside the passage: the words that point, and what they point to. */
  from?: QuotedRange;
  to?: QuotedRange;
}

export interface PassageParagraph extends TextRange {
  index: number;
  label?: string;
  /** Index into `PassageLayout.sections`, when the route declares sections. */
  section?: number;
}

export interface PassageSentence extends TextRange {
  index: number;
  paragraph: number;
}

export interface PassageSection {
  label: string;
  title?: string;
  /** Index of its first and last paragraph. */
  first: number;
  last: number;
}

/** The passage cut into paragraphs and sentences, by the SDK's own deterministic rules (`ROUTE_SEGMENTER`). */
export interface PassageLayout {
  paragraphs: PassageParagraph[];
  sentences: PassageSentence[];
  sections: PassageSection[];
}

/** A route question with every quote resolved against the passage. */
export interface PlannedQuestion {
  /** `itemId`, or `itemId#partId` for a blank, gap or prompt. Names the question in traces and summaries. */
  key: string;
  itemId: string;
  partId?: string;
  /** Its number on the paper. */
  number: number;
  strategy: RouteStrategyId;
  level: RouteLevel;
  /** Empty in a redacted route. */
  evidence: TextRange[];
  evidenceMatch: 'any' | 'all';
  /** Sentences that hold evidence, in passage order. Locating any of them is finding it. */
  evidenceSentences: number[];
  /** Key words, then links, numbered in that order. */
  pairs: PlannedPair[];
  traps: PlannedTrap[];
  wordLimit?: number;
  notes: Partial<Record<RouteMoveId, string>>;
}

/** Which part of a question a step looks at. */
export type RouteQuestionPart = 'instructions' | 'question' | 'answer' | 'options';

/**
 * One step of a planned route: what to look at, and what to do there. The
 * words for it come from `routeStepText`, or from a translation of it.
 */
export interface RouteStep {
  /** `survey`, or `<question key>/<move>`. Unique in a plan. */
  id: string;
  move: RouteMoveId;
  level: RouteLevel;
  /** The question it serves; absent for the passage-level `survey`. */
  question?: string;
  number?: number;
  strategy?: RouteStrategyId;
  /** Passage to highlight while the step is shown. */
  highlight: TextRange[];
  /** Passage the step points to more faintly: the sentences around the evidence, the openings to skim. */
  context: TextRange[];
  /**
   * Where the search happens: from the previous answer on, when answers follow
   * the order of the text, or the one paragraph a heading is for. Text outside
   * it is dimmed.
   */
  zone?: TextRange;
  /** The part of the question to look at. */
  part?: RouteQuestionPart;
  /** Words of the question to highlight in it. */
  phrases: string[];
  /** Question words and the passage's words for them, to show side by side. */
  pairs: PlannedPair[];
  /** The trapped options to point out, with where each borrows from. */
  traps: PlannedTrap[];
  /** `locate`: the learner selects the sentence they would read before anything is shown. */
  ask?: 'locate';
  /** The author's words for this step, replacing the strategy's. */
  note?: string;
  /** Facts the step's words name. */
  params: {
    /** Number of the previous question in a run whose answers follow the text order. */
    previous?: number;
    /** Label of the paragraph or section the step is about. */
    region?: string;
    wordLimit?: number;
  };
}

export interface RoutePlan {
  layout: PassageLayout;
  questions: PlannedQuestion[];
  /** The guided steps, in order. Questions at `solo` have none. */
  steps: RouteStep[];
  /** The level each strategy in the route is presented at. */
  levels: Partial<Record<RouteStrategyId, RouteLevel>>;
}

// ── What the learner did ──────────────────────────────────────────────────

/**
 * One thing the learner did, stamped with the host's clock (milliseconds).
 * Sentence numbers index `PassageLayout.sentences` of the passage the trace's
 * `passage` fingerprint names.
 */
export type RouteEvent =
  | { at: number; type: 'started'; levels: Partial<Record<RouteStrategyId, RouteLevel>> }
  | { at: number; type: 'step'; step: string; question?: string }
  /** A locate: the sentence the learner chose before being shown, and whether it holds evidence. */
  | { at: number; type: 'located'; question: string; sentence: number; hit: boolean }
  /** The learner asked to be shown where to look. */
  | { at: number; type: 'shown'; question: string }
  /** Solo: a sentence marked, or unmarked, as the evidence for an answer. */
  | { at: number; type: 'marked'; question: string; sentence: number; on: boolean }
  /** An answer handed in or changed for the last time before finishing. */
  | { at: number; type: 'answered'; question: string }
  | { at: number; type: 'finished' };

/** Everything the learner did in one route, for the host to store beside the attempt. */
export interface RouteTrace {
  traceVersion: '1';
  /** `fingerprint` of `stimulus.body`: the passage the sentence numbers refer to. */
  passage: string;
  events: RouteEvent[];
}

/** Whether a question was answered correctly, and what was answered — for the cause of a wrong one. */
export interface RouteAnswer {
  /** `null`: not answered. */
  correct: boolean | null;
  /** The option or choice chosen, for a multiple-choice or gap-select question. */
  chosen?: string;
  /** The words written, for a fill-in-the-blanks question. */
  written?: string;
}

/**
 * Why an answer was wrong, from what the learner did:
 *
 * - `search` — they did not find the evidence;
 * - `meaning` — they found it and still misread it;
 * - `trap` — they chose an option the author tagged as a trap;
 * - `limit` — they wrote more words than the question allows;
 * - `unanswered` — they gave no answer;
 * - `unknown` — answered alone without marking evidence, so nothing tells.
 */
export type RouteCause = 'search' | 'meaning' | 'trap' | 'limit' | 'unanswered' | 'unknown';

export interface RouteQuestionSummary {
  key: string;
  itemId: string;
  partId?: string;
  number: number;
  strategy: RouteStrategyId;
  level: RouteLevel;
  /**
   * Whether the learner found the evidence: the first sentence they chose at
   * a locate step, or the sentences they marked when answering alone (too
   * many marked is not finding it). `null`: never asked and nothing marked.
   */
  located: boolean | null;
  /** Sentences chosen at locate steps. */
  tries: number;
  /** Whether they asked to be shown where to look. */
  shown: boolean;
  correct: boolean | null;
  /** Why it was wrong; `null` when it was right. */
  cause: RouteCause | null;
  /** The option or choice the learner chose, for a multiple-choice or gap-select question. */
  chosen?: string;
  trap?: RouteTrapKind;
  /** Seconds spent on it, where the trace can tell. */
  seconds: number | null;
}

export interface RouteStrategySummary {
  strategy: RouteStrategyId;
  level: RouteLevel;
  questions: number;
  correct: number;
  /** Questions where the evidence was found, of those where it could be told. */
  located: number;
  locatable: number;
}

export interface RouteSummary {
  groupId: string;
  questions: RouteQuestionSummary[];
  strategies: RouteStrategySummary[];
  correct: number;
  total: number;
  /** Seconds from start to finish, pauses included. `null` before it finished. */
  seconds: number | null;
}

// ── Fading ────────────────────────────────────────────────────────────────

/** Where a learner stands with each strategy. The host stores it; the SDK only computes the next one. */
export interface RouteLearnerState {
  stateVersion: '1';
  strategies: Partial<Record<RouteStrategyId, { level: RouteLevel; streak: number }>>;
  /**
   * Groups already counted, newest last. A second attempt at a passage is
   * memory of where the answers were, not skill, so it changes no level.
   */
  seen: string[];
}

export interface RouteFadingOptions {
  /** Successes in a row that take one level of help away. Default 2. */
  promoteAfter?: number;
  /** Failures in a row that give one level back. Default 2. */
  demoteAfter?: number;
  /** The level of a strategy the learner has not met. Default `walkthrough`. */
  entry?: RouteLevel;
  /** How many group ids `seen` keeps. Default 500. */
  remember?: number;
}
