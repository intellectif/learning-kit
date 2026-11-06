'use client';

import {
  type ActivityData,
  type ActivityResult,
  ActivitySchemaError,
  combineDeliveryPolicies,
  type DeliveryPolicy,
  evaluate,
  type InteractionEvent,
  type ItemGroup,
  type ItemOutcome,
  type ItemScoringPolicy,
  type LearnerResponse,
  nextRouteLearnerState,
  type PlannedQuestion,
  planRoute,
  ROUTE_STRATEGIES,
  type RouteEvent,
  type RouteFadingOptions,
  type RouteLearnerState,
  type RouteLevel,
  type RouteStep,
  type RouteStrategyId,
  type RouteSummary,
  type RouteTrace,
  readRouteLearnerState,
  readRouteTrace,
  routeAnswers,
  routeLevels,
  routePassageFingerprint,
  routeStepText,
  summarizeRoute,
  type ThemeTokens,
  validateItemGroup,
} from '@intellectif/lk-core';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { LearnerAi } from '../../ai/LkAiProvider.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import { isDevelopment } from '../_internal.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { Matching } from '../Matching/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { useDeliveryPolicy } from '../shared/delivery.js';
import type { HtmlSanitizer, RenderableActivity } from '../types.js';
import { Debrief } from './Debrief.js';
import { type Decoration, Passage } from './Passage.js';
import {
  clearPartMarks,
  paintPhrases,
  partElements,
  phraseRanges,
  TARGET_ATTRIBUTE,
} from './question-marks.js';
import { RouteHostContext } from './route-host.js';

/** What a finished route hands the host to store. */
export interface ReadingRouteResult {
  /** The report: answers, evidence found, causes, per strategy. Not a grade. */
  summary: RouteSummary;
  /** Everything the learner did, to store beside the attempt and show again in `review`. */
  trace: RouteTrace;
  /** The learner's next state, to pass back as `learnerState` next time. */
  state: RouteLearnerState;
  /** The learner's answers, by item id. */
  responses: Record<string, LearnerResponse>;
}

export interface ReadingRouteProps {
  /**
   * An item group with a `route`: a text passage and its multiple-choice,
   * fill-in-the-blanks, gap-select and matching questions. Full content: the route grades
   * in the browser, as practice does.
   */
  group: ItemGroup<RenderableActivity>;
  /**
   * `practice` (default): the guided route. `review`: the debrief of a stored
   * attempt, from `trace` and `responses`. A route is formative: a paper of
   * record goes through `<ActivitySequence>`, which presents the same group
   * as an ordinary testlet.
   */
  renderMode?: 'practice' | 'review';
  /** The learner's state with each strategy, as a previous `onFinish` handed it over. */
  learnerState?: RouteLearnerState | null;
  /** One level for every strategy, over the learner's state. */
  level?: RouteLevel;
  /** The level of a strategy the learner has not met. Default `walkthrough`. */
  entryLevel?: RouteLevel;
  /** How quickly help fades. See `nextRouteLearnerState`. */
  fading?: RouteFadingOptions;
  /**
   * A suggested time, shown against the time taken and never enforced: seconds,
   * or `true` for 90 seconds a question — an IELTS pace. Nothing ends when it runs out.
   */
  pace?: boolean | number;
  /** Called once, when the learner finishes. */
  onFinish?: (result: ReadingRouteResult) => void;
  /** Called with the whole trace after everything the learner does, for autosave. */
  onTraceChange?: (trace: RouteTrace) => void;
  /** `review`: the trace of the attempt to show. */
  trace?: RouteTrace | null;
  /** `review`: the learner's answers, by item id. */
  responses?: Readonly<Record<string, LearnerResponse>>;
  /** `review`: the grades, by item id, when a server holds them. Otherwise the route grades. */
  outcomes?: Readonly<Record<string, ItemOutcome>>;
  /** The clock that stamps the trace, in milliseconds. Default `Date.now`. */
  now?: () => number;
  /** What the learner may be shown. `hints: false` takes the guide away: every strategy is solo. */
  delivery?: DeliveryPolicy | null;
  /** How each question scores its tries and hints, as on any question. */
  scoring?: ItemScoringPolicy | null;
  strings?: LkStringsOverride;
  /** The interface language. The passage carries `stimulus.locale`. */
  locale?: string;
  theme?: Partial<ThemeTokens>;
  sanitizeHtml?: HtmlSanitizer;
  ai?: LearnerAi;
  onInteraction?: (event: InteractionEvent) => void;
}

