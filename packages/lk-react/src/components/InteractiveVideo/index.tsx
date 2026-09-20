'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  InteractiveVideo as InteractiveVideoCore,
  type InteractiveVideoProps,
} from './InteractiveVideo.js';

export type {
  InteractiveVideoProps,
  InteractiveVideoSlot,
  InteractiveVideoSummary,
  RenderableItemGroup,
} from './InteractiveVideo.js';
export type { CaptionSize, VideoPreferences } from './prefs.js';

/**
 * Public interactive video: the player wrapped in `ActivityErrorBoundary`, so a
 * render failure — the development-time schema check among them — degrades to
 * an accessible fallback instead of taking the host page down.
 */
export function InteractiveVideo(props: InteractiveVideoProps) {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary
      {...(props.group?.title !== undefined ? { activityTitle: props.group.title } : {})}
      strings={strings}
    >
      <InteractiveVideoCore {...props} />
    </ActivityErrorBoundary>
  );
}
