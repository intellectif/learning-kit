/**
 * The bounds of an interactive video — an item group with a `timeline`.
 *
 * A leaf module on purpose: the schemas, the authoring checks and the timeline
 * helpers all read these, and nothing here may import any of them back.
 */

/**
 * The item types an interactive video may present. CLOSED on purpose: a type
 * added to the SDK later, or a custom type a host registers, is not silently
 * embeddable. Each one here was chosen, and each works inside a paused video —
 * a read-aloud's microphone included, because every quiz pauses the video
 * first.
 */
export const INTERACTIVE_VIDEO_ITEM_TYPES = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'dictation',
  'read-aloud',
] as const;

/** One of {@link INTERACTIVE_VIDEO_ITEM_TYPES}. */
export type InteractiveVideoItemType = (typeof INTERACTIVE_VIDEO_ITEM_TYPES)[number];

/** Whether `type` is one of the item types an interactive video may present. */
export function isInteractiveVideoItemType(type: unknown): type is InteractiveVideoItemType {
  return (INTERACTIVE_VIDEO_ITEM_TYPES as readonly unknown[]).includes(type);
}

/** The most quizzes one video may hold. */
export const TIMELINE_MAX_QUIZZES = 100;

/**
 * The most questions one interactive video may hold, across all its quizzes.
 * The player keeps every one of them mounted, so an answer survives the
 * learner rewinding past its quiz.
 */
export const TIMELINE_MAX_ITEMS = 200;

/** The most chapters one video may hold. */
export const TIMELINE_MAX_CHAPTERS = 100;

/** The longest quiz or chapter title, in UTF-16 units. A title sits on one line of the player. */
export const TIMELINE_MAX_TITLE_LENGTH = 120;
