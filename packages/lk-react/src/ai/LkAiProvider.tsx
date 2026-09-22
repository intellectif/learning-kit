'use client';

import type { AiExplanationRequest, AiHintRequest, AiTextResult } from '@intellectif/lk-core';
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
   * The language to write explanations and hints in — the learner's own,
   * which in a language course need not be the item's. Defaults to the
   * component's `locale`.
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
