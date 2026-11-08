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
import { CINE_SCRAMBLE_AI_SPEC } from './ai-spec.js';
import { CINE_SCRAMBLE_CHROME } from './copy.js';

export const CINE_SCRAMBLE_TYPE = 'cine-scramble';
export const CINE_SCRAMBLE_SCHEMA_VERSION = '1.0';
export const CINE_SCRAMBLE_SCENE_COUNT_DEFAULT = 1;
export const CINE_SCRAMBLE_SCENE_COUNT_MIN = 1;
export const CINE_SCRAMBLE_SCENE_COUNT_MAX = 8;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT = 4;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN = 3;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX = 6;

const REVEAL_KEYS = new Set([
  'easyCaption',
  'hardCaption',
  'revealPrompt',
  'captions',
  'easy',
  'hard',
]);

export interface CineScrambleVocabItem {
  term: string;
  definition: string;
}

export interface CineScrambleClip {
  id: number;
  video: AssetRef & { aspect: VideoAspect; durationS?: number };
  caption: string;
  videoPrompt?: { text: string; generatedBy?: string };
}

export interface CineScrambleScene {
  id: string;
  title: string;
  clips: CineScrambleClip[];
}

export interface CineScrambleCopy {
  startLabel?: string;
  closeLabel?: string;
  playFallback?: string;
  mediaError?: string;
  sceneLabel?: string;
  scenesLabel?: string;
  clipLabel?: string;
  slotLabel?: string;
  emptySlotLabel?: string;
  poolLabel?: string;
  removeLabel?: string;
  correctLabel?: string;
  incorrectLabel?: string;
  completeLabel?: string;
  storyLabel?: string;
  replayLabel?: string;
  nextSceneLabel?: string;
  doneLabel?: string;
  keyboardHelp?: string;
  selectedLabel?: string;
  placedLabel?: string;
  returnedLabel?: string;
  fillAllLabel?: string;
  resultSummary?: string;

  checkLabel?: string;
  vocabButtonLabel?: string;
}

export interface CineScrambleData {
  schemaVersion: typeof CINE_SCRAMBLE_SCHEMA_VERSION;
  type: typeof CINE_SCRAMBLE_TYPE;
  id: string;
  title: string;
  locale?: string;
  tagline?: string;
  poster?: AssetRef;
  style?: StyleChoice;
  vocabEnabled?: boolean;
  vocab?: CineScrambleVocabItem[];
  scenes: CineScrambleScene[];
  copy?: CineScrambleCopy;
}

export interface CineScrambleResponse {
  sceneId: string;
  order: number[];
}

function issue(path: Array<string | number>, message: string): ValidationIssue {
  return { path, message };
}

function readAssetRef(value: unknown, path: Array<string | number>): AssetRef | ValidationIssue {
  const object = readObject(value, path);
  if (isIssue(object)) return object;
  const assetKey = readString(object.assetKey, [...path, 'assetKey']);
  if (isIssue(assetKey)) return assetKey;
  const ref: AssetRef = { assetKey };
  if (object.url !== undefined) {
    const url = readString(object.url, [...path, 'url']);
    if (isIssue(url)) return url;
    ref.url = url;
  }
  return ref;
}

