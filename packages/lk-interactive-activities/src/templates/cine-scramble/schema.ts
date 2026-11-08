import {
  type ActivityTypeDescriptor,
  type DraftIssue,
  defineActivityType,
  type MediaSlot,
} from '@intellectif/lk-core';
import {
  arrayAt,
  assetRefAt,
  booleanAt,
  copyAt,
  detached,
  Issues,
  isRecord,
  localeAt,
  numberAt,
  objectAt,
  oneOfAt,
  type Path,
  refuseKeys,
  result,
  stringAt,
  styleAt,
} from '../../contract/read.js';
import { defineStandardSchema } from '../../contract/standard-schema.js';
import type {
  TemplateDefinition,
  TemplateMediaSlot,
  ValidationResult,
} from '../../contract/types.js';
import { FONT_ALLOW_LIST, MOTION_PRESET_IDS, STYLE_PRESET_IDS } from '../../style/catalog.js';
import { CINE_SCRAMBLE_AI_SPEC } from './ai-spec.js';
import { CINE_SCRAMBLE_CHROME } from './copy.js';
import type { CineScrambleData, CineScrambleResponse } from './types.js';

export { isVocabEnabled } from './rules.js';
export type {
  CineScrambleClip,
  CineScrambleCopy,
  CineScrambleData,
  CineScrambleResponse,
  CineScrambleScene,
  CineScrambleVocabItem,
} from './types.js';

export const CINE_SCRAMBLE_TYPE = 'cine-scramble';
export const CINE_SCRAMBLE_SCHEMA_VERSION = '1.0';
export const CINE_SCRAMBLE_SCENE_COUNT_DEFAULT = 1;
export const CINE_SCRAMBLE_SCENE_COUNT_MIN = 1;
export const CINE_SCRAMBLE_SCENE_COUNT_MAX = 8;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT = 4;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN = 3;
export const CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX = 6;

const REVEAL_KEYS = [
  'easyCaption',
  'hardCaption',
  'revealPrompt',
  'captions',
  'easy',
  'hard',
] as const;
const AUTHOR_ONLY_CLIP_KEYS = ['videoPrompt'] as const;
const COPY_KEYS = Object.keys(CINE_SCRAMBLE_CHROME.en);

function readClip(
  issues: Issues,
  raw: unknown,
  path: Path,
  learnerCopy: boolean,
): number | undefined {
  const object = objectAt(issues, raw, path);
  if (object === undefined) return undefined;
  const before = issues.count;
  for (const key of REVEAL_KEYS) {
    if (key in object) {
      issues.add(
        [...path, key],
        'reveal_field',
        'Reveal and Easy/Hard fields are not part of Cine-Scramble.',
      );
    }
  }
  if (learnerCopy) {
    refuseKeys(
      issues,
      object,
      path,
      AUTHOR_ONLY_CLIP_KEYS,
      'author_only_field',
      'An authoring-only field; a learner copy must not carry it.',
    );
  }
  const id = numberAt(issues, object.id, [...path, 'id']);
  if (id !== undefined && (!Number.isInteger(id) || id < 0)) {
    issues.add(
      [...path, 'id'],
      'not_chronological',
      'A clip id is its place in the story: a whole number from 0.',
    );
  }
  stringAt(issues, object.caption, [...path, 'caption']);
  assetRefAt(issues, object.video, [...path, 'video']);
  if (isRecord(object.video)) {
    oneOfAt(issues, object.video.aspect, [...path, 'video', 'aspect'], ['9:16', '16:9']);
    const durationS = numberAt(issues, object.video.durationS, [...path, 'video', 'durationS'], {
      required: false,
    });
    if (durationS !== undefined && durationS <= 0) {
      issues.add(
        [...path, 'video', 'durationS'],
        'not_positive',
        'The duration must be more than 0 seconds.',
      );
    }
  }
  if (object.videoPrompt !== undefined) {
    const prompt = objectAt(issues, object.videoPrompt, [...path, 'videoPrompt']);
    if (prompt !== undefined) {
      stringAt(issues, prompt.text, [...path, 'videoPrompt', 'text'], { allowEmpty: true });
      stringAt(issues, prompt.generatedBy, [...path, 'videoPrompt', 'generatedBy'], {
        required: false,
        allowEmpty: true,
      });
    }
  }
  return issues.count > before ? undefined : id;
}

