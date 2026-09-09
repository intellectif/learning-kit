'use client';

import type { InteractionEvent, Stimulus } from '@intellectif/lk-core';
import { useId, useMemo } from 'react';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import type {
  HtmlSanitizer,
  MediaBudgetBinding,
  MediaTransportStrings,
  RenderMode,
} from '../types.js';

export interface StimulusPanelProps {
  stimulus: Stimulus;
  /**
   * 1-based presented positions of the first and last question this material
   * serves, rendered as "Questions 3–8" so a learner knows how far the
   * passage carries.
   */
  range?: { first: number; last: number };
  /** Renders `stimulus.bodyHtml` when provided. See `HtmlSanitizer`. */
  sanitizeHtml?: HtmlSanitizer;
  locale?: string;
  /**
   * Forwarded to the stimulus's own media. `review` keeps the browser's control
   * bar even under an enforcing policy — a graded paper cannot be changed by
   * listening again.
   */
  renderMode?: RenderMode;
  /**
   * Binds this group's recording to a play budget the consumer persists. One
   * recording serves every question in the group, so the key is derived from
   * the ENTRY rather than the slot — see `stimulusMediaKey()` in lk-core.
   */
  mediaBudget?: MediaBudgetBinding;
  /** Translations for the audio transport chrome. */
  mediaStrings?: Partial<MediaTransportStrings>;
  onInteraction?: (event: InteractionEvent) => void;
  disabled?: boolean;
  /** Overrides the SDK's chrome text for this panel. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
}

/**
 * Presents a shared stimulus — the passage, recording or image an item group's
 * questions refer to. A landmark region named by its title (or by its kind),
 * so a screen-reader user can jump back to the material from any question.
 *
 * Rich text follows the SDK-wide rule: `bodyHtml` is rendered only through a
 * caller-supplied sanitiser, and the plain `body` is the fallback — which the
 * schema guarantees exists whenever `bodyHtml` does.
 */
export function StimulusPanel({
  stimulus,
  range,
  sanitizeHtml,
  locale,
  renderMode,
  mediaBudget,
  mediaStrings,
  onInteraction,
  disabled,
  strings,
}: StimulusPanelProps): React.JSX.Element {
  const titleId = useId();
  const s = useLkStrings(strings);

  const bodyHtml = useMemo(() => {
    if (sanitizeHtml === undefined || typeof stimulus.bodyHtml !== 'string') {
      return null;
    }
    return sanitizeHtml(stimulus.bodyHtml);
  }, [stimulus.bodyHtml, sanitizeHtml]);

  const rangeText = range === undefined ? null : s.stimulusRange(range.first, range.last);

  const naming =
    stimulus.title !== undefined
      ? { 'aria-labelledby': titleId }
      : { 'aria-label': s.stimulusKind[stimulus.kind] };

  // The AUTHORED parts carry the stimulus language; the SDK's own chrome does
  // not. Declaring `stimulus.locale` on the whole region made a screen reader
  // read "Recording" and "Questions 3–5" — English strings this package ships
  // — in the passage's voice, so a Spanish listening panel announced its own
  // name and the only orientation text in it with Spanish phonetics
  // (WCAG 3.1.2 Language of Parts). Scope the declaration to the content it
  // actually describes.
  const contentLang = stimulus.locale !== undefined ? { lang: stimulus.locale } : {};

  return (
    <section className="lk-stimulus" data-kind={stimulus.kind} lang={locale} {...naming}>
      {stimulus.title !== undefined ? (
        <p className="lk-stimulus-title" id={titleId} {...contentLang}>
          {stimulus.title}
        </p>
      ) : null}
      {rangeText !== null ? <p className="lk-stimulus-range">{rangeText}</p> : null}
      {stimulus.media !== undefined ? (
        <ActivityMedia
          media={stimulus.media}
          {...(renderMode !== undefined ? { renderMode } : {})}
          {...(mediaBudget !== undefined ? { mediaBudget } : {})}
          {...(mediaStrings !== undefined ? { mediaStrings } : {})}
          {...(strings !== undefined ? { strings } : {})}
          {...(onInteraction !== undefined ? { onInteraction } : {})}
          {...(disabled !== undefined ? { disabled } : {})}
          {...(locale !== undefined ? { locale } : {})}
        />
      ) : null}
      {bodyHtml !== null ? (
        <div
          className="lk-stimulus-body"
          data-format="html"
          {...contentLang}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered only through the caller-supplied HtmlSanitizer — the SDK never injects unsanitised markup
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : stimulus.body !== undefined ? (
        <div className="lk-stimulus-body" data-format="text" {...contentLang}>
          {stimulus.body}
        </div>
      ) : null}
      {stimulus.attribution !== undefined ? (
        <p className="lk-stimulus-attribution" {...contentLang}>
          <cite>{stimulus.attribution}</cite>
        </p>
      ) : null}
    </section>
  );
}