function readStyle(value: unknown, path: Array<string | number>): StyleChoice | ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const object = readObject(value, path);
  if (isIssue(object)) return [object];
  const presetId = readString(object.presetId, [...path, 'presetId']);
  if (isIssue(presetId)) errors.push(presetId);
  else if (!isStylePresetId(presetId))
    errors.push(issue([...path, 'presetId'], `Unknown style preset "${presetId}".`));
  if (object.motionPresetId !== undefined) {
    const motion = readString(object.motionPresetId, [...path, 'motionPresetId']);
    if (isIssue(motion)) errors.push(motion);
    else if (!isMotionPresetId(motion))
      errors.push(issue([...path, 'motionPresetId'], `Unknown motion preset "${motion}".`));
  }
  if (object.fonts !== undefined) {
    const fonts = readObject(object.fonts, [...path, 'fonts']);
    if (isIssue(fonts)) errors.push(fonts);
    else {
      for (const key of ['heading', 'body'] as const) {
        if (fonts[key] === undefined) continue;
        const font = readString(fonts[key], [...path, 'fonts', key]);
        if (isIssue(font)) errors.push(font);
        else if (!isAllowedFont(font))
          errors.push(issue([...path, 'fonts', key], `Unknown font "${font}".`));
      }
    }
  }
  if (
    object.mode !== undefined &&
    object.mode !== 'light' &&
    object.mode !== 'dark' &&
    object.mode !== 'auto'
  ) {
    errors.push(issue([...path, 'mode'], 'Expected "light", "dark", or "auto".'));
  }
  if (errors.length > 0) return errors;
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
): CineScrambleClip | ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const object = readObject(value, path);
  if (isIssue(object)) return [object];
  for (const key of Object.keys(object)) {
    if (REVEAL_KEYS.has(key)) {
      errors.push(
        issue([...path, key], 'Reveal and Easy/Hard fields are not part of Cine-Scramble.'),
      );
    }
  }
  const id = readNumber(object.id, [...path, 'id']);
  if (isIssue(id)) errors.push(id);
  else if (!Number.isInteger(id) || id < 0) {
    errors.push(
      issue([...path, 'id'], 'Clip id must be a chronological integer index starting at 0.'),
    );
  }
  const caption = readString(object.caption, [...path, 'caption']);
  if (isIssue(caption)) errors.push(caption);

  const videoObject = readObject(object.video, [...path, 'video']);
  let video: (AssetRef & { aspect: VideoAspect; durationS?: number }) | undefined;
  if (isIssue(videoObject)) {
    errors.push(videoObject);
  } else {
    const asset = readAssetRef(videoObject, [...path, 'video']);
    if (isIssue(asset)) errors.push(asset);
    else if (videoObject.aspect !== '9:16' && videoObject.aspect !== '16:9') {
      errors.push(issue([...path, 'video', 'aspect'], 'Expected "9:16" or "16:9".'));
    } else {
      video = { ...asset, aspect: videoObject.aspect };
      if (videoObject.durationS !== undefined) {
        const durationS = readNumber(videoObject.durationS, [...path, 'video', 'durationS']);
        if (isIssue(durationS)) errors.push(durationS);
        else if (durationS <= 0)
          errors.push(issue([...path, 'video', 'durationS'], 'Duration must be greater than 0.'));
        else video.durationS = durationS;
      }
    }
  }

  const extras: Partial<CineScrambleClip> = {};
  if (object.videoPrompt !== undefined) {
    const prompt = readObject(object.videoPrompt, [...path, 'videoPrompt']);
    if (isIssue(prompt)) errors.push(prompt);
    else {
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

  if (errors.length > 0 || isIssue(id) || isIssue(caption) || video === undefined) {
    return errors.length > 0 ? errors : [issue(path, 'Clip is incomplete.')];
  }
  return { id, video, caption, ...extras };
}

function readScene(
  value: unknown,
  path: Array<string | number>,
): CineScrambleScene | ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const object = readObject(value, path);
  if (isIssue(object)) return [object];
  const id = readString(object.id, [...path, 'id']);
  const title = readString(object.title, [...path, 'title']);
  if (isIssue(id)) errors.push(id);
  if (isIssue(title)) errors.push(title);
  if (!Array.isArray(object.clips)) {
    errors.push(issue([...path, 'clips'], 'Expected an array of clips.'));
    return errors;
  }
  if (
    object.clips.length < CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN ||
    object.clips.length > CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX
  ) {
    errors.push(
      issue(
        [...path, 'clips'],
        `Expected between ${CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN} and ${CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX} clips in a scene.`,
      ),
    );
  }
  const clips: CineScrambleClip[] = [];
  const seen = new Set<number>();
  object.clips.forEach((raw, index) => {
    const clip = readClip(raw, [...path, 'clips', index]);
    if (Array.isArray(clip)) {
      errors.push(...clip);
      return;
    }
    if (seen.has(clip.id)) {
      errors.push(issue([...path, 'clips', index, 'id'], `Duplicate clip id ${clip.id}.`));
    }
    seen.add(clip.id);
    clips.push(clip);
  });
  if (errors.length === 0) {
    const expected = clips.map((_, index) => index);
    const actual = [...clips.map((clip) => clip.id)].sort((a, b) => a - b);
    if (expected.join(',') !== actual.join(',')) {
      errors.push(issue([...path, 'clips'], 'Clip ids must be the chronological indexes 0..n-1.'));
    }
  }
  if (errors.length > 0 || isIssue(id) || isIssue(title)) return errors;
  return { id, title, clips };
}

