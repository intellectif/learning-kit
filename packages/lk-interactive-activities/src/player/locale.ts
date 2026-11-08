import { directionForLocale } from '@intellectif/lk-react';

/** The chrome language a player falls back to when the host names none (FR-27). */
export const DEFAULT_CHROME_LOCALE = 'en';

/**
 * The primary language subtag of a BCP 47 tag, lower-cased: `es-CO`, `es_419`
 * and `ES` are all `es`.
 */
export function primaryLanguage(locale: string | undefined): string {
  return (locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/** `lang` and `dir` for an element, or nothing when no locale is known. */
export function languageAttributes(locale: string | undefined): {
  lang?: string;
  dir?: 'ltr' | 'rtl';
} {
  if (locale === undefined || locale.trim() === '') return {};
  return { lang: locale, dir: directionForLocale(locale) };
}

/** Fills `{name}` placeholders in a chrome string. Unknown names stay as written. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Whether a key press carries Ctrl, Cmd or Alt. Player shortcuts never take
 * those: Ctrl+C copies and Ctrl+R reloads, whatever the stage.
 */
export function hasCommandModifier(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/** Whether a key press was typed into a field, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}
