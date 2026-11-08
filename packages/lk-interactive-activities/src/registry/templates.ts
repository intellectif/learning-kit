import { registerActivityType } from '@intellectif/lk-core';
import type { TemplateDefinition } from '../contract/types.js';
import { cineScrambleTemplate, cineScrambleType } from '../templates/cine-scramble/schema.js';
import { whatHappensTemplate, whatHappensType } from '../templates/what-happens/schema.js';

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

export function registerInteractiveActivities(): void {
  ensureBuiltins();
}

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
