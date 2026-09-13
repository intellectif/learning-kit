'use client';

import {
  type ActivityType,
  type DraftNotComplete,
  evaluate,
  type ItemOutcome,
  type LearnerResponse,
  slotMediaKey,
  type ThemeTokens,
  validateDraft,
} from '@intellectif/lk-core';
import { type ReactNode, useMemo } from 'react';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import type { ActivityRenderer } from '../ActivitySequence/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import type { HtmlSanitizer, MediaBudgetBinding, RenderMode } from '../types.js';
import { WrittenResponse } from '../WrittenResponse/index.js';

/**
 * The option-shuffle seed a preview uses when none is given. Fixed, so a
 * shuffled question holds still while its author edits it instead of
 * re-ordering on every remount.
 */
const PREVIEW_SHUFFLE_SEED = 'lk-activity-preview';

/**
 * The slot a previewed activity stands in for. A recording's play budget is
 * keyed to it and lives only in this mount: the preview counts plays so an
 * author hears the limit a learner gets, and records none of them.
 */
const PREVIEW_SLOT_ID = 'preview';

export interface ActivityPreviewProps {
  /**
   * The activity as an editor holds it right now, finished or not. It is checked
   * with `validateDraft` before anything renders — by content, on every render —
   * so a half-written question never reaches a component that assumes a valid
   * one.
   */
  draft: unknown;
  /** The mode to preview in. Defaults to `practice`. */
  renderMode?: RenderMode;
  /**
   * A learner response to show as if a learner had given it. In `practice` and
   * `exam` it seeds the answer, which stays editable; in `review` it is the
   * submitted answer, marked by `evaluate()` unless `outcome` is given.
   */
  response?: LearnerResponse;
  /**
   * The outcome `review` marks the response with, instead of the one
   * `evaluate()` computes — which is how to preview a returned grade on a written
   * response, since the SDK cannot score one. Ignored in other modes.
   */
  outcome?: ItemOutcome;
  /**
   * Rendered in place of the activity while the draft is not complete, with the
   * issues `validateDraft` found — so an editor can list them in its own words.
   * The issue messages are English, and a preview that rendered them would put
   * untranslatable text on screen. Without it, the preview shows the
   * `previewIncomplete` or `previewInvalid` string.
   */
  fallback?: (result: DraftNotComplete) => ReactNode;
  /** Renderers for activity types beyond the built-ins, keyed by `type`, as on `<ActivitySequence>`. */
  renderers?: Readonly<Record<string, ActivityRenderer>>;
  /**
   * Seeds `<MultipleChoice>`'s option shuffle. Defaults to a fixed seed, so the
   * order holds while options are edited; adding or removing one deals them
   * again, because the shuffle orders by position. A `renderers` entry is given
   * no seed, as on `<ActivitySequence>`.
   */
  shuffleSeed?: string;
  /** Renders author-supplied rich text. See `HtmlSanitizer`. */
  sanitizeHtml?: HtmlSanitizer;
  /** Overrides the SDK's chrome text, for the preview's notice and the activity alike. */
  strings?: LkStringsOverride;
  /** Per-instance token overrides, passed to the activity. */
  theme?: Partial<ThemeTokens>;
  /** BCP 47 tag of the interface language, passed to the activity. */
  locale?: string;
}

type Marking = { kind: 'marked'; outcome: ItemOutcome } | { kind: 'failed'; error: Error };

/**
 * Renders an activity from an editor's draft, in any render mode, with a
 * simulated learner response — and renders a notice instead while the draft is
 * not an activity yet.
 *
 * Nothing it renders is recorded: no callback is wired, so a practice attempt in
 * a preview scores locally and goes nowhere, and a recording's play limit is
 * counted in memory only.
 *
 * A draft with no string `type`, a type nobody registered, and a `response` of a
 * different type from the draft are wiring errors, and throw.
 */
