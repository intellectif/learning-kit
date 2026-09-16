/**
 * A BCP 47 tag in the one spelling read-aloud accepts: a lowercase language of
 * two or three letters, an optional title-case script, and a region of two
 * capitals or three digits — `en-US`, `es-419`, `zh-Hant-TW`. Nothing else: no
 * variants, extensions or private-use subtags.
 *
 * The region is required because pronunciation is assessed against one
 * locale's speech, and `en` does not say whose. The exact spelling is required
 * because a grade compares an item's locale with an assessment's as strings:
 * canonicalising at grade time would make a stored grade depend on the
 * runtime's `Intl` data.
 *
 * Internal: the content schema and the assessment validator share it.
 */
export const CANONICAL_LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-(?:[A-Z]{2}|[0-9]{3})$/;
