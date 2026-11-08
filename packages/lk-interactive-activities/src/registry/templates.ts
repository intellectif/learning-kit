import { registerActivityType } from '@intellectif/lk-core';
import type { TemplateDefinition, ValidationResult } from '../contract/types.js';
import { cineScrambleTemplate, cineScrambleType } from '../templates/cine-scramble/schema.js';
import type { CineScrambleData } from '../templates/cine-scramble/types.js';
import { whatHappensTemplate, whatHappensType } from '../templates/what-happens/schema.js';
import type { WhatHappensData } from '../templates/what-happens/types.js';

/** An activity of one of the built-in templates. */
export type InteractiveActivity = WhatHappensData | CineScrambleData;

const templates = new Map<string, TemplateDefinition>();
let activityTypesRegistered = false;

function ensureActivityTypes(): void {
  if (activityTypesRegistered) {
    return;
  }
  registerActivityType(whatHappensType);
  registerActivityType(cineScrambleType);
  activityTypesRegistered = true;
}

function ensureBuiltins(): void {
  ensureActivityTypes();
  if (!templates.has(whatHappensTemplate.id)) {
    templates.set(whatHappensTemplate.id, whatHappensTemplate as TemplateDefinition);
  }
  if (!templates.has(cineScrambleTemplate.id)) {
    templates.set(cineScrambleTemplate.id, cineScrambleTemplate as TemplateDefinition);
  }
}

/**
 * Registers the built-in templates, and their activity types with lk-core, so
 * lk-core's `validateActivity`, `redact`, `validateDraft` and `createDraft`
 * know them. Every registry function here does it first; call it yourself
 * before using lk-core directly. Safe to call any number of times.
 */
export function registerInteractiveActivities(): void {
  ensureBuiltins();
}

/**
 * Adds a template. Registering the same definition again is a no-op; a
 * different definition under an existing id throws. To render it, register its
 * player too (`registerTemplatePlayer` from the `/player` entry).
 */
export function registerTemplate(definition: TemplateDefinition): void {
  ensureBuiltins();
  const existing = templates.get(definition.id);
  if (existing !== undefined && existing !== definition) {
    throw new Error(
      `Template "${definition.id}" is already registered. Registering a different definition for an existing template is not allowed.`,
    );
  }
  templates.set(definition.id, definition);
}

export function getTemplate(id: string): TemplateDefinition | undefined {
  ensureBuiltins();
  return templates.get(id);
}

export function listTemplates(): TemplateDefinition[] {
  ensureBuiltins();
  return [...templates.values()];
}

/**
 * Validates stored activity JSON of any registered template: the template is
 * read from `type`, and an unknown template or schema version is reported as
 * an error at that field rather than thrown. The result is typed as a built-in
 * activity; for a template of your own, pass its data type.
 */
export function validateInteractiveActivity<T = InteractiveActivity>(
  data: unknown,
): ValidationResult<T> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      success: false,
      errors: [{ path: [], code: 'expected_object', message: 'Expected an object.' }],
    };
  }
  const { type } = data as { type?: unknown };
  const template = typeof type === 'string' ? getTemplate(type) : undefined;
  if (template === undefined) {
    const known = listTemplates()
      .map((item) => `"${item.id}"`)
      .join(', ');
    return {
      success: false,
      errors: [
        {
          path: ['type'],
          code: 'unknown_template',
          message: `Unknown template "${String(type)}". Known: ${known}.`,
        },
      ],
    };
  }
  return template.validate(data) as ValidationResult<T>;
}
