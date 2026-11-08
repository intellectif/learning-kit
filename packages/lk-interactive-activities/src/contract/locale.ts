/** The chrome language a player falls back to when the host names none (FR-27). */
export const DEFAULT_CHROME_LOCALE = 'en';

/**
 * The primary language subtag of a BCP 47 tag, lower-cased: `es-CO`, `es_419`
 * and `ES` are all `es`.
 */
export function primaryLanguage(locale: string | undefined): string {
  return (locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
}
