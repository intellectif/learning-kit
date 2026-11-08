import { type ActivityTypeDescriptor, defineActivityType } from '@intellectif/lk-core';
import {
  defineStandardSchema,
  isIssue,
  readBoolean,
  readNumber,
  readObject,
  readString,
} from '../../contract/standard-schema.js';
import type {
  AssetRef,
  StyleChoice,
  TemplateDefinition,
  TemplateMediaSlot,
  ValidationIssue,
  ValidationResult,
  VideoAspect,
} from '../../contract/types.js';
import {
  FONT_ALLOW_LIST,
  isAllowedFont,
  isMotionPresetId,
  isStylePresetId,
  MOTION_PRESET_IDS,
  STYLE_PRESET_IDS,
} from '../../style/catalog.js';
import { WHAT_HAPPENS_AI_SPEC } from './ai-spec.js';
import { WHAT_HAPPENS_CHROME, whatHappensChrome } from './copy.js';

export const WHAT_HAPPENS_TYPE = 'what-happens';
export const WHAT_HAPPENS_SCHEMA_VERSION = '1.0';
export const WHAT_HAPPENS_CLIP_COUNT_DEFAULT = 8;
export const WHAT_HAPPENS_CLIP_COUNT_MIN = 1;
export const WHAT_HAPPENS_CLIP_COUNT_MAX = 12;

const REVEAL_KEYS = new Set(['easyCaption', 'hardCaption', 'revealPrompt', 'captions']);

export interface WhatHappensCopy {
  playFallback?: string;
  replayToFreeze?: string;
  mediaError?: string;

  predictTitle?: string;
  revealButton?: string;
  tellTitle?: string;
  supportsLabel?: string;
  showAnswer?: string;
  answerLabel?: string;
  nextButton?: string;
  listenButton?: string;
}

export interface WhatHappensClip {
  id: string;
  title: string;
  video: AssetRef & { aspect: VideoAspect; durationS?: number };
  thumb?: AssetRef;
  poster?: AssetRef;
  freezeAt: number;
  predictPrompt?: string;
  tellPrompt?: string;
  supportsEnabled?: boolean;
  supportsLabel?: string;
  supports?: string[];
  answer: { text: string };
  audio?: AssetRef & { voice?: string; textHash: string };
  videoPrompt?: { text: string; generatedBy?: string };
  origin?: 'authored' | 'generated';
}

export interface WhatHappensData {
  schemaVersion: typeof WHAT_HAPPENS_SCHEMA_VERSION;
  type: typeof WHAT_HAPPENS_TYPE;
  id: string;
  title: string;
  locale: string;
  style: StyleChoice;
  supportsEnabled?: boolean;
  copy?: WhatHappensCopy;
  clips: WhatHappensClip[];
}

export interface WhatHappensResponse {
  clipId: string;
}

function issue(path: Array<string | number>, message: string): ValidationIssue {
  return { path, message };
}

function readAssetRef(value: unknown, path: Array<string | number>): AssetRef | ValidationIssue {
  const object = readObject(value, path);
  if (isIssue(object)) {
    return object;
  }
  const assetKey = readString(object.assetKey, [...path, 'assetKey']);
  if (isIssue(assetKey)) {
    return assetKey;
  }
  const ref: AssetRef = { assetKey };
  if (object.url !== undefined) {
    const url = readString(object.url, [...path, 'url']);
    if (isIssue(url)) {
      return url;
    }
    ref.url = url;
  }
  return ref;
}