interface LocateState {
  tries: number;
  /** `null` while the learner is still to find it. */
  resolved: 'hit' | 'missed' | 'shown' | null;
  /** The sentence chosen last. */
  pick?: number;
  hit?: boolean;
}

type EventInput = RouteEvent extends infer E
  ? E extends RouteEvent
    ? Omit<E, 'at'>
    : never
  : never;

const ITEM_TYPES = new Set(['multiple-choice', 'fill-in-the-blanks', 'gap-select', 'matching']);

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Brings `element` into view inside `pane`. Side by side, each pane scrolls on
 * its own and the page stays where the learner left it; stacked, the panes do
 * not scroll, and only the `primary` one moves the page — so a step never
 * leaves both the passage and the question half in view. Instant, never
 * smooth: nothing in a route moves by itself (WCAG 2.3.3).
 */
function bring(
  pane: HTMLElement | null,
  element: Element | null | undefined,
  primary: boolean,
): void {
  if (pane === null || element === null || element === undefined) {
    return;
  }
  if (pane.scrollHeight > pane.clientHeight + 1) {
    const box = pane.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    if (target.top < box.top || target.bottom > box.bottom) {
      pane.scrollTop += target.top - box.top - Math.max(0, (box.height - target.height) / 3);
    }
    return;
  }
  if (primary && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center' });
  }
}

/** Steps about the question rather than the passage: on a narrow screen, the question is what comes into view. */
const QUESTION_MOVES = new Set([
  'read-instructions',
  'keywords',
  'predict',
  'decide',
  'eliminate',
  'check-answer',
  'compare-views',
]);

/**
 * Guided practice in how to read an exam passage for its questions. The
 * learner is walked through each question the way a skilled candidate takes
 * it — read the instructions, find the key words, scan for them, read around
 * what was found, match the meaning, decide — one step at a time, with what to
 * look at highlighted and why. At the decisive step the learner first chooses
 * where they would look, and only then is shown. Help fades by strategy, from
 * `walkthrough` to `coached` to `solo`, as `nextRouteLearnerState` decides
 * from what the learner did; the debrief shows the evidence, the paraphrases,
 * the traps, and why each wrong answer went wrong.
 *
 * The questions are the SDK's own components and grade exactly as they do
 * anywhere else. Nothing moves by itself: every step waits for the learner.
 */