function validateCineScramble(value: unknown): ValidationResult<CineScrambleData> {
  const errors: ValidationIssue[] = [];
  const object = readObject(value);
  if (isIssue(object)) return { success: false, errors: [object] };

  if (object.schemaVersion !== CINE_SCRAMBLE_SCHEMA_VERSION) {
    errors.push(
      issue(['schemaVersion'], `Unknown schema version "${String(object.schemaVersion)}".`),
    );
  }
  if (object.type !== CINE_SCRAMBLE_TYPE) {
    errors.push(issue(['type'], `Unknown template "${String(object.type)}".`));
  }

  const id = readString(object.id, ['id']);
  const title = readString(object.title, ['title']);
  if (isIssue(id)) errors.push(id);
  if (isIssue(title)) errors.push(title);

  let locale: string | undefined;
  if (object.locale !== undefined) {
    const value = readString(object.locale, ['locale']);
    if (isIssue(value)) errors.push(value);
    else locale = value;
  }
  let tagline: string | undefined;
  if (object.tagline !== undefined) {
    const value = readString(object.tagline, ['tagline']);
    if (isIssue(value)) errors.push(value);
    else tagline = value;
  }
  let poster: AssetRef | undefined;
  if (object.poster !== undefined) {
    const value = readAssetRef(object.poster, ['poster']);
    if (isIssue(value)) errors.push(value);
    else poster = value;
  }
  let style: StyleChoice | undefined;
  if (object.style !== undefined) {
    const value = readStyle(object.style, ['style']);
    if (Array.isArray(value)) errors.push(...value);
    else style = value;
  }
  let vocabEnabled: boolean | undefined;
  if (object.vocabEnabled !== undefined) {
    const value = readBoolean(object.vocabEnabled, ['vocabEnabled']);
    if (isIssue(value)) errors.push(value);
    else vocabEnabled = value;
  }
  let vocab: CineScrambleVocabItem[] | undefined;
  if (object.vocab !== undefined) {
    if (!Array.isArray(object.vocab)) {
      errors.push(issue(['vocab'], 'Expected an array of vocabulary items.'));
    } else {
      vocab = [];
      const terms = new Set<string>();
      object.vocab.forEach((raw, index) => {
        const item = readObject(raw, ['vocab', index]);
        if (isIssue(item)) {
          errors.push(item);
          return;
        }
        const term = readString(item.term, ['vocab', index, 'term']);
        const definition = readString(item.definition, ['vocab', index, 'definition']);
        if (isIssue(term)) errors.push(term);
        if (isIssue(definition)) errors.push(definition);
        if (!isIssue(term)) {
          const key = term.trim().toLowerCase();
          if (terms.has(key))
            errors.push(issue(['vocab', index, 'term'], `Duplicate vocabulary term "${term}".`));
          terms.add(key);
        }
        if (!isIssue(term) && !isIssue(definition)) vocab?.push({ term, definition });
      });
    }
  }
  let copy: CineScrambleCopy | undefined;
  if (object.copy !== undefined) {
    const copyObject = readObject(object.copy, ['copy']);
    if (isIssue(copyObject)) errors.push(copyObject);
    else {
      copy = {};
      for (const key of Object.keys(CINE_SCRAMBLE_CHROME.en) as Array<keyof CineScrambleCopy>) {
        if (copyObject[key] === undefined) continue;
        const text = readString(copyObject[key], ['copy', key]);
        if (isIssue(text)) errors.push(text);
        else copy[key] = text;
      }
    }
  }

  if (!Array.isArray(object.scenes)) {
    errors.push(issue(['scenes'], 'Expected an array of scenes.'));
    return { success: false, errors };
  }
  if (
    object.scenes.length < CINE_SCRAMBLE_SCENE_COUNT_MIN ||
    object.scenes.length > CINE_SCRAMBLE_SCENE_COUNT_MAX
  ) {
    errors.push(
      issue(
        ['scenes'],
        `Expected between ${CINE_SCRAMBLE_SCENE_COUNT_MIN} and ${CINE_SCRAMBLE_SCENE_COUNT_MAX} scenes.`,
      ),
    );
  }
  const scenes: CineScrambleScene[] = [];
  const seen = new Set<string>();
  object.scenes.forEach((raw, index) => {
    const scene = readScene(raw, ['scenes', index]);
    if (Array.isArray(scene)) {
      errors.push(...scene);
      return;
    }
    if (seen.has(scene.id))
      errors.push(issue(['scenes', index, 'id'], `Duplicate scene id "${scene.id}".`));
    seen.add(scene.id);
    scenes.push(scene);
  });

  if (errors.length > 0 || isIssue(id) || isIssue(title)) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      schemaVersion: CINE_SCRAMBLE_SCHEMA_VERSION,
      type: CINE_SCRAMBLE_TYPE,
      id,
      title,
      ...(locale !== undefined ? { locale } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      ...(poster !== undefined ? { poster } : {}),
      ...(style !== undefined ? { style } : {}),
      ...(vocabEnabled !== undefined ? { vocabEnabled } : {}),
      ...(vocab !== undefined ? { vocab } : {}),
      ...(copy !== undefined ? { copy } : {}),
      scenes,
    },
  };
}