export function ActivityPreview({
  draft,
  renderMode = 'practice',
  response,
  outcome,
  fallback,
  renderers,
  shuffleSeed,
  sanitizeHtml,
  strings,
  theme,
  locale,
}: ActivityPreviewProps) {
  const s = useLkStrings(strings);
  const type = isRecord(draft) && typeof draft.type === 'string' ? draft.type : undefined;

  // Validated on the draft's CONTENT, not its identity. The activity components
  // restart whenever `data` changes identity, and an editor that rebuilds its
  // payload on every change would otherwise restart the question an author is
  // trying out each time anything else on the page was edited. The key is read
  // on every render, so a draft changed in place is checked again too.
  const contentKey = contentKeyOf(draft);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the draft's content (contentKey) is the trigger, not its identity
  const result = useMemo(
    () => (type === undefined ? undefined : validateDraft(type as ActivityType, draft)),
    [type, contentKey],
  );
  const activity = result?.status === 'complete' ? result.data : undefined;
  const responseFits = response === undefined || response.type === type;
  const responseKey = response === undefined ? 'none' : contentKeyOf(response);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the response's content (responseKey) is the trigger, not its identity
  const marking = useMemo((): Marking | undefined => {
    if (renderMode !== 'review' || activity === undefined) {
      return undefined;
    }
    if (outcome !== undefined) {
      return { kind: 'marked', outcome };
    }
    if (response === undefined || !responseFits) {
      return undefined;
    }
    try {
      return { kind: 'marked', outcome: evaluate(activity, response) };
    } catch (thrown) {
      // Scored here, during this component's own render, where no error boundary
      // inside the activity can catch it — so it is handed to one below.
      return {
        kind: 'failed',
        error: thrown instanceof Error ? thrown : new Error(String(thrown)),
      };
    }
  }, [renderMode, activity, outcome, responseKey, responseFits]);

  const activityId = activity?.id;
  const mediaBudget = useMemo<MediaBudgetBinding>(
    () => ({
      key: slotMediaKey(PREVIEW_SLOT_ID),
      slotId: PREVIEW_SLOT_ID,
      index: 0,
      ...(activityId !== undefined ? { activityId } : {}),
    }),
    [activityId],
  );

  // All hooks are called before these throws, so hook order stays stable.
  if (type === undefined || result === undefined) {
    throw new Error(
      '<ActivityPreview> needs a draft object with a string `type`, to know which activity to check and render.',
    );
  }
  // Checked against the draft's own type, whatever state the draft is in. A
  // mis-wired response is a wiring error however unfinished the draft is, and
  // waiting for the draft to be complete would throw on the very edit that
  // completes it.
  if (response !== undefined && !responseFits) {
    throw new Error(
      `<ActivityPreview> was given a "${response.type}" response for a "${type}" activity.`,
    );
  }
  if (result.status !== 'complete') {
    if (fallback !== undefined) {
      return <>{fallback(result)}</>;
    }
    return (
      <div
        className="lk-preview-unavailable"
        role="note"
        data-status={result.status}
        {...(locale !== undefined ? { lang: locale } : {})}
      >
        {result.status === 'invalid' ? s.previewInvalid : s.previewIncomplete}
      </div>
    );
  }
  const data = result.data;

  // A different simulated response, or a different mode, mounts the activity
  // afresh, play count included: a seeded answer is read at mount, and a practice
  // attempt the author submitted must not carry over into an exam preview. So
  // does a different recording or playback policy, which is a different listening
  // budget — the transport reads its count once, when it mounts.
  const key = `${renderMode}:${responseKey}:${recordingKeyOf(data)}`;

  if (marking?.kind === 'failed') {
    // The response is one the scorer cannot read, or a registered scorer threw.
    // Shown as the activity's error fallback, as a render failure would be.
    return (
      <ActivityErrorBoundary key={key} activityTitle={data.title} strings={s}>
        <Rethrow error={marking.error} />
      </ActivityErrorBoundary>
    );
  }

  const shared = {
    renderMode,
    // Without a binding a budgeted recording counts nothing in `practice`, and in
    // `exam` the media component refuses to render at all — rightly, on a real
    // paper, where nothing would persist the count. A preview persists nothing by
    // design, so it keeps the count in memory and says so.
    mediaBudget,
    ...(sanitizeHtml !== undefined ? { sanitizeHtml } : {}),
    ...(strings !== undefined ? { strings } : {}),
    ...(theme !== undefined ? { theme } : {}),
    ...(locale !== undefined ? { locale } : {}),
    // Seeded rather than controlled, in every mode, exactly as `<ActivitySequence>`
    // hands a restored answer to its slots — so a renderer written for the
    // sequence reads it here too. `review` is read-only either way, and `key`
    // above re-seeds whenever the response changes.
    ...(response !== undefined ? { defaultValue: response } : {}),
    ...(marking !== undefined ? { outcome: marking.outcome } : {}),
  };

  const Custom = renderers?.[data.type];
  if (Custom !== undefined) {
    return <Custom key={key} data={data} {...shared} />;
  }
  switch (data.type) {
    case 'multiple-choice':
      return (
        <MultipleChoice
          key={key}
          data={data}
          shuffleSeed={shuffleSeed ?? PREVIEW_SHUFFLE_SEED}
          {...shared}
        />
      );
    case 'fill-in-the-blanks':
      return <FillInTheBlanks key={key} data={data} {...shared} />;
    case 'written-response':
      return <WrittenResponse key={key} data={data} {...shared} />;
    default:
      return (
        <div className="lk-preview-unsupported" role="note">
          {s.unsupportedActivity}
        </div>
      );
  }
}

