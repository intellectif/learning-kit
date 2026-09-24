/**
 * How the SDK reads text a model wrote, before a learner does. Internal: shared
 * by the AI checks, and exported by none of the package's entry points.
 */

/**
 * Plain text as the learner will read it: line endings unified, control
 * characters other than line breaks and tabs removed, runs of blank lines
 * collapsed, the ends trimmed.
 */
export function cleanText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