function readStyle(value: unknown, path: Array<string | number>): StyleChoice | ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const object = readObject(value, path);
  if (isIssue(object)) {
    return [object];
  }
  const presetId = readString(object.presetId, [...path, 'presetId']);
  if (isIssue(presetId)) {
    errors.push(presetId);
  } else if (!isStylePresetId(presetId)) {
    errors.push(issue([...path, 'presetId'], `Unknown style preset "${presetId}".`));
  }
  if (
    object.mode !== undefined &&
    object.mode !== 'light' &&
    object.mode !== 'dark' &&
    object.mode !== 'auto'
  ) {
    errors.push(issue([...path, 'mode'], 'Expected "light", "dark", or "auto".'));
  }
  if (object.motionPresetId !== undefined) {
    const motion = readString(object.motionPresetId, [...path, 'motionPresetId']);
    if (isIssue(motion)) {
      errors.push(motion);
    } else if (!isMotionPresetId(motion)) {
      errors.push(issue([...path, 'motionPresetId'], `Unknown motion preset "${motion}".`));
    }
  }
  if (object.fonts !== undefined) {
    const fonts = readObject(object.fonts, [...path, 'fonts']);
    if (isIssue(fonts)) {
      errors.push(fonts);
    } else {
      for (const key of ['heading', 'body'] as const) {
        if (fonts[key] === undefined) {
          continue;
        }
        const font = readString(fonts[key], [...path, 'fonts', key]);
        if (isIssue(font)) {
          errors.push(font);
        } else if (!isAllowedFont(font)) {
          errors.push(issue([...path, 'fonts', key], `Unknown font "${font}".`));
        }
      }
    }
  }
  if (errors.length > 0) {
    return errors;
  }
  const style: StyleChoice = { presetId: presetId as string };
  if (object.mode === 'light' || object.mode === 'dark' || object.mode === 'auto') {
    style.mode = object.mode;
  }
  if (typeof object.motionPresetId === 'string') {
    style.motionPresetId = object.motionPresetId;
  }
  if (object.fonts !== undefined) {
    style.fonts = object.fonts as NonNullable<StyleChoice['fonts']>;
  }
  return style;
}

function readClip(
  value: unknown,
  path: Array<string | number>,
): WhatHappensClip | ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const object = readObject(value, path);
  if (isIssue(object)) {
    return [object];
  }
  for (const key of Object.keys(object)) {
    if (REVEAL_KEYS.has(key)) {
      errors.push(issue([...path, key], 'Reveal fields are not part of What Happens.'));
    }
  }

  const id = readString(object.id, [...path, 'id']);
  const title = readString(object.title, [...path, 'title']);
  const freezeAt = readNumber(object.freezeAt, [...path, 'freezeAt']);
  const answerObject = readObject(object.answer, [...path, 'answer']);
  const videoObject = readObject(object.video, [...path, 'video']);

  if (isIssue(id)) errors.push(id);
  if (isIssue(title)) errors.push(title);
  if (isIssue(freezeAt)) errors.push(freezeAt);
  if (isIssue(answerObject)) errors.push(answerObject);
  if (isIssue(videoObject)) errors.push(videoObject);

  let answerText: string | undefined;
  if (!isIssue(answerObject)) {
    const text = readString(answerObject.text, [...path, 'answer', 'text'], { allowEmpty: true });
    if (isIssue(text)) errors.push(text);
    else answerText = text;
  }

  let video: (AssetRef & { aspect: VideoAspect; durationS?: number }) | undefined;
  if (!isIssue(videoObject)) {
    const asset = readAssetRef(videoObject, [...path, 'video']);
    if (isIssue(asset)) {
      errors.push(asset);
    } else {
      const aspect = videoObject.aspect;
      if (aspect !== '9:16' && aspect !== '16:9') {
        errors.push(issue([...path, 'video', 'aspect'], 'Expected "9:16" or "16:9".'));
      } else {
        video = { ...asset, aspect };
        if (videoObject.durationS !== undefined) {
          const durationS = readNumber(videoObject.durationS, [...path, 'video', 'durationS']);
          if (isIssue(durationS)) {
            errors.push(durationS);
          } else if (durationS <= 0) {
            errors.push(issue([...path, 'video', 'durationS'], 'Duration must be greater than 0.'));
          } else {
            video.durationS = durationS;
          }
        }
      }
    }
  }

  if (!isIssue(freezeAt)) {
    if (freezeAt <= 0) {
      errors.push(issue([...path, 'freezeAt'], 'freezeAt must be greater than 0.'));
    }
    if (video?.durationS !== undefined && freezeAt >= video.durationS) {
      errors.push(issue([...path, 'freezeAt'], 'freezeAt must be less than the clip duration.'));
    }
  }

  const optionalStrings = ['predictPrompt', 'tellPrompt', 'supportsLabel'] as const;
  const extras: Partial<WhatHappensClip> = {};
  for (const key of optionalStrings) {
    if (object[key] === undefined) continue;
    const text = readString(object[key], [...path, key], { allowEmpty: true });
    if (isIssue(text)) errors.push(text);
    else extras[key] = text;
  }
  if (object.supportsEnabled !== undefined) {
    const enabled = readBoolean(object.supportsEnabled, [...path, 'supportsEnabled']);
    if (isIssue(enabled)) errors.push(enabled);
    else extras.supportsEnabled = enabled;
  }
  if (object.supports !== undefined) {
    if (!Array.isArray(object.supports)) {
      errors.push(issue([...path, 'supports'], 'Expected an array of strings.'));
    } else {
      const supports: string[] = [];
      object.supports.forEach((item, index) => {
        const text = readString(item, [...path, 'supports', index], { allowEmpty: true });
        if (isIssue(text)) errors.push(text);
        else supports.push(text);
      });
      extras.supports = supports;
    }
  }
  if (object.thumb !== undefined) {
    const thumb = readAssetRef(object.thumb, [...path, 'thumb']);
    if (isIssue(thumb)) errors.push(thumb);
    else extras.thumb = thumb;
  }
  if (object.poster !== undefined) {
    const poster = readAssetRef(object.poster, [...path, 'poster']);
    if (isIssue(poster)) errors.push(poster);
    else extras.poster = poster;
  }
  if (object.audio !== undefined) {
    const audioObject = readObject(object.audio, [...path, 'audio']);
    if (isIssue(audioObject)) {
      errors.push(audioObject);
    } else {
      const asset = readAssetRef(audioObject, [...path, 'audio']);
      const textHash = readString(audioObject.textHash, [...path, 'audio', 'textHash']);
      if (isIssue(asset)) errors.push(asset);
      if (isIssue(textHash)) errors.push(textHash);
      if (!isIssue(asset) && !isIssue(textHash)) {
        extras.audio = { ...asset, textHash };
        if (audioObject.voice !== undefined) {
          const voice = readString(audioObject.voice, [...path, 'audio', 'voice'], {
            allowEmpty: true,
          });
          if (isIssue(voice)) errors.push(voice);
          else extras.audio.voice = voice;
        }
      }
    }
  }
  if (object.videoPrompt !== undefined) {
    const prompt = readObject(object.videoPrompt, [...path, 'videoPrompt']);
    if (isIssue(prompt)) {
      errors.push(prompt);
    } else {
      const text = readString(prompt.text, [...path, 'videoPrompt', 'text'], { allowEmpty: true });
      if (isIssue(text)) errors.push(text);
      else {
        extras.videoPrompt = { text };
        if (prompt.generatedBy !== undefined) {
          const generatedBy = readString(
            prompt.generatedBy,
            [...path, 'videoPrompt', 'generatedBy'],
            {
              allowEmpty: true,
            },
          );
          if (isIssue(generatedBy)) errors.push(generatedBy);
          else extras.videoPrompt.generatedBy = generatedBy;
        }
      }
    }
  }
  if (
    object.origin !== undefined &&
    object.origin !== 'authored' &&
    object.origin !== 'generated'
  ) {
    errors.push(issue([...path, 'origin'], 'Expected "authored" or "generated".'));
  } else if (object.origin === 'authored' || object.origin === 'generated') {
    extras.origin = object.origin;
  }

  if (
    errors.length > 0 ||
    isIssue(id) ||
    isIssue(title) ||
    video === undefined ||
    answerText === undefined ||
    isIssue(freezeAt)
  ) {
    return errors.length > 0 ? errors : [issue(path, 'Clip is incomplete.')];
  }

  return {
    id,
    title,
    video,
    freezeAt,
    answer: { text: answerText },
    ...extras,
  };
}

