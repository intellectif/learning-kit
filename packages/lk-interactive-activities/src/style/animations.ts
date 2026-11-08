import {
  ANIMATION_IDS,
  type AnimationId,
  isMotionPresetId,
  type MotionPresetId,
} from './catalog.js';

export interface MotionTokens {
  durationFast: string;
  duration: string;
  durationSlow: string;
  easing: string;
  stagger: string;
}

export interface MotionPreset {
  id: MotionPresetId;
  label: string;
  description: string;
  tokens: MotionTokens;
}

export interface AnimationPreset {
  id: AnimationId;
  label: string;
  description: string;
}

export const MOTION_PRESETS: readonly MotionPreset[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced motion for everyday classroom playback.',
    tokens: {
      durationFast: '160ms',
      duration: '280ms',
      durationSlow: '480ms',
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      stagger: '70ms',
    },
  },
  {
    id: 'lively',
    label: 'Lively',
    description: 'Quicker, more energetic transitions.',
    tokens: {
      durationFast: '120ms',
      duration: '200ms',
      durationSlow: '340ms',
      easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
      stagger: '50ms',
    },
  },
  {
    id: 'gentle',
    label: 'Gentle',
    description: 'Slower, quieter motion that stays out of the way.',
    tokens: {
      durationFast: '220ms',
      duration: '420ms',
      durationSlow: '700ms',
      easing: 'cubic-bezier(0.33, 0.1, 0.2, 1)',
      stagger: '90ms',
    },
  },
];

export const ANIMATION_CATALOG: readonly AnimationPreset[] = [
  {
    id: 'card-stagger',
    label: 'Card stagger',
    description: 'Cards enter in sequence. Set --i on each card for the delay.',
  },
  {
    id: 'video-glide',
    label: 'Video glide',
    description: 'The clip eases into place with a short transform.',
  },
  {
    id: 'panel-fade',
    label: 'Panel fade',
    description: 'Frosted panels fade and slide into view.',
  },
  {
    id: 'answer-fade-up',
    label: 'Answer fade up',
    description: 'The sample answer fades upward when it is revealed.',
  },
  {
    id: 'button-press',
    label: 'Button press',
    description: 'Buttons lift on hover and compress slightly when pressed.',
  },
];

const motionById = new Map(MOTION_PRESETS.map((preset) => [preset.id, preset]));
const animationById = new Map(ANIMATION_CATALOG.map((preset) => [preset.id, preset]));

export function getMotionPreset(id: string): MotionPreset | undefined {
  return motionById.get(id as MotionPresetId);
}

export function listMotionPresets(): MotionPreset[] {
  return [...MOTION_PRESETS];
}

export function getAnimation(id: string): AnimationPreset | undefined {
  return animationById.get(id as AnimationId);
}

export function listAnimations(): AnimationPreset[] {
  return [...ANIMATION_CATALOG];
}

export function resolveMotionTokens(motionPresetId?: string): MotionTokens {
  if (motionPresetId !== undefined && isMotionPresetId(motionPresetId)) {
    const preset = getMotionPreset(motionPresetId);
    if (preset) {
      return preset.tokens;
    }
  }
  const fallback = getMotionPreset('default');
  if (!fallback) {
    throw new Error('Default motion preset is missing.');
  }
  return fallback.tokens;
}

export { ANIMATION_IDS };
