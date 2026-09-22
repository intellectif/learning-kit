'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  InteractiveVideo as InteractiveVideoCore,
  type InteractiveVideoProps,
} from './InteractiveVideo.js';

export type {
  InteractiveVideoProps,
  InteractiveVideoQuestion,
  InteractiveVideoSlot,
  InteractiveVideoSummary,
  RenderableItemGroup,
} from './InteractiveVideo.js';
export type { CaptionSize, VideoPreferences } from './prefs.js';
// Which track each caption line shows, for a host that wants to state it —
// in its own language menu, say — the way the player will decide it.
export { type CaptionTracks, resolveCaptionTracks } from './tracks.js';

/**
 * Public interactive video: the player wrapped in `ActivityErrorBoundary`, so a
 * render failure — the development-time schema check among them — degrades to
 * an accessible fallback instead of taking the host page down.
 *
 * A formative tool, for lessons and practice — not for official summative
 * exams, which `<ActivitySequence>` delivers.
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