function validateWhatHappens(value: unknown): ValidationResult<WhatHappensData> {
  const errors: ValidationIssue[] = [];
  const object = readObject(value);
  if (isIssue(object)) {
    return { success: false, errors: [object] };
  }

  if (object.schemaVersion !== WHAT_HAPPENS_SCHEMA_VERSION) {
    errors.push(
      issue(['schemaVersion'], `Unknown schema version "${String(object.schemaVersion)}".`),
    );
  }
  if (object.type !== WHAT_HAPPENS_TYPE) {
    errors.push(issue(['type'], `Unknown template "${String(object.type)}".`));
  }

  const id = readString(object.id, ['id']);
  const title = readString(object.title, ['title']);
  const locale = readString(object.locale, ['locale']);
  if (isIssue(id)) errors.push(id);
  if (isIssue(title)) errors.push(title);
  if (isIssue(locale)) errors.push(locale);

  const style =
    object.style === undefined
      ? [issue(['style'], 'Expected a style choice.')]
      : readStyle(object.style, ['style']);
  let styleValue: StyleChoice | undefined;
  if (Array.isArray(style)) errors.push(...style);
  else styleValue = style;

  let supportsEnabled: boolean | undefined;
  if (object.supportsEnabled !== undefined) {
    const enabled = readBoolean(object.supportsEnabled, ['supportsEnabled']);
    if (isIssue(enabled)) errors.push(enabled);
    else supportsEnabled = enabled;
  }

  let copy: WhatHappensCopy | undefined;
  if (object.copy !== undefined) {
    const copyObject = readObject(object.copy, ['copy']);
    if (isIssue(copyObject)) {
      errors.push(copyObject);
    } else {
      copy = {};
      for (const key of Object.keys(WHAT_HAPPENS_CHROME.en) as Array<keyof WhatHappensCopy>) {
        if (copyObject[key] === undefined) continue;
        const text = readString(copyObject[key], ['copy', key], { allowEmpty: true });
        if (isIssue(text)) errors.push(text);
        else copy[key] = text;
      }
    }
  }

  if (!Array.isArray(object.clips)) {
    errors.push(issue(['clips'], 'Expected an array of clips.'));
    return { success: false, errors };
  }
  if (
    object.clips.length < WHAT_HAPPENS_CLIP_COUNT_MIN ||
    object.clips.length > WHAT_HAPPENS_CLIP_COUNT_MAX
  ) {
    errors.push(
      issue(
        ['clips'],
        `Expected between ${WHAT_HAPPENS_CLIP_COUNT_MIN} and ${WHAT_HAPPENS_CLIP_COUNT_MAX} clips.`,
      ),
    );
  }

  const clips: WhatHappensClip[] = [];
  const seen = new Set<string>();
  object.clips.forEach((raw, index) => {
    const clip = readClip(raw, ['clips', index]);
    if (Array.isArray(clip)) {
      errors.push(...clip);
      return;
    }
    if (seen.has(clip.id)) {
      errors.push(issue(['clips', index, 'id'], `Duplicate clip id "${clip.id}".`));
    }
    seen.add(clip.id);
    clips.push(clip);
  });

  if (
    errors.length > 0 ||
    isIssue(id) ||
    isIssue(title) ||
    isIssue(locale) ||
    styleValue === undefined
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      schemaVersion: WHAT_HAPPENS_SCHEMA_VERSION,
      type: WHAT_HAPPENS_TYPE,
      id,
      title,
      locale,
      style: styleValue,
      ...(supportsEnabled !== undefined ? { supportsEnabled } : {}),
      ...(copy !== undefined ? { copy } : {}),
      clips,
    },
  };
}