export const cineScrambleSchema = defineStandardSchema<CineScrambleData>((value) => {
  const result = validateCineScramble(value);
  return result.success ? { value: result.data } : { issues: result.errors };
});

export const CINE_SCRAMBLE_JSON_SCHEMA: Record<string, unknown> = {
  $id: 'https://intellectif.com/schemas/cine-scramble/1.0.json',
  title: 'Cine-Scramble activity',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'type', 'id', 'title', 'scenes'],
  properties: {
    schemaVersion: { const: CINE_SCRAMBLE_SCHEMA_VERSION },
    type: { const: CINE_SCRAMBLE_TYPE },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    locale: { type: 'string' },
    tagline: { type: 'string', minLength: 1 },
    copy: { type: 'object', additionalProperties: { type: 'string', minLength: 1 } },
    vocabEnabled: { type: 'boolean', default: true },
    vocab: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition'],
        properties: {
          term: { type: 'string', minLength: 1 },
          definition: { type: 'string', minLength: 1 },
        },
      },
    },
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
    scenes: {
      type: 'array',
      minItems: CINE_SCRAMBLE_SCENE_COUNT_MIN,
      maxItems: CINE_SCRAMBLE_SCENE_COUNT_MAX,
      items: {
        type: 'object',
        required: ['id', 'title', 'clips'],
        properties: {
          id: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          clips: {
            type: 'array',
            minItems: CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN,
            maxItems: CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX,
            items: {
              type: 'object',
              required: ['id', 'video', 'caption'],
              properties: {
                id: { type: 'integer', minimum: 0 },
                caption: { type: 'string', minLength: 1 },
                video: {
                  type: 'object',
                  required: ['assetKey', 'aspect'],
                  properties: {
                    assetKey: { type: 'string', minLength: 1 },
                    aspect: { type: 'string', enum: ['9:16', '16:9'] },
                    durationS: { type: 'number', exclusiveMinimum: 0 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const cineScrambleType: ActivityTypeDescriptor<CineScrambleData, CineScrambleResponse> =
  defineActivityType<CineScrambleData, CineScrambleResponse>({
    type: CINE_SCRAMBLE_TYPE,
    schema: cineScrambleSchema,
    jsonSchema: CINE_SCRAMBLE_JSON_SCHEMA,
    scoring: {
      kind: 'sync',
      score: (data, response) => {
        const scene = data.scenes.find((item) => item.id === response.sceneId);
        if (!scene) {
          return { score: 0, maxScore: 1, feedback: null, details: [] };
        }
        const order: unknown[] = Array.isArray(response.order) ? response.order : [];
        const correct =
          order.length === scene.clips.length && order.every((clipId, index) => clipId === index);
        return { score: correct ? 1 : 0, maxScore: 1, feedback: null, details: [] };
      },
    },
    fieldPolicy: {
      schemaVersion: 'public',
      type: 'public',
      id: 'public',
      title: 'public',
      locale: 'public',
      tagline: 'public',
      poster: 'public',
      style: 'public',
      vocabEnabled: 'public',
      vocab: 'public',
      copy: 'public',
      scenes: {
        id: 'public',
        title: 'public',
        clips: {
          id: 'public',
          video: 'public',
          caption: 'public',
          videoPrompt: 'author-only',
        },
      },
    },
    mediaSlots: (data) => {
      const slots: Array<{ path: Array<string | number>; kind: 'video' | 'image' }> = [];
      if (data.poster) slots.push({ path: ['poster'], kind: 'image' });
      data.scenes.forEach((scene, sceneIndex) => {
        scene.clips.forEach((_clip, clipIndex) => {
          slots.push({
            path: ['scenes', sceneIndex, 'clips', clipIndex, 'video'],
            kind: 'video' as const,
          });
        });
      });
      return slots;
    },
  });

export function createCineScrambleDraft(id = 'untitled'): CineScrambleData {
  return {
    schemaVersion: CINE_SCRAMBLE_SCHEMA_VERSION,
    type: CINE_SCRAMBLE_TYPE,
    id,
    title: 'Untitled scramble',
    locale: 'en',
    style: { presetId: 'cinema-dark' },
    vocabEnabled: true,
    vocab: [],
    scenes: [
      {
        id: 'scene-1',
        title: 'Scene 1',
        clips: Array.from({ length: CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT }, (_, index) => ({
          id: index,
          video: { assetKey: `clip-${index + 1}`, aspect: '16:9' },
          caption: `Caption ${index + 1}`,
        })),
      },
    ],
  };
}

export function isVocabEnabled(activity: CineScrambleData): boolean {
  return activity.vocabEnabled !== false && (activity.vocab?.length ?? 0) > 0;
}

export function validateCineScrambleData(data: unknown): ValidationResult<CineScrambleData> {
  return validateCineScramble(data);
}

export const cineScrambleTemplate: TemplateDefinition<CineScrambleData> = {
  id: CINE_SCRAMBLE_TYPE,
  version: CINE_SCRAMBLE_SCHEMA_VERSION,
  label: 'Cine-Scramble',
  activityType: CINE_SCRAMBLE_TYPE,
  validate: validateCineScrambleData,
  jsonSchema: CINE_SCRAMBLE_JSON_SCHEMA,
  aiSpec: CINE_SCRAMBLE_AI_SPEC,
  mediaSlots: (data) => {
    const slots: TemplateMediaSlot[] = [];
    if (data.poster)
      slots.push({ path: ['poster'], kind: 'image', assetKey: data.poster.assetKey });
    data.scenes.forEach((scene, sceneIndex) => {
      scene.clips.forEach((clip, clipIndex) => {
        slots.push({
          path: ['scenes', sceneIndex, 'clips', clipIndex, 'video'],
          kind: 'video',
          assetKey: clip.video.assetKey,
        });
      });
    });
    return slots;
  },
};
