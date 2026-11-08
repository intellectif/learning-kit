import type { ComponentType } from 'react';
import type { PlayerHostOptions } from './types.js';

/** What `InteractiveActivityPlayer` passes a registered template's player. */
export interface TemplatePlayerProps<TData = unknown> extends PlayerHostOptions {
  activity: TData;
}

// biome-ignore lint/suspicious/noExplicitAny: a registry of players for any activity type.
const players = new Map<string, ComponentType<TemplatePlayerProps<any>>>();

/**
 * Lets `InteractiveActivityPlayer` render a template of your own (registered
 * with `registerTemplate`). Registering the same component again is a no-op; a
 * different component for an id that has one throws. The built-in templates
 * cannot be replaced.
 */
export function registerTemplatePlayer<TData>(
  templateId: string,
  component: ComponentType<TemplatePlayerProps<TData>>,
): void {
  if (templateId === 'what-happens' || templateId === 'cine-scramble') {
    throw new Error(`"${templateId}" is a built-in template; its player cannot be replaced.`);
  }
  const existing = players.get(templateId);
  if (existing !== undefined && existing !== component) {
    throw new Error(`A different player is already registered for template "${templateId}".`);
  }
  players.set(templateId, component);
}

/** The player registered for a template of your own, if any. */
export function getTemplatePlayer(
  templateId: string,
): ComponentType<TemplatePlayerProps<unknown>> | undefined {
  return players.get(templateId);
}