export const whatHappensSchema = defineStandardSchema<WhatHappensData>((value) => {
  const result = validateWhatHappens(value);
  return result.success ? { value: result.data } : { issues: result.errors };
});

export const WHAT_HAPPENS_JSON_SCHEMA: Record<string, unknown> = {
  $id: 'https://intellectif.com/schemas/what-happens/1.0.json',
  title: 'What Happens activity',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'type', 'id', 'title', 'locale', 'style', 'clips'],
  properties: {
    schemaVersion: { const: WHAT_HAPPENS_SCHEMA_VERSION },
    type: { const: WHAT_HAPPENS_TYPE },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    locale: { type: 'string', minLength: 1 },
    supportsEnabled: { type: 'boolean', default: true },
    style: {
      type: 'object',
      required: ['presetId'],
      properties: {
        presetId: { type: 'string', enum: [...STYLE_PRESET_IDS] },
        mode: { type: 'string', enum: ['light', 'dark', 'auto'] },
        motionPresetId: { type: 'string', enum: [...MOTION_PRESET_IDS] },
        fonts: {
          type: 'object',
          properties: {
            heading: { type: 'string', enum: [...FONT_ALLOW_LIST] },
            body: { type: 'string', enum: [...FONT_ALLOW_LIST] },
          },
        },
      },
    },
    copy: { type: 'object', additionalProperties: { type: 'string' } },
    clips: {
      type: 'array',
      minItems: WHAT_HAPPENS_CLIP_COUNT_MIN,
      maxItems: WHAT_HAPPENS_CLIP_COUNT_MAX,
      items: { $ref: '#/$defs/clip' },
    },
  },
  $defs: {
    clip: {
      type: 'object',
      required: ['id', 'title', 'video', 'freezeAt', 'answer'],
      properties: {
        id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        video: {
          type: 'object',
          required: ['assetKey', 'aspect'],
          properties: {
            assetKey: { type: 'string', minLength: 1 },
            url: { type: 'string' },
            aspect: { type: 'string', enum: ['9:16', '16:9'] },
            durationS: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        freezeAt: { type: 'number', exclusiveMinimum: 0 },
        predictPrompt: { type: 'string' },
        tellPrompt: { type: 'string' },
        supportsEnabled: { type: 'boolean' },
        supportsLabel: { type: 'string' },
        supports: { type: 'array', items: { type: 'string' } },
        answer: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        },
      },
    },
  },
};

