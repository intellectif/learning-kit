/**
 * Canonical word counter for written-response bounds (Req 22.9): tokens are
 * maximal runs of non-whitespace (split on `\s+`), so hyphenated forms
 * (`well-known`) count as one word. The empty / whitespace-only string counts
 * 0. Consumers must use this helper rather than re-implementing the split so
 * client previews, SDK scoring, and stored `wordCount` values always agree.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