function readScene(
  issues: Issues,
  raw: unknown,
  path: Path,
  learnerCopy: boolean,
): string | undefined {
  const object = objectAt(issues, raw, path);
  if (object === undefined) return undefined;
  const before = issues.count;
  const id = stringAt(issues, object.id, [...path, 'id']);
  stringAt(issues, object.title, [...path, 'title']);
  const clips = arrayAt(issues, object.clips, [...path, 'clips']);
  if (clips !== undefined) {
    if (
      clips.length < CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN ||
      clips.length > CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX
    ) {
      issues.add(
        [...path, 'clips'],
        'count_out_of_range',
        `Expected between ${CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN} and ${CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX} clips in a scene.`,
      );
    }
    const ids: number[] = [];
    const seen = new Set<number>();
    clips.forEach((clip, index) => {
      const clipId = readClip(issues, clip, [...path, 'clips', index], learnerCopy);
      if (clipId === undefined) return;
      if (seen.has(clipId)) {
        issues.add([...path, 'clips', index, 'id'], 'duplicate_id', `Duplicate clip id ${clipId}.`);
      }
      seen.add(clipId);
      ids.push(clipId);
    });
    if (issues.count === before && ids.some((clipId) => clipId >= ids.length)) {
      issues.add(
        [...path, 'clips'],
        'not_chronological',
        'Clip ids must be the story positions 0..n-1.',
      );
    }
  }
  return issues.count > before ? undefined : id;
}

function validate(
  value: unknown,
  { learnerCopy = false } = {},
): ValidationResult<CineScrambleData> {
  const issues = new Issues();
  const object = objectAt(issues, value, []);
  if (object === undefined) return result<CineScrambleData>(issues, undefined);

  if (object.schemaVersion !== CINE_SCRAMBLE_SCHEMA_VERSION) {
    issues.add(
      ['schemaVersion'],
      'unknown_schema_version',
      `Unknown schema version "${String(object.schemaVersion)}"; expected "${CINE_SCRAMBLE_SCHEMA_VERSION}".`,
    );
  }
  if (object.type !== CINE_SCRAMBLE_TYPE) {
    issues.add(['type'], 'unknown_template', `Unknown template "${String(object.type)}".`);
  }
  stringAt(issues, object.id, ['id']);
  stringAt(issues, object.title, ['title']);
  localeAt(issues, object.locale, ['locale'], { required: false });
  stringAt(issues, object.tagline, ['tagline'], { required: false });
  assetRefAt(issues, object.poster, ['poster'], { required: false });
  styleAt(issues, object.style, ['style'], { required: false });
  booleanAt(issues, object.vocabEnabled, ['vocabEnabled'], { required: false });
  const vocab = arrayAt(issues, object.vocab, ['vocab'], { required: false });
  if (vocab !== undefined) {
    const terms = new Set<string>();
    vocab.forEach((raw, index) => {
      const item = objectAt(issues, raw, ['vocab', index]);
      if (item === undefined) return;
      const term = stringAt(issues, item.term, ['vocab', index, 'term']);
      stringAt(issues, item.definition, ['vocab', index, 'definition']);
      if (term === undefined) return;
      const key = term.trim().toLowerCase();
      if (terms.has(key)) {
        issues.add(
          ['vocab', index, 'term'],
          'duplicate_item',
          `Duplicate vocabulary term "${term}".`,
        );
      }
      terms.add(key);
    });
  }
  copyAt(issues, object.copy, ['copy'], COPY_KEYS);

  const scenes = arrayAt(issues, object.scenes, ['scenes']);
  if (scenes !== undefined) {
    if (
      scenes.length < CINE_SCRAMBLE_SCENE_COUNT_MIN ||
      scenes.length > CINE_SCRAMBLE_SCENE_COUNT_MAX
    ) {
      issues.add(
        ['scenes'],
        'count_out_of_range',
        `Expected between ${CINE_SCRAMBLE_SCENE_COUNT_MIN} and ${CINE_SCRAMBLE_SCENE_COUNT_MAX} scenes.`,
      );
    }
    const seen = new Set<string>();
    scenes.forEach((raw, index) => {
      const sceneId = readScene(issues, raw, ['scenes', index], learnerCopy);
      if (sceneId === undefined) return;
      if (seen.has(sceneId)) {
        issues.add(['scenes', index, 'id'], 'duplicate_id', `Duplicate scene id "${sceneId}".`);
      }
      seen.add(sceneId);
    });
  }
  return result(
    issues,
    issues.count === 0 ? detached(object as unknown as CineScrambleData) : undefined,
  );
}

/**
 * Whether stored JSON is a publishable Cine-Scramble activity. Every problem is
 * reported at its path with a stable code; nothing is fixed silently. Keys the
 * contract does not know are kept as they are.
 */