export function ReadingRoute({
  group: given,
  renderMode = 'practice',
  learnerState,
  level,
  entryLevel,
  fading,
  pace,
  onFinish,
  onTraceChange,
  trace: givenTrace,
  responses: givenResponses,
  outcomes,
  now = Date.now,
  delivery,
  scoring,
  strings,
  locale,
  theme,
  sanitizeHtml,
  ai,
  onInteraction,
}: ReadingRouteProps): React.JSX.Element {
  const s = useLkStrings(strings);
  // An interactive video holding this route as one of its quizzes.
  const host = useContext(RouteHostContext);
  const policy = useDeliveryPolicy(delivery);
  const review = renderMode === 'review';
  // A route is drawn from the group it mounted with: a new object with the same
  // content mid-route would otherwise restart it.
  const group = useRef(given).current as unknown as ItemGroup;
  const body = typeof group.stimulus.body === 'string' ? group.stimulus.body : '';
  const clockRef = useRef(now);
  clockRef.current = now;
  const traceListener = useRef(onTraceChange);
  traceListener.current = onTraceChange;

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (group.route === undefined) {
      return new Error(
        `ReadingRoute "${group.id}" was given an item group with no route. Give it a route, or render it with <ActivitySequence>.`,
      );
    }
    const result = validateItemGroup(group);
    return result.success ? null : new ActivitySchemaError('item-group', result.errors);
  }, [group]);

  const storedTrace = useMemo(
    () => (review ? readRouteTrace(givenTrace) : null),
    [review, givenTrace],
  );
  const [levels] = useState<Partial<Record<RouteStrategyId, RouteLevel>>>(() => {
    if (review) {
      const started = storedTrace?.events.find((event) => event.type === 'started');
      return started?.type === 'started'
        ? started.levels
        : routeLevels(group, null, { level: 'solo' });
    }
    // The guide is help: a paper that switches hints off has every strategy solo.
    if (!policy.hints) {
      return routeLevels(group, null, { level: 'solo' });
    }
    return routeLevels(group, readRouteLearnerState(learnerState), {
      ...(level !== undefined ? { level } : {}),
      ...(entryLevel !== undefined ? { entry: entryLevel } : {}),
    });
  });
  const plan = useMemo(() => planRoute(group, { levels }), [group, levels]);
  const steps = plan.steps;
  const byKey = useMemo(
    () => new Map(plan.questions.map((question) => [question.key, question])),
    [plan],
  );
  const questionsOf = useMemo(() => {
    const map = new Map<string, PlannedQuestion[]>();
    for (const question of plan.questions) {
      map.set(question.itemId, [...(map.get(question.itemId) ?? []), question]);
    }
    return map;
  }, [plan]);
  const passage = useMemo(() => routePassageFingerprint(body), [body]);

  // ── The trace ───────────────────────────────────────────────────────────
  const events = useRef<RouteEvent[]>([]);
  const traceOf = useCallback(
    (): RouteTrace => ({ traceVersion: '1', passage, events: [...events.current] }),
    [passage],
  );
  const record = useCallback(
    (event: EventInput, at: number = clockRef.current()) => {
      events.current.push({ at, ...event } as RouteEvent);
      traceListener.current?.(traceOf());
    },
    [traceOf],
  );
  const started = useRef(false);
  const startedAt = useRef(0);
  useEffect(() => {
    if (review || started.current) {
      return;
    }
    started.current = true;
    startedAt.current = clockRef.current();
    record({ type: 'started', levels }, startedAt.current);
  }, [review, record, levels]);

  // ── Where the learner is ────────────────────────────────────────────────
  const [phase, setPhase] = useState<'reading' | 'debrief'>(review ? 'debrief' : 'reading');
  const [index, setIndex] = useState(0);
  const [locates, setLocates] = useState<Record<string, LocateState>>({});
  const [marking, setMarking] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, number[]>>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    summary: RouteSummary;
    next: RouteLearnerState | null;
  } | null>(null);
  const responses = useRef<Record<string, LearnerResponse>>({});
  const changedAt = useRef<Record<string, number>>({});
  const submitted = useRef(new Set<string>());
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const step: RouteStep | undefined = phase === 'reading' ? steps[index] : undefined;
  const stepQuestion = step?.question !== undefined ? byKey.get(step.question) : undefined;
  const locate = stepQuestion !== undefined ? locates[stepQuestion.key] : undefined;
  const pending = step?.ask === 'locate' && (locate?.resolved ?? null) === null;
  const revealed =
    step === undefined
      ? false
      : step.level === 'walkthrough'
        ? !pending
        : stepQuestion !== undefined && (locates[stepQuestion.key]?.resolved ?? null) !== null;

  const shownSteps = useRef(new Set<string>());
  useEffect(() => {
    if (step === undefined || shownSteps.current.has(step.id)) {
      return;
    }
    shownSteps.current.add(step.id);
    record({
      type: 'step',
      step: step.id,
      ...(step.question !== undefined ? { question: step.question } : {}),
    });
  }, [step, record]);

  // ── The advisory clock ──────────────────────────────────────────────────
  const suggested =
    pace === true ? plan.questions.length * 90 : typeof pace === 'number' && pace > 0 ? pace : null;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (suggested === null || phase !== 'reading') {
      return;
    }
    const timer = setInterval(() => {
      setElapsed((clockRef.current() - startedAt.current) / 1000);
    }, 1000);
    return () => clearInterval(timer);
  }, [suggested, phase]);

  // ── The debrief ─────────────────────────────────────────────────────────
  const reviewed = useMemo(() => {
    if (!review) {
      return null;
    }
    const trace = storedTrace ?? { traceVersion: '1' as const, passage, events: [] };
    return summarizeRoute(group, trace, routeAnswers(group, givenResponses ?? {}, outcomes ?? {}));
  }, [review, storedTrace, passage, group, givenResponses, outcomes]);
  const summary = finished?.summary ?? reviewed;
  const traceForMarks = review ? storedTrace : null;
  const markedFor = useCallback(
    (key: string): number[] => {
      if (traceForMarks !== null && traceForMarks !== undefined) {
        const set = new Set<number>();
        for (const event of traceForMarks.events) {
          if (event.type === 'marked' && event.question === key) {
            if (event.on) set.add(event.sentence);
            else set.delete(event.sentence);
          }
        }
        return [...set].sort((a, b) => a - b);
      }
      return marks[key] ?? [];
    },
    [traceForMarks, marks],
  );
  const finalResponses = review ? (givenResponses ?? {}) : responses.current;
  const finalOutcomes = useMemo(() => {
    if (phase !== 'debrief') {
      return {};
    }
    const graded: Record<string, ItemOutcome> = {};
    for (const item of group.items) {
      const response = Object.hasOwn(finalResponses, item.id) ? finalResponses[item.id] : undefined;
      const outcome = outcomes?.[item.id];
      if (outcome !== undefined) {
        graded[item.id] = outcome;
      } else if (response !== undefined) {
        try {
          graded[item.id] = evaluate(item as ActivityData, response);
        } catch {
          // A copy without its key cannot be graded here; it is shown ungraded.
        }
      }
    }
    return graded;
  }, [phase, group, finalResponses, outcomes]);

  const finish = (): void => {
    const at = clockRef.current();
    for (const item of group.items) {
      if (Object.hasOwn(responses.current, item.id) && !submitted.current.has(item.id)) {
        for (const question of questionsOf.get(item.id) ?? []) {
          record({ type: 'answered', question: question.key }, changedAt.current[item.id] ?? at);
        }
      }
    }
    record({ type: 'finished' }, at);
    // A player around the route counts an answer the learner gave and never
    // handed in, as the route does.
    if (host !== null) {
      for (const item of group.items) {
        const response = responses.current[item.id];
        if (response !== undefined && !submitted.current.has(item.id)) {
          host.submit(item.id, response);
        }
      }
    }
    const trace = traceOf();
    const result = summarizeRoute(group, trace, routeAnswers(group, responses.current));
    const next = nextRouteLearnerState(learnerState, result, fading);
    setMarking(null);
    setFinished({ summary: result, next });
    setSelected(
      result.questions.find((question) => question.correct !== true)?.key ??
        result.questions[0]?.key ??
        null,
    );
    setPhase('debrief');
    onFinish?.({ summary: result, trace, state: next, responses: { ...responses.current } });
  };

  // ── Acting on the passage ───────────────────────────────────────────────
  const selecting: 'locate' | 'mark' | null =
    phase === 'reading' && pending
      ? 'locate'
      : phase === 'reading' && marking !== null
        ? 'mark'
        : null;
  const onSelect = (sentence: number): void => {
    if (selecting === 'locate' && stepQuestion !== undefined) {
      const hit = stepQuestion.evidenceSentences.includes(sentence);
      record({ type: 'located', question: stepQuestion.key, sentence, hit });
      setLocates((current) => {
        const before = current[stepQuestion.key] ?? { tries: 0, resolved: null };
        const resolved = hit ? 'hit' : step?.level === 'walkthrough' ? 'missed' : null;
        return {
          ...current,
          [stepQuestion.key]: { tries: before.tries + 1, resolved, pick: sentence, hit },
        };
      });
      return;
    }
    if (selecting === 'mark' && marking !== null) {
      const current = marks[marking] ?? [];
      const on = !current.includes(sentence);
      record({ type: 'marked', question: marking, sentence, on });
      setMarks({
        ...marks,
        [marking]: on
          ? [...current, sentence].sort((a, b) => a - b)
          : current.filter((index) => index !== sentence),
      });
    }
  };
  const showMe = (): void => {
    if (stepQuestion === undefined) {
      return;
    }
    record({ type: 'shown', question: stepQuestion.key });
    setLocates((current) => ({
      ...current,
      [stepQuestion.key]: { ...(current[stepQuestion.key] ?? { tries: 0 }), resolved: 'shown' },
    }));
  };

  // ── What the passage shows ──────────────────────────────────────────────
  const view = useMemo((): { decorations: Decoration[]; zone?: { start: number; end: number } } => {
    if (phase === 'debrief') {
      const question = selected === null ? undefined : byKey.get(selected);
      if (question === undefined || !policy.solutions) {
        return { decorations: [] };
      }
      const decorations: Decoration[] = question.evidenceSentences.map((index) => {
        const sentence = plan.layout.sentences[index] as { start: number; end: number };
        return { start: sentence.start, end: sentence.end, kind: 'context' };
      });
      decorations.push(
        ...question.evidence.map((range) => ({ ...range, kind: 'target' as const })),
      );
      for (const pair of question.pairs) {
        for (const range of [pair.passage, pair.from, pair.to]) {
          if (range !== undefined) {
            decorations.push({
              start: range.start,
              end: range.end,
              kind: 'pair',
              pair: pair.index,
            });
          }
        }
      }
      const answer = summary?.questions.find((candidate) => candidate.key === question.key);
      for (const trap of question.traps) {
        // A trapped answer shows where its own option borrowed from; any other, every lure.
        if (
          trap.lure !== undefined &&
          (answer?.cause !== 'trap' || answer.chosen === trap.optionId)
        ) {
          decorations.push({ start: trap.lure.start, end: trap.lure.end, kind: 'lure' });
        }
      }
      return { decorations };
    }
    if (step === undefined) {
      return { decorations: [] };
    }
    const decorations: Decoration[] = [];
    if (revealed) {
      decorations.push(...step.context.map((range) => ({ ...range, kind: 'context' as const })));
      decorations.push(...step.highlight.map((range) => ({ ...range, kind: 'target' as const })));
      for (const pair of step.pairs) {
        for (const range of [pair.passage, pair.from, pair.to]) {
          if (range !== undefined) {
            decorations.push({
              start: range.start,
              end: range.end,
              kind: 'pair',
              pair: pair.index,
            });
          }
        }
      }
      for (const trap of step.traps) {
        if (trap.lure !== undefined) {
          decorations.push({ start: trap.lure.start, end: trap.lure.end, kind: 'lure' });
        }
      }
    }
    if (step.ask === 'locate' && locate?.pick !== undefined && locate.hit === false) {
      const sentence = plan.layout.sentences[locate.pick];
      if (sentence !== undefined) {
        decorations.push({ start: sentence.start, end: sentence.end, kind: 'mark' });
      }
    }
    return {
      decorations,
      ...(step.level === 'walkthrough' && step.zone !== undefined ? { zone: step.zone } : {}),
    };
  }, [phase, selected, byKey, policy.solutions, plan, summary, step, revealed, locate]);

  const markedSet = useMemo(() => {
    if (phase === 'debrief') {
      return new Set(selected === null ? [] : markedFor(selected));
    }
    return new Set(marking === null ? [] : (marks[marking] ?? []));
  }, [phase, selected, markedFor, marking, marks]);

  // ── What the questions show ─────────────────────────────────────────────
  const questionsRef = useRef<HTMLDivElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  const owner = useRef(Symbol('reading-route')).current;
  const moved = useRef(false);
  const scrolledFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const root = questionsRef.current;
    if (root === null) {
      return;
    }
    clearPartMarks(root);
    const activeKey = phase === 'debrief' ? selected : (step?.question ?? null);
    const question = activeKey === null ? undefined : byKey.get(activeKey);
    const card =
      question === undefined
        ? null
        : root.querySelector<HTMLElement>(`[data-route-item="${CSS.escape(question.itemId)}"]`);
    if (card !== null && question !== undefined) {
      const siblings = questionsOf.get(question.itemId) ?? [];
      const ordinal = question.partId === undefined ? undefined : siblings.indexOf(question) + 1;
      const part = phase === 'debrief' ? 'answer' : step?.part;
      if (part !== undefined) {
        for (const element of partElements(card, part, ordinal)) {
          element.setAttribute(TARGET_ATTRIBUTE, '');
        }
      }
      const phrases = phase === 'reading' && step?.level === 'walkthrough' ? step.phrases : [];
      paintPhrases(owner, phraseRanges(card, phrases));
    } else {
      paintPhrases(owner, []);
    }
    // Scrolled once per step the learner moved to, never on a render that
    // only typed an answer: the page must not jump under someone writing.
    const scrollKey = phase === 'debrief' ? `debrief:${selected}` : `${step?.id}:${revealed}`;
    if (moved.current && scrollKey !== scrolledFor.current) {
      scrolledFor.current = scrollKey;
      // A locate with nothing shown yet brings the passage up where to start reading.
      const first =
        view.decorations.find((decoration) => decoration.kind === 'target') ??
        view.zone ??
        (phase === 'reading' && step?.ask === 'locate' ? plan.layout.sentences[0] : undefined);
      const sentence =
        first === undefined
          ? undefined
          : plan.layout.sentences.find((candidate) => candidate.end > first.start);
      const aboutQuestion =
        phase === 'reading' && step !== undefined && QUESTION_MOVES.has(step.move);
      bring(
        passageRef.current,
        sentence === undefined
          ? undefined
          : passageRef.current?.querySelector(`[data-s="${sentence.index}"]`),
        !aboutQuestion,
      );
      bring(root, card, aboutQuestion || sentence === undefined);
    }
  });
  useEffect(() => () => paintPhrases(owner, []), [owner]);

  const go = (to: number): void => {
    moved.current = true;
    setIndex(Math.max(0, Math.min(steps.length, to)));
  };

  if (devError !== null) {
    throw devError;
  }

  const strategyName = (id: RouteStrategyId): string =>
    s.routeStrategy?.(id) ?? ROUTE_STRATEGIES[id].title;
  const pairsListed = (current: RouteStep): boolean =>
    current.pairs.some((pair) => pair.question !== undefined && pair.passage !== undefined);
  const stepText = (current: RouteStep): string => {
    // Coached, the learner finds the key words: the step names its move, not them.
    const hidden = current.level === 'coached' && !revealed;
    // The pairs of a paraphrase step are listed beside its words, numbered as in
    // the passage, so its words say what to do rather than repeat them.
    const listed = current.move === 'paraphrase' && pairsListed(current);
    const shown =
      hidden || listed
        ? {
            ...current,
            phrases: hidden ? [] : current.phrases,
            pairs: [],
            traps: hidden ? [] : current.traps,
          }
        : current;
    return (s.routeStep ?? routeStepText)(shown);
  };

  const guidance = steps.length > 0 && phase === 'reading';
  // Steps are counted within their question: "Step 2 of 6" of question 3 says
  // how far this one goes, where "Step 14 of 40" only says how far is left.
  const siblings =
    step === undefined ? [] : steps.filter((other) => other.question === step.question);
  const progress =
    step === undefined
      ? ''
      : [
          ...(step.number !== undefined ? [s.routeQuestionNumbers(step.number, step.number)] : []),
          // The skim before the questions is one step of its own, not a count.
          ...(step.question !== undefined
            ? [s.routeStepProgress(siblings.indexOf(step) + 1, siblings.length)]
            : []),
          ...(step.strategy !== undefined ? [strategyName(step.strategy)] : []),
        ].join(' · ');
  const announcement =
    step === undefined ? '' : `${progress}. ${s.routeMove(step.move)}. ${stepText(step)}`;

  const renderItem = (item: ItemGroup['items'][number]): ReactNode => {
    const node = itemComponent(item);
    return host === null || node === null ? node : host.wrap(item.id, node);
  };

  const itemComponent = (item: ItemGroup['items'][number]): React.JSX.Element | null => {
    const planned = questionsOf.get(item.id) ?? [];
    const solo = planned.length > 0 && planned.every((question) => question.level === 'solo');
    const common = {
      ...(strings !== undefined ? { strings } : {}),
      ...(locale !== undefined ? { locale } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(sanitizeHtml !== undefined ? { sanitizeHtml } : {}),
      ...(onInteraction !== undefined ? { onInteraction } : {}),
      ...(scoring !== undefined && scoring !== null ? { scoring } : {}),
    };
    let props: Record<string, unknown>;
    if (phase === 'debrief') {
      const value = Object.hasOwn(finalResponses, item.id) ? finalResponses[item.id] : undefined;
      const outcome = policy.feedback ? finalOutcomes[item.id] : undefined;
      props = {
        ...common,
        renderMode: 'review',
        delivery: policy,
        ...(value !== undefined ? { value } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
      };
    } else {
      props = {
        ...common,
        renderMode: 'practice',
        // Answering alone is answering as in the exam: nothing is marked until
        // the debrief, where every answer is.
        delivery: solo
          ? combineDeliveryPolicies(policy, { feedback: false, solutions: false })
          : policy,
        ...(ai !== undefined ? { ai } : {}),
        onChange: (response: LearnerResponse) => {
          responses.current[item.id] = response;
          changedAt.current[item.id] = clockRef.current();
        },
        ...(host !== null
          ? { onComplete: (result: ActivityResult) => host.complete(item.id, result) }
          : {}),
        onSubmit: (response: LearnerResponse) => {
          responses.current[item.id] = response;
          changedAt.current[item.id] = clockRef.current();
          submitted.current.add(item.id);
          host?.submit(item.id, response);
          for (const question of planned) {
            record({ type: 'answered', question: question.key });
          }
          rerender();
        },
      };
    }
    const key = `${item.id}:${phase}`;
    if (item.type === 'multiple-choice') {
      return <MultipleChoice key={key} data={item as never} {...props} />;
    }
    if (item.type === 'fill-in-the-blanks') {
      return <FillInTheBlanks key={key} data={item as never} {...props} />;
    }
    if (item.type === 'gap-select') {
      return <GapSelect key={key} data={item as never} {...props} />;
    }
    if (item.type === 'matching') {
      return <Matching key={key} data={item as never} {...props} />;
    }
    return null;
  };

  const levelBadges = Object.entries(plan.levels) as [RouteStrategyId, RouteLevel][];

  return (
    <div
      className="lk-rr"
      lang={locale}
      style={theme as CSSProperties | undefined}
      data-phase={phase}
      data-selecting={selecting ?? undefined}
    >
      <div className="lk-rr-bar">
        <ul className="lk-rr-strategies">
          {levelBadges.map(([strategy, current]) => (
            <li key={strategy} data-level={current}>
              <span className="lk-rr-strategy-name">{strategyName(strategy)}</span>
              <span className="lk-rr-level">{s.routeLevel(current)}</span>
            </li>
          ))}
        </ul>
        {suggested !== null && phase === 'reading' ? (
          <p className="lk-rr-pace">{s.routePace(clock(elapsed), clock(suggested))}</p>
        ) : null}
        {phase === 'reading' ? (
          <button type="button" className="lk-rr-finish" onClick={finish}>
            {s.routeFinish}
          </button>
        ) : null}
      </div>

      {guidance || (phase === 'debrief' && summary !== null) ? (
        <aside className="lk-rr-guide" aria-label={s.routeGuide}>
          {phase === 'debrief' && summary !== null ? (
            <Debrief
              summary={summary}
              questions={plan.questions}
              next={finished?.next ?? null}
              selected={selected}
              onSelect={(key) => {
                moved.current = true;
                setSelected(key);
              }}
              feedback={policy.feedback}
              solutions={policy.solutions}
              marked={(key) => markedFor(key).length}
              s={s}
            />
          ) : step !== undefined ? (
            <div className="lk-rr-step" data-move={step.move} data-level={step.level}>
              <p className="lk-rr-step-progress">{progress}</p>
              <h3 className="lk-rr-step-move">{s.routeMove(step.move)}</h3>
              <p className="lk-rr-step-text">{stepText(step)}</p>
              {revealed && pairsListed(step) ? (
                <ul className="lk-rr-pairs">
                  {step.pairs.map((pair) =>
                    pair.question !== undefined && pair.passage !== undefined ? (
                      <li key={pair.index}>
                        <span className="lk-rr-pair-chip" aria-hidden="true">
                          {pair.index}
                        </span>
                        {s.routeParaphrase(pair.question, pair.passage.text)}
                      </li>
                    ) : null,
                  )}
                </ul>
              ) : null}
              {step.ask === 'locate' ? (
                <div className="lk-rr-locate">
                  {pending ? <p className="lk-rr-locate-prompt">{s.routeLocatePrompt}</p> : null}
                  {locate?.hit === true ? (
                    <p className="lk-rr-locate-result" data-hit="true">
                      {s.routeLocateHit}
                    </p>
                  ) : null}
                  {locate?.hit === false && locate.resolved !== 'shown' ? (
                    <p className="lk-rr-locate-result" data-hit="false">
                      {s.routeLocateMiss(locate.resolved === 'missed')}
                    </p>
                  ) : null}
                  {pending ? (
                    <div className="lk-rr-locate-actions">
                      <button type="button" onClick={() => setFocusRequest((count) => count + 1)}>
                        {s.routeChooseSentence}
                      </button>
                      <button
                        type="button"
                        onClick={showMe}
                        data-prominent={(locate?.tries ?? 0) >= 2 || undefined}
                      >
                        {s.routeShowMe}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="lk-rr-step-actions">
                <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
                  {s.routeBack}
                </button>
                <button
                  type="button"
                  className="lk-rr-next"
                  onClick={() => go(index + 1)}
                  disabled={pending}
                >
                  {s.routeNext}
                </button>
                <button type="button" className="lk-rr-skip" onClick={() => go(steps.length)}>
                  {s.routeSkipGuide}
                </button>
              </div>
            </div>
          ) : (
            <div className="lk-rr-step" data-done="">
              <p className="lk-rr-step-text">{s.routeGuideDone}</p>
              <div className="lk-rr-step-actions">
                <button type="button" onClick={() => go(steps.length - 1)}>
                  {s.routeBack}
                </button>
              </div>
            </div>
          )}
        </aside>
      ) : null}
      <p className="lk-visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <div className="lk-rr-panes">
        <section className="lk-rr-passage" aria-label={s.routePassage} ref={passageRef}>
          {marking !== null && phase === 'reading' ? (
            <p className="lk-rr-marking-hint">
              {s.routeMarkingHint(byKey.get(marking)?.number ?? 0)}
            </p>
          ) : null}
          <Passage
            body={body}
            {...(group.stimulus.title !== undefined ? { title: group.stimulus.title } : {})}
            layout={plan.layout}
            decorations={view.decorations}
            {...(view.zone !== undefined ? { zone: view.zone } : {})}
            selecting={selecting}
            marked={markedSet}
            onSelect={onSelect}
            focusRequest={focusRequest}
            label={
              selecting === 'mark'
                ? s.routeMarkingHint(byKey.get(marking ?? '')?.number ?? 0)
                : selecting === 'locate'
                  ? s.routeLocatePrompt
                  : s.routePassage
            }
            {...(group.stimulus.locale !== undefined ? { locale: group.stimulus.locale } : {})}
          />
          {group.stimulus.attribution !== undefined ? (
            <p className="lk-rr-attribution">
              <cite>{group.stimulus.attribution}</cite>
            </p>
          ) : null}
        </section>
        <section className="lk-rr-questions" aria-label={s.routeQuestions} ref={questionsRef}>
          {group.items
            .filter((item) => ITEM_TYPES.has(item.type))
            .map((item) => {
              const planned = questionsOf.get(item.id) ?? [];
              const first = planned[0]?.number;
              const last = planned.at(-1)?.number;
              const activeKey = phase === 'debrief' ? selected : (step?.question ?? null);
              const active = planned.some((question) => question.key === activeKey);
              return (
                <div
                  key={item.id}
                  className="lk-rr-card"
                  data-route-item={item.id}
                  data-active={active || undefined}
                >
                  {first !== undefined && last !== undefined ? (
                    <p className="lk-rr-card-numbers">{s.routeQuestionNumbers(first, last)}</p>
                  ) : null}
                  {renderItem(item)}
                  {phase === 'reading' && planned.some((question) => question.level === 'solo') ? (
                    <div className="lk-rr-evidence">
                      {planned
                        .filter((question) => question.level === 'solo')
                        .map((question) => (
                          <button
                            key={question.key}
                            type="button"
                            className="lk-rr-mark"
                            aria-pressed={marking === question.key}
                            onClick={() =>
                              setMarking(marking === question.key ? null : question.key)
                            }
                          >
                            {marking === question.key
                              ? s.routeMarkDone
                              : s.routeMarkEvidence(question.number)}{' '}
                            <span className="lk-rr-mark-count">
                              {s.routeMarked(marks[question.key]?.length ?? 0)}
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </section>
      </div>
    </div>
  );
}