/** Throws `error` while rendering, so the error boundary around it shows its fallback. */
function Rethrow({ error }: { error: Error }): never {
  throw error;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The recording and its playback policy — not its description, which changes no budget. */
function recordingKeyOf(data: unknown): string {
  const media = isRecord(data) ? data.media : undefined;
  return isRecord(media) ? contentKeyOf([media.type, media.url, media.playback]) : '';
}

const identities = new WeakMap<object, number>();
let lastIdentity = 0;

/** A key for a value compared by identity: the same object always gets the same one. */
function identityKeyOf(value: object): string {
  let identity = identities.get(value);
  if (identity === undefined) {
    lastIdentity += 1;
    identity = lastIdentity;
    identities.set(value, identity);
  }
  return `#${identity}`;
}

/**
 * A string that changes exactly when a value's content does.
 *
 * Object keys are sorted, because key order is not content: a draft saved to a
 * JSON column comes back with its keys reordered. Every value is written in a
 * form no other value shares — JSON would write a non-finite number as `null`
 * and drop `undefined`, and those decide different issues. What JSON does not
 * describe — an instance of a class, a function, a reference back to an
 * enclosing object — is compared by identity, and a symbol by its description.
 */
function contentKeyOf(value: unknown, enclosing: Set<object> = new Set()): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      // `String` keeps NaN, the infinities and every other number apart; only -0
      // needs saying.
      return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint':
      return `${value}n`;
    case 'boolean':
    case 'undefined':
      return String(value);
    case 'symbol':
      return `Symbol(${JSON.stringify(value.description ?? null)})`;
    case 'function':
      return identityKeyOf(value);
  }
  // Every other `typeof` has returned above: this is `null`, or an object.
  if (value === null || typeof value !== 'object') {
    return 'null';
  }
  const prototype = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) || prototype === Object.prototype || prototype === null;
  if (!plain || enclosing.has(value)) {
    return identityKeyOf(value);
  }
  enclosing.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${Array.from(value, (item) => contentKeyOf(item, enclosing)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((field) => `${JSON.stringify(field)}:${contentKeyOf(record[field], enclosing)}`);
    return `{${fields.join(',')}}`;
  } finally {
    enclosing.delete(value);
  }
}
