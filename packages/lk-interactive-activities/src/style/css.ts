import type { StyleChoice } from '../contract/types.js';
import { resolveMotionTokens } from './animations.js';
import { fontStack, resolveFontPair } from './fonts.js';
import { resolveStylePreset, type StyleTokens } from './tokens.js';

const TOKEN_TO_VAR: Array<readonly [keyof StyleTokens, string]> = [
  ['bg', '--lkia-bg'],
  ['panel', '--lkia-panel'],
  ['line', '--lkia-line'],
  ['ink1', '--lkia-ink-1'],
  ['ink2', '--lkia-ink-2'],
  ['ink3', '--lkia-ink-3'],
  ['accent', '--lkia-accent'],
  ['accentSoft', '--lkia-accent-soft'],
  ['frost', '--lkia-frost'],
  ['veil', '--lkia-veil'],
  ['radiusPanel', '--lkia-radius-panel'],
  ['radiusVideo', '--lkia-radius-video'],
  ['radiusButton', '--lkia-radius-button'],
  ['shadowSm', '--lkia-shadow-sm'],
  ['shadowMd', '--lkia-shadow-md'],
  ['shadowLg', '--lkia-shadow-lg'],
  ['glassBlur', '--lkia-glass-blur'],
  ['backdropBlur', '--lkia-backdrop-blur'],
];

export function cssVariablesForTokens(tokens: StyleTokens): string {
  return TOKEN_TO_VAR.map(([key, name]) => `${name}: ${tokens[key]};`).join('\n');
}

function indentedVariables(tokens: StyleTokens, indent: string): string {
  return TOKEN_TO_VAR.map(([key, name]) => `${indent}${name}: ${tokens[key]};`).join('\n');
}

function sharedVariables(style: StyleChoice): string {
  const motion = resolveMotionTokens(style.motionPresetId);
  const fonts = resolveFontPair(style);
  return [
    `  --lkia-font-heading: ${fontStack(fonts.heading)};`,
    `  --lkia-font-body: ${fontStack(fonts.body)};`,
    `  --lkia-duration-fast: ${motion.durationFast};`,
    `  --lkia-duration: ${motion.duration};`,
    `  --lkia-duration-slow: ${motion.durationSlow};`,
    `  --lkia-easing: ${motion.easing};`,
    `  --lkia-stagger: ${motion.stagger};`,
  ].join('\n');
}

const BASE_RULES = `
[data-lkia-root] {
  background: var(--lkia-bg);
  color: var(--lkia-ink-1);
  font-family: var(--lkia-font-body);
}

[data-lkia-root] h1,
[data-lkia-root] h2,
[data-lkia-root] h3 {
  font-family: var(--lkia-font-heading);
}

[data-lkia-panel] {
  background: var(--lkia-panel);
  color: var(--lkia-ink-1);
  border: 1px solid var(--lkia-line);
  border-radius: var(--lkia-radius-panel);
  box-shadow: var(--lkia-shadow-md);
  backdrop-filter: blur(var(--lkia-glass-blur));
  -webkit-backdrop-filter: blur(var(--lkia-glass-blur));
}

[data-lkia-backdrop] {
  filter: blur(var(--lkia-backdrop-blur)) saturate(1.25);
}

[data-lkia-veil] {
  background: var(--lkia-veil);
}

[data-lkia-root] [data-animate="card-stagger"] {
  animation: lkia-card-stagger var(--lkia-duration-slow) var(--lkia-easing) both;
  animation-delay: calc(var(--i, 0) * var(--lkia-stagger));
}

[data-lkia-root] [data-animate="video-glide"] {
  animation: lkia-video-glide var(--lkia-duration) var(--lkia-easing) both;
}

[data-lkia-root] [data-animate="panel-fade"] {
  animation: lkia-panel-fade var(--lkia-duration) var(--lkia-easing) both;
}

[data-lkia-root] [data-animate="answer-fade-up"] {
  animation: lkia-answer-fade-up var(--lkia-duration-slow) var(--lkia-easing) both;
}

[data-lkia-root] [data-animate="button-press"] {
  transition:
    transform var(--lkia-duration-fast) var(--lkia-easing),
    box-shadow var(--lkia-duration-fast) var(--lkia-easing);
}

[data-lkia-root] [data-animate="button-press"]:hover {
  transform: translateY(-1px);
  box-shadow: var(--lkia-shadow-sm);
}

[data-lkia-root] [data-animate="button-press"]:active {
  transform: translateY(1px) scale(0.98);
}

@keyframes lkia-card-stagger {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}

@keyframes lkia-video-glide {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

@keyframes lkia-panel-fade {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

@keyframes lkia-answer-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes lkia-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  [data-lkia-root] {
    --lkia-duration-fast: 0.01ms;
    --lkia-duration: 0.01ms;
    --lkia-duration-slow: 0.01ms;
    --lkia-stagger: 0ms;
  }

  [data-lkia-root] [data-animate] {
    animation-name: lkia-fade;
    animation-duration: 0.01ms;
    transition-duration: 0.01ms;
    transform: none;
  }
}
`.trim();

export function interactiveActivitiesStylesheet(
  style: StyleChoice = { presetId: 'default' },
): string {
  const preset = resolveStylePreset(style.presetId);
  const shared = sharedVariables(style);
  const light = indentedVariables(preset.tokens.light, '  ');
  const dark = indentedVariables(preset.tokens.dark, '  ');
  const autoDark = indentedVariables(preset.tokens.dark, '    ');

  return [
    '[data-lkia-root] {',
    shared,
    light,
    '}',
    '',
    '[data-lkia-root][data-lkia-mode="light"] {',
    light,
    '}',
    '',
    '[data-lkia-root][data-lkia-mode="dark"] {',
    dark,
    '}',
    '',
    '[data-lkia-root][data-lkia-mode="auto"] {',
    light,
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  [data-lkia-root][data-lkia-mode="auto"] {',
    autoDark,
    '  }',
    '}',
    '',
    BASE_RULES,
    '',
  ].join('\n');
}