export const whatHappensType: ActivityTypeDescriptor<WhatHappensData, WhatHappensResponse> =
  defineActivityType<WhatHappensData, WhatHappensResponse>({
    type: WHAT_HAPPENS_TYPE,
    schema: whatHappensSchema,
    jsonSchema: WHAT_HAPPENS_JSON_SCHEMA,
    scoring: { kind: 'deferred', reason: 'requires_async_grading' },
    fieldPolicy: {
      schemaVersion: 'public',
      type: 'public',
      id: 'public',
      title: 'public',
      locale: 'public',
      style: 'public',
      supportsEnabled: 'public',
      copy: 'public',
      clips: {
        id: 'public',
        title: 'public',
        video: 'public',
        thumb: 'public',
        poster: 'public',
        freezeAt: 'public',
        predictPrompt: 'public',
        tellPrompt: 'public',
        supportsEnabled: 'public',
        supportsLabel: 'public',
        supports: 'public',
        answer: 'answer-key',
        audio: 'public',
        videoPrompt: 'author-only',
        origin: 'author-only',
      },
    },
    mediaSlots: (data) =>
      data.clips.flatMap((clip, index) => {
        const slots: Array<{ path: Array<string | number>; kind: 'video' | 'image' | 'audio' }> = [
          { path: ['clips', index, 'video'], kind: 'video' },
        ];
        if (clip.thumb) slots.push({ path: ['clips', index, 'thumb'], kind: 'image' });
        if (clip.poster) slots.push({ path: ['clips', index, 'poster'], kind: 'image' });
        if (clip.audio) slots.push({ path: ['clips', index, 'audio'], kind: 'audio' });
        return slots;
      }),
  });

export function createWhatHappensDraft(id = 'untitled'): WhatHappensData {
  return {
    schemaVersion: WHAT_HAPPENS_SCHEMA_VERSION,
    type: WHAT_HAPPENS_TYPE,
    id,
    title: 'Untitled activity',
    locale: 'en',
    style: { presetId: 'default' },
    supportsEnabled: true,
    clips: Array.from({ length: WHAT_HAPPENS_CLIP_COUNT_DEFAULT }, (_, index) => ({
      id: `clip-${index + 1}`,
      title: `Clip ${index + 1}`,
      video: { assetKey: `clip-${index + 1}`, aspect: '9:16' },
      freezeAt: 1,
      answer: { text: 'Sample answer' },
    })),
  };
}

export function isSupportsEnabled(activity: WhatHappensData, clip?: WhatHappensClip): boolean {
  if (clip?.supportsEnabled !== undefined) {
    return clip.supportsEnabled;
  }
  return activity.supportsEnabled !== false;
}

export function validateWhatHappensData(data: unknown): ValidationResult<WhatHappensData> {
  return validateWhatHappens(data);
}

function templateMediaSlots(data: WhatHappensData): TemplateMediaSlot[] {
  const slots: TemplateMediaSlot[] = [];
  data.clips.forEach((clip, index) => {
    slots.push({ path: ['clips', index, 'video'], kind: 'video', assetKey: clip.video.assetKey });
    if (clip.thumb)
      slots.push({ path: ['clips', index, 'thumb'], kind: 'image', assetKey: clip.thumb.assetKey });
    if (clip.poster)
      slots.push({
        path: ['clips', index, 'poster'],
        kind: 'image',
        assetKey: clip.poster.assetKey,
      });
    if (clip.audio)
      slots.push({ path: ['clips', index, 'audio'], kind: 'audio', assetKey: clip.audio.assetKey });
  });
  return slots;
}

export const whatHappensTemplate: TemplateDefinition<WhatHappensData> = {
  id: WHAT_HAPPENS_TYPE,
  version: WHAT_HAPPENS_SCHEMA_VERSION,
  label: 'What Happens',
  activityType: WHAT_HAPPENS_TYPE,
  validate: validateWhatHappensData,
  jsonSchema: WHAT_HAPPENS_JSON_SCHEMA,
  aiSpec: WHAT_HAPPENS_AI_SPEC,
  mediaSlots: templateMediaSlots,
};

export { whatHappensChrome };
