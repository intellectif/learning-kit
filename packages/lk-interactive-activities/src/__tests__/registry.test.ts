import { describe, expect, it } from 'vitest';
import { getTemplate, listTemplates, registerTemplate } from '../registry/templates.js';
import { CINE_SCRAMBLE_CHROME } from '../templates/cine-scramble/copy.js';
import { DEFAULT_CHROME_LOCALE, WHAT_HAPPENS_CHROME } from '../templates/what-happens/copy.js';

describe('template registry', () => {
  it('lists What Happens and Cine-Scramble', () => {
    const ids = listTemplates().map((template) => template.id);
    expect(ids).toEqual(['what-happens', 'cine-scramble']);
    expect(getTemplate('what-happens')?.version).toBe('1.0');
    expect(getTemplate('cine-scramble')?.label).toBe('Cine-Scramble');
    expect(getTemplate('unknown')).toBeUndefined();
  });

  it('refuses to replace a registered template with a different definition', () => {
    const existing = getTemplate('what-happens');
    expect(existing).toBeDefined();
    if (!existing) {
      return;
    }
    expect(() =>
      registerTemplate({
        ...existing,
        label: 'Different',
      }),
    ).toThrow(/already registered/);
  });

  it('ships English as the default chrome and Spanish alongside it', () => {
    expect(DEFAULT_CHROME_LOCALE).toBe('en');
    expect(WHAT_HAPPENS_CHROME.en.supportsLabel).toBe('To help you');
    expect(WHAT_HAPPENS_CHROME.es.supportsLabel).toBe('Para ayudarte');
    expect(CINE_SCRAMBLE_CHROME.en.checkLabel).toBe('Check');
    expect(CINE_SCRAMBLE_CHROME.es.checkLabel).toBe('Comprobar');
  });
});