export function validateCineScrambleData(data: unknown): ValidationResult<CineScrambleData> {
  return validate(data);
}

export const cineScrambleSchema = defineStandardSchema<CineScrambleData>((value) =>
  validate(value),
);
/** A learner's copy (`redact()` output): valid, and without authoring-only fields. */
const cineScrambleRedactedSchema = defineStandardSchema<CineScrambleData>((value) =>
  validate(value, { learnerCopy: true }),
);

const text = { type: 'string', pattern: '\\S' };
const assetRef = {
  type: 'object',
  required: ['assetKey'],
  properties: { assetKey: text, url: { type: 'string' } },
};

/**
 * The contract as JSON Schema (draft 2020-12), for forms and API documentation.
 * `validate()` stays authoritative: it also checks that clip ids are the story
 * positions 0..n-1, unique ids and terms, safe URLs and language tags. Unknown
 * keys are allowed, as the validator keeps them.
 */
export const CINE_SCRAMBLE_JSON_SCHEMA: Record<string, unknown> = {
  $id: 'https://intellectif.com/schemas/cine-scramble/1.0.json',
  title: 'Cine-Scramble activity',
  type: 'object',
  required: ['schemaVersion', 'type', 'id', 'title', 'scenes'],
  properties: {
    schemaVersion: { const: CINE_SCRAMBLE_SCHEMA_VERSION },
    type: { const: CINE_SCRAMBLE_TYPE },
    id: text,
    title: text,
    locale: text,
    tagline: text,
    poster: assetRef,
    copy: {
      type: 'object',
      properties: Object.fromEntries(COPY_KEYS.map((key) => [key, text])),
    },
    vocabEnabled: { type: 'boolean', default: true },
    vocab: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition'],
        properties: { term: text, definition: text },
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
          id: text,
          title: text,
          clips: {
            type: 'array',
            minItems: CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN,
            maxItems: CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX,
            items: {
              type: 'object',
              required: ['id', 'video', 'caption'],
              properties: {
                id: { type: 'integer', minimum: 0 },
                caption: text,
                video: {
                  type: 'object',
                  required: ['assetKey', 'aspect'],
                  properties: {
                    ...assetRef.properties,
                    aspect: { type: 'string', enum: ['9:16', '16:9'] },
                    durationS: { type: 'number', exclusiveMinimum: 0 },
                  },
                },
                videoPrompt: {
                  type: 'object',
                  required: ['text'],
                  properties: { text: { type: 'string' }, generatedBy: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** Draft codes `checkCineScrambleDraft` reports, each `incomplete`. */
export type CineScrambleDraftCode =
  | 'cs_title_required'
  | 'cs_scene_title_required'
  | 'cs_caption_required'
  | 'cs_video_required';

/**
 * What is still to write in a draft, as lk-core `DraftIssue`s of severity
 * `incomplete`, at the paths `validate` reports them: an empty title, an
 * untitled scene, a clip with no caption or no video yet. Accepts any object
 * and never throws.
 */
export function checkCineScrambleDraft(draft: Readonly<Record<string, unknown>>): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (path: Path, code: CineScrambleDraftCode, message: string) =>
    issues.push({ path: path.map(String), code, message, severity: 'incomplete' });
  const blank = (value: unknown) => typeof value === 'string' && value.trim() === '';
  if (blank(draft.title)) add(['title'], 'cs_title_required', 'Give the activity a title.');
  if (Array.isArray(draft.scenes)) {
    draft.scenes.forEach((scene, sceneIndex) => {
      if (!isRecord(scene)) return;
      if (blank(scene.title)) {
        add(['scenes', sceneIndex, 'title'], 'cs_scene_title_required', 'Give the scene a title.');
      }
      if (!Array.isArray(scene.clips)) return;
      scene.clips.forEach((clip, clipIndex) => {
        if (!isRecord(clip)) return;
        const path = ['scenes', sceneIndex, 'clips', clipIndex];
        if (blank(clip.caption))
          add([...path, 'caption'], 'cs_caption_required', 'Write the caption.');
        if (isRecord(clip.video) && blank(clip.video.assetKey)) {
          add([...path, 'video', 'assetKey'], 'cs_video_required', 'Upload the clip.');
        }
      });
    });
  }
  return issues;
}

/**
 * A new, unauthored Cine-Scramble activity: one scene of four clips (the
 * defaults), vocabulary on, English content, the cinema style. Titles,
 * captions and media are empty, so `validateCineScrambleData` refuses it and
 * lk-core's `validateDraft` reports it `incomplete` until it is written.
 */
export function createCineScrambleDraft(id = 'untitled', sceneId = 'scene-1'): CineScrambleData {
  return {
    schemaVersion: CINE_SCRAMBLE_SCHEMA_VERSION,
    type: CINE_SCRAMBLE_TYPE,
    id,
    title: '',
    locale: 'en',
    style: { presetId: 'cinema-dark', mode: 'dark' },
    vocabEnabled: true,
    vocab: [],
    scenes: [
      {
        id: sceneId,
        title: '',
        clips: Array.from({ length: CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT }, (_, index) => ({
          id: index,
          video: { assetKey: '', aspect: '16:9' as const },
          caption: '',
        })),
      },
    ],
  };
}

const hasKey = (ref: unknown): ref is Record<string, unknown> & { assetKey: string } =>
  isRecord(ref) && typeof ref.assetKey === 'string' && ref.assetKey.trim() !== '';

/** Every file the activity has or needs, filled or not. Accepts partial drafts. */
export function cineScrambleMediaSlots(data: CineScrambleData): TemplateMediaSlot[] {
  const slots: TemplateMediaSlot[] = [];
  const activity: Record<string, unknown> = isRecord(data) ? data : {};
  const poster: TemplateMediaSlot = {
    path: ['poster'],
    kind: 'image',
    role: 'poster',
    required: false,
    present: hasKey(activity.poster),
  };
  if (hasKey(activity.poster)) poster.assetKey = activity.poster.assetKey;
  slots.push(poster);
  const scenes: unknown[] = Array.isArray(activity.scenes) ? activity.scenes : [];
  scenes.forEach((rawScene, sceneIndex) => {
    const scene: Record<string, unknown> = isRecord(rawScene) ? rawScene : {};
    const clips: unknown[] = Array.isArray(scene.clips) ? scene.clips : [];
    clips.forEach((rawClip, clipIndex) => {
      const clip: Record<string, unknown> = isRecord(rawClip) ? rawClip : {};
      const ref = clip.video;
      const slot: TemplateMediaSlot = {
        path: ['scenes', sceneIndex, 'clips', clipIndex, 'video'],
        kind: 'video',
        role: 'video',
        required: true,
        present: hasKey(ref),
      };
      if (hasKey(ref)) slot.assetKey = ref.assetKey;
      if (typeof clip.caption === 'string' && clip.caption !== '') slot.label = clip.caption;
      if (isRecord(ref)) {
        if (ref.aspect === '9:16' || ref.aspect === '16:9') slot.aspect = ref.aspect;
        if (typeof ref.durationS === 'number') slot.durationS = ref.durationS;
      }
      slots.push(slot);
    });
  });
  return slots;
}

export const cineScrambleType: ActivityTypeDescriptor<CineScrambleData, CineScrambleResponse> =
  defineActivityType<CineScrambleData, CineScrambleResponse>({
    type: CINE_SCRAMBLE_TYPE,
    schema: cineScrambleSchema,
    redactedSchema: cineScrambleRedactedSchema,
    jsonSchema: CINE_SCRAMBLE_JSON_SCHEMA,
    // Ordering the clips is practice and is not graded: the player checks each
    // scene for the learner, and the check reaches xAPI as `success` only.
    // `deferred` is lk-core's only "no score" kind; nothing is waiting for a grade.
    scoring: { kind: 'deferred', reason: 'requires_async_grading' },
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
          // The story order travels with the clips: the player checks locally.
          id: 'public',
          video: 'public',
          caption: 'public',
          videoPrompt: 'author-only',
        },
      },
    },
    authoring: {
      createDraft: (context) => createCineScrambleDraft(context.newId(), context.newId()),
      checkDraft: checkCineScrambleDraft,
    },
    // lk-core reads the files that are there; `cineScrambleMediaSlots` lists all.
    mediaSlots: (data): MediaSlot[] =>
      cineScrambleMediaSlots(data)
        .filter((slot) => slot.present)
        .map((slot) => ({ path: slot.path, kind: slot.kind === 'image' ? 'image' : 'video' })),
  });

export const cineScrambleTemplate: TemplateDefinition<CineScrambleData> = {
  id: CINE_SCRAMBLE_TYPE,
  version: CINE_SCRAMBLE_SCHEMA_VERSION,
  label: 'Cine-Scramble',
  activityType: CINE_SCRAMBLE_TYPE,
  validate: validateCineScrambleData,
  createDraft: (id) => createCineScrambleDraft(id),
  jsonSchema: CINE_SCRAMBLE_JSON_SCHEMA,
  aiSpec: CINE_SCRAMBLE_AI_SPEC,
  mediaSlots: cineScrambleMediaSlots,
};
