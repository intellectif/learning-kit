'use client';

import type { ActivityResult, LearnerResponse } from '@intellectif/lk-core';
import { createContext, type ReactNode } from 'react';

/**
 * What a player that holds a reading route — an interactive video's reading
 * quiz — gives the route, so each question the route draws is recorded as the
 * player records its own: the same channel around it, the same calls when it
 * is answered and graded. Internal, and never a prop: a host string in it
 * could report one question as another.
 */
export interface RouteHost {
  /** Wraps one question's component, as the player wraps each of its own. */
  wrap(itemId: string, node: ReactNode): ReactNode;
  /** An answer handed in, and an answer graded. */
  submit(itemId: string, response: LearnerResponse): void;
  complete(itemId: string, result: ActivityResult): void;
}

export const RouteHostContext = createContext<RouteHost | null>(null);
