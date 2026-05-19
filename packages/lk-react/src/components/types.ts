import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ThemeTokens,
} from '@intellectif/lk-core';

/**
 * The consistent prop contract shared by every activity component (Req 3.1).
 * Defined here (React-specific) rather than in lk-core, which is React-free.
 */
export interface ActivityProps<TData extends ActivityData = ActivityData> {
  data: TData;
  onComplete: (result: ActivityResult) => void;
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
}
