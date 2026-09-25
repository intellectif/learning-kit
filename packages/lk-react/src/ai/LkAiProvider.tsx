'use client';

import type {
  AiCoachingRequest,
  AiCoachingResult,
  AiExplanationRequest,
  AiHintRequest,
  AiTextResult,
  AiWritingFeedbackRequest,
  AiWritingFeedbackResult,
} from '@intellectif/lk-core';
import { createContext, type ReactNode, useContext } from 'react';

/**
 * The model a host runs for learners, as the components call it. The SDK never
 * calls a model, holds a key or writes a prompt: each port is the host's
 * function — usually a request to its own server, which holds the key and the
 * prompt and chooses the model.
 *
 * A port is called only when the learner asks — a button, never on render —
 * and gets an `AbortSignal` that fires when the answer it was asked about goes
 * away. Whatever it resolves to is checked before a learner sees it: see
 * `checkAiExplanation` and `checkAiHint` in lk-core. A port that rejects, or
 * resolves to something refused, costs the learner the help, never the
 * question.
 *
 * Leave a port out to switch that feature off. Nothing AI renders in `exam`,
 * whatever is passed.
 */
export interface LearnerAi {
  /** Explains a graded answer. */
  explain?: (
    request: AiExplanationRequest,
    options: { signal: AbortSignal },
  ) => Promise<AiTextResult>;
  /** Writes the next hint for an answer not yet submitted. */
  hint?: (request: AiHintRequest, options: { signal: AbortSignal }) => Promise<AiTextResult>;
  /** The most hints a learner can ask for on one question. Default 3, at most 10. */
  maxHints?: number;
  /**
   * Gives feedback on a draft of a written response, before the learner
   * submits it: the overall feedback as text, corrections that quote the
   * draft, and a judgement per rubric criterion. See `checkAiWritingFeedback`
   * in lk-core for what is refused.
   */
  writingFeedback?: (
    request: AiWritingFeedbackRequest,
    options: { signal: AbortSignal },
  ) => Promise<AiWritingFeedbackResult>;
  /** How many times a learner can ask for feedback on one written response. Default 3, at most 10. */
  maxWritingFeedback?: number;
  /**
   * Coaches a learner on a graded reading aloud: what the speech engine's
   * marks mean and how to practise, word by word. The marks are the engine's
   * and are never re-scored; coaching on a word the engine did not mark, or a
   * sound it did not report, is refused whole. See `checkAiCoaching` in
   * lk-core. One coaching per reading.
   */
  pronunciationCoaching?: (
    request: AiCoachingRequest,
    options: { signal: AbortSignal },
  ) => Promise<AiCoachingResult>;
  /**
   * The language to write explanations, hints, feedback and coaching in, as a tag (`es`,
   * `pt-BR`). Defaults to the component's `locale`: the interface language,
   * which the buttons around the help are in, and usually the right one. In a
   * language course it need not be the item's — English items, explained in
   * Spanish — and the item's own language reaches your port as `facts.locale`.
   */
  learnerLocale?: string;
}

const LkAiContext = createContext<LearnerAi | null>(null);

export interface LkAiProviderProps {
  ai: LearnerAi;
  children: ReactNode;
}

/**
 * Supplies the host's AI ports to every activity beneath, as `LkIntlProvider`
 * supplies strings. A component's own `ai` prop wins over it, whole.
 *
 * ```tsx
 * <LkAiProvider ai={{
 *   explain: (request, { signal }) => api.explain(request, signal),
 *   hint: (request, { signal }) => api.hint(request, signal),
 *   learnerLocale: learner.language,
 * }}>
 *   <ActivitySequence … />
 * </LkAiProvider>
 * ```
 */
export function LkAiProvider({ ai, children }: LkAiProviderProps): React.JSX.Element {
  return <LkAiContext.Provider value={ai}>{children}</LkAiContext.Provider>;
}

/** The ports in force: a component's own, else the provider's, else none. */
export function useLearnerAi(override?: LearnerAi): LearnerAi | undefined {
  const context = useContext(LkAiContext);
  return override ?? context ?? undefined;
}
