import { directionForLocale } from '@intellectif/lk-react';

import { DEFAULT_CHROME_LOCALE, primaryLanguage } from '../contract/locale.js';

export { DEFAULT_CHROME_LOCALE, primaryLanguage };

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

/**
 * The language the chrome is really written in, for its `lang`: the host's tag
 * when it asked for Spanish or supplied its own strings, otherwise English. A
 * host asking for `pt-BR` with no strings gets English chrome, marked English.
 */
export function chromeLocaleFor(locale: string | undefined, strings: object | undefined): string {
  if (locale === undefined || locale.trim() === '') return DEFAULT_CHROME_LOCALE;
  const custom =
    strings !== undefined && Object.values(strings).some((value) => value !== undefined);
  return primaryLanguage(locale) === 'es' || custom ? locale : DEFAULT_CHROME_LOCALE;
}

/** The entries that have a value: an `undefined` override never blanks the chrome. */
export function definedOnly<T extends object>(values: T | undefined): Partial<T> {
  if (values === undefined) return {};
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  ) as Partial<T>;
}

/** `aria-keyshortcuts` for a control, when the player's shortcuts are on. */
export function keyShortcuts(enabled: boolean, keys: string): { 'aria-keyshortcuts'?: string } {
  return enabled ? { 'aria-keyshortcuts': keys } : {};
}
