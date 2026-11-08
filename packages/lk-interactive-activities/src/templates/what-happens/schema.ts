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
import { WHAT_HAPPENS_AI_SPEC } from './ai-spec.js';
import { WHAT_HAPPENS_CHROME, whatHappensChrome } from './copy.js';
import type { WhatHappensClip, WhatHappensData, WhatHappensResponse } from './types.js';

export { answerTextHash, isAnswerAudioCurrent, isSupportsEnabled } from './rules.js';
export type {
  WhatHappensClip,
  WhatHappensCopy,
  WhatHappensData,
  WhatHappensResponse,
} from './types.js';
export { whatHappensChrome };

export const WHAT_HAPPENS_TYPE = 'what-happens';
export const WHAT_HAPPENS_SCHEMA_VERSION = '1.0';
export const WHAT_HAPPENS_CLIP_COUNT_DEFAULT = 8;
export const WHAT_HAPPENS_CLIP_COUNT_MIN = 1;
export const WHAT_HAPPENS_CLIP_COUNT_MAX = 12;

const REVEAL_KEYS = ['easyCaption', 'hardCaption', 'revealPrompt', 'captionPairs'] as const;
const AUTHOR_ONLY_CLIP_KEYS = ['videoPrompt', 'origin'] as const;
const COPY_KEYS = Object.keys(WHAT_HAPPENS_CHROME.en);

function readClip(issues: Issues, raw: unknown, path: Path): WhatHappensClip | undefined {
  const object = objectAt(issues, raw, path);
  if (object === undefined) return undefined;
  const before = issues.count;
  for (const key of REVEAL_KEYS) {
    if (key in object)
      issues.add([...path, key], 'reveal_field', 'Reveal fields are not part of What Happens.');
  }
  const id = stringAt(issues, object.id, [...path, 'id']);
  stringAt(issues, object.title, [...path, 'title']);

  const video = assetRefAt(issues, object.video, [...path, 'video']);
  let durationS: number | undefined;
  if (isRecord(object.video)) {
    oneOfAt(issues, object.video.aspect, [...path, 'video', 'aspect'], ['9:16', '16:9']);
    durationS = numberAt(issues, object.video.durationS, [...path, 'video', 'durationS'], {
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
  const freezeAt = numberAt(issues, object.freezeAt, [...path, 'freezeAt']);
  if (freezeAt !== undefined) {
    if (freezeAt <= 0) {
      issues.add(
        [...path, 'freezeAt'],
        'freeze_out_of_bounds',
        'The freeze point must be after the start of the clip.',
      );
    } else if (durationS !== undefined && durationS > 0 && freezeAt >= durationS) {
      issues.add(
        [...path, 'freezeAt'],
        'freeze_out_of_bounds',
        'The freeze point must be before the end of the clip.',
      );
    }
  }

  for (const key of ['predictPrompt', 'tellPrompt', 'supportsLabel'] as const) {
    stringAt(issues, object[key], [...path, key], { required: false });
  }
  booleanAt(issues, object.supportsEnabled, [...path, 'supportsEnabled'], { required: false });
  const supports = arrayAt(issues, object.supports, [...path, 'supports'], { required: false });
  if (supports !== undefined) {
    const seen = new Set<string>();
    supports.forEach((item, index) => {
      const text = stringAt(issues, item, [...path, 'supports', index]);
      if (text === undefined) return;
      const key = text.trim().toLowerCase();
      if (seen.has(key)) {
        issues.add(
          [...path, 'supports', index],
          'duplicate_item',
          `Duplicate support item "${text}".`,
        );
      }
      seen.add(key);
    });
  }
  for (const key of ['thumb', 'poster'] as const) {
    assetRefAt(issues, object[key], [...path, key], { required: false });
  }
  if (assetRefAt(issues, object.captions, [...path, 'captions'], { required: false })) {
    const captions = object.captions as Record<string, unknown>;
    localeAt(issues, captions.srclang, [...path, 'captions', 'srclang'], { required: false });
    stringAt(issues, captions.label, [...path, 'captions', 'label'], { required: false });
  }
  const answer = objectAt(issues, object.answer, [...path, 'answer']);
  if (answer !== undefined) {
    stringAt(issues, answer.text, [...path, 'answer', 'text'], { allowEmpty: true });
  }
  if (assetRefAt(issues, object.audio, [...path, 'audio'], { required: false })) {
    const audio = object.audio as Record<string, unknown>;
    stringAt(issues, audio.textHash, [...path, 'audio', 'textHash']);
    stringAt(issues, audio.voice, [...path, 'audio', 'voice'], {
      required: false,
      allowEmpty: true,
    });
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
  oneOfAt(issues, object.origin, [...path, 'origin'], ['authored', 'generated'], {
    required: false,
  });

  if (issues.count > before || id === undefined || video === undefined) return undefined;
  return object as unknown as WhatHappensClip;
}

function validate(value: unknown, { learnerCopy = false } = {}): ValidationResult<WhatHappensData> {
  const issues = new Issues();
  const object = objectAt(issues, value, []);
  if (object === undefined) return result<WhatHappensData>(issues, undefined);

  if (object.schemaVersion !== WHAT_HAPPENS_SCHEMA_VERSION) {
    issues.add(
      ['schemaVersion'],
      'unknown_schema_version',
      `Unknown schema version "${String(object.schemaVersion)}"; expected "${WHAT_HAPPENS_SCHEMA_VERSION}".`,
    );
  }
  if (object.type !== WHAT_HAPPENS_TYPE) {
    issues.add(['type'], 'unknown_template', `Unknown template "${String(object.type)}".`);
  }
  stringAt(issues, object.id, ['id']);
  stringAt(issues, object.title, ['title']);
  localeAt(issues, object.locale, ['locale']);
  styleAt(issues, object.style, ['style']);
  booleanAt(issues, object.supportsEnabled, ['supportsEnabled'], { required: false });
  copyAt(issues, object.copy, ['copy'], COPY_KEYS);

  const clips = arrayAt(issues, object.clips, ['clips']);
  if (clips !== undefined) {
    if (clips.length < WHAT_HAPPENS_CLIP_COUNT_MIN || clips.length > WHAT_HAPPENS_CLIP_COUNT_MAX) {
      issues.add(
        ['clips'],
        'count_out_of_range',
        `Expected between ${WHAT_HAPPENS_CLIP_COUNT_MIN} and ${WHAT_HAPPENS_CLIP_COUNT_MAX} clips.`,
      );
    }
    const seen = new Set<string>();
    clips.forEach((raw, index) => {
      const clip = readClip(issues, raw, ['clips', index]);
      if (learnerCopy && isRecord(raw)) {
        refuseKeys(
          issues,
          raw,
          ['clips', index],
          AUTHOR_ONLY_CLIP_KEYS,
          'author_only_field',
          'An authoring-only field; a learner copy must not carry it.',
        );
      }
      if (clip === undefined) return;
      if (seen.has(clip.id)) {
        issues.add(['clips', index, 'id'], 'duplicate_id', `Duplicate clip id "${clip.id}".`);
      }
      seen.add(clip.id);
    });
  }
  // Nothing is rewritten, and keys the contract does not know (a host's own
  // fields) are kept as they are, in a copy detached from the input.
  return result(
    issues,
    issues.count === 0 ? detached(object as unknown as WhatHappensData) : undefined,
  );
}

/**
 * Whether stored JSON is a publishable What Happens activity. Every problem is
 * reported at its path with a stable code; nothing is fixed silently. Keys the
 * contract does not know are kept as they are.
 */
export function validateWhatHappensData(data: unknown): ValidationResult<WhatHappensData> {
  return validate(data);
}

export const whatHappensSchema = defineStandardSchema<WhatHappensData>((value) => validate(value));
/** A learner's copy (`redact()` output): valid, and without authoring-only fields. */
const whatHappensRedactedSchema = defineStandardSchema<WhatHappensData>((value) =>
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
 * `validate()` stays authoritative: it also checks freeze points against the
 * duration, unique ids, duplicate supports, safe URLs and language tags.
 * Unknown keys are allowed, as the validator keeps them.
 */
export const WHAT_HAPPENS_JSON_SCHEMA: Record<string, unknown> = {
  $id: 'https://intellectif.com/schemas/what-happens/1.0.json',
  title: 'What Happens activity',
  type: 'object',
  required: ['schemaVersion', 'type', 'id', 'title', 'locale', 'style', 'clips'],
  properties: {
    schemaVersion: { const: WHAT_HAPPENS_SCHEMA_VERSION },
    type: { const: WHAT_HAPPENS_TYPE },
    id: text,
    title: text,
    locale: text,
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
    copy: {
      type: 'object',
      properties: Object.fromEntries(COPY_KEYS.map((key) => [key, text])),
    },
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
        id: text,
        title: text,
        video: {
          type: 'object',
          required: ['assetKey', 'aspect'],
          properties: {
            ...assetRef.properties,
            aspect: { type: 'string', enum: ['9:16', '16:9'] },
            durationS: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        thumb: assetRef,
        poster: assetRef,
        captions: {
          type: 'object',
          required: ['assetKey'],
          properties: { ...assetRef.properties, srclang: text, label: text },
        },
        freezeAt: { type: 'number', exclusiveMinimum: 0 },
        predictPrompt: text,
        tellPrompt: text,
        supportsEnabled: { type: 'boolean' },
        supportsLabel: text,
        supports: { type: 'array', items: text },
        answer: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        },
        audio: {
          type: 'object',
          required: ['assetKey', 'textHash'],
          properties: { ...assetRef.properties, textHash: text, voice: { type: 'string' } },
        },
        videoPrompt: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' }, generatedBy: { type: 'string' } },
        },
        origin: { type: 'string', enum: ['authored', 'generated'] },
      },
    },
  },
};

/** Draft codes `checkWhatHappensDraft` reports, each `incomplete`. */
export type WhatHappensDraftCode =
  | 'wh_title_required'
  | 'wh_clip_title_required'
  | 'wh_video_required'
  | 'wh_freeze_required';

/**
 * What is still to write in a draft, as lk-core `DraftIssue`s of severity
 * `incomplete`, at the paths `validate` reports them: an empty title, an
 * unnamed clip, a clip with no video yet, a freeze point not set. Accepts any
 * object and never throws.
 */
export function checkWhatHappensDraft(draft: Readonly<Record<string, unknown>>): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (path: Path, code: WhatHappensDraftCode, message: string) =>
    issues.push({ path: path.map(String), code, message, severity: 'incomplete' });
  const blank = (value: unknown) => typeof value === 'string' && value.trim() === '';
  if (blank(draft.title)) add(['title'], 'wh_title_required', 'Give the activity a title.');
  if (Array.isArray(draft.clips)) {
    draft.clips.forEach((clip, index) => {
      if (!isRecord(clip)) return;
      if (blank(clip.title)) {
        add(['clips', index, 'title'], 'wh_clip_title_required', 'Give the clip a title.');
      }
      if (isRecord(clip.video) && blank(clip.video.assetKey)) {
        add(['clips', index, 'video', 'assetKey'], 'wh_video_required', 'Upload the clip.');
      }
      if (clip.freezeAt === 0) {
        add(['clips', index, 'freezeAt'], 'wh_freeze_required', 'Set the freeze point.');
      }
    });
  }
  return issues;
}

/**
 * A new, unauthored What Happens activity: 8 clips (the default), supports on,
 * English content, the default style. Titles and media are empty and freeze
 * points unset, so `validateWhatHappensData` refuses it and lk-core's
 * `validateDraft` reports it `incomplete` until it is written.
 *
 * `newId` names the clips; by default `clip-1` to `clip-8`.
 */
export function createWhatHappensDraft(id = 'untitled', newId?: () => string): WhatHappensData {
  let next = 0;
  const clipId = newId ?? (() => `clip-${++next}`);
  return {
    schemaVersion: WHAT_HAPPENS_SCHEMA_VERSION,
    type: WHAT_HAPPENS_TYPE,
    id,
    title: '',
    locale: 'en',
    style: { presetId: 'default' },
    supportsEnabled: true,
    clips: Array.from({ length: WHAT_HAPPENS_CLIP_COUNT_DEFAULT }, () => ({
      id: clipId(),
      title: '',
      video: { assetKey: '', aspect: '9:16' as const },
      freezeAt: 0,
      answer: { text: '' },
    })),
  };
}

const hasKey = (ref: unknown): ref is Record<string, unknown> & { assetKey: string } =>
  isRecord(ref) && typeof ref.assetKey === 'string' && ref.assetKey.trim() !== '';

/** Every file the activity has or needs, filled or not. Accepts partial drafts. */
export function whatHappensMediaSlots(data: WhatHappensData): TemplateMediaSlot[] {
  const slots: TemplateMediaSlot[] = [];
  const clips: unknown[] = isRecord(data) && Array.isArray(data.clips) ? data.clips : [];
  clips.forEach((raw, index) => {
    const clip: Record<string, unknown> = isRecord(raw) ? raw : {};
    const label = typeof clip.title === 'string' && clip.title !== '' ? clip.title : undefined;
    const slot = (
      role: TemplateMediaSlot['role'],
      kind: TemplateMediaSlot['kind'],
      required: boolean,
    ) => {
      const ref = clip[role];
      const entry: TemplateMediaSlot = {
        path: ['clips', index, role],
        kind,
        role,
        required,
        present: hasKey(ref),
      };
      if (hasKey(ref)) entry.assetKey = ref.assetKey;
      if (label !== undefined) entry.label = label;
      if (role === 'video' && isRecord(ref)) {
        if (ref.aspect === '9:16' || ref.aspect === '16:9') entry.aspect = ref.aspect;
        if (typeof ref.durationS === 'number') entry.durationS = ref.durationS;
      }
      slots.push(entry);
    };
    slot('video', 'video', true);
    slot('thumb', 'image', false);
    slot('poster', 'image', false);
    slot('captions', 'captions', false);
    slot('audio', 'audio', false);
  });
  return slots;
}

export const whatHappensType: ActivityTypeDescriptor<WhatHappensData, WhatHappensResponse> =
  defineActivityType<WhatHappensData, WhatHappensResponse>({
    type: WHAT_HAPPENS_TYPE,
    schema: whatHappensSchema,
    redactedSchema: whatHappensRedactedSchema,
    jsonSchema: WHAT_HAPPENS_JSON_SCHEMA,
    // Speaking is practice and is never graded (FR-70). `deferred` is lk-core's
    // only "no score" kind; nothing is waiting for a grade.
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
        captions: 'public',
        freezeAt: 'public',
        predictPrompt: 'public',
        tellPrompt: 'public',
        supportsEnabled: 'public',
        supportsLabel: 'public',
        supports: 'public',
        // The sample answer is shown to every learner after they speak.
        answer: 'public',
        audio: 'public',
        videoPrompt: 'author-only',
        origin: 'author-only',
      },
    },
    authoring: {
      createDraft: (context) => createWhatHappensDraft(context.newId(), context.newId),
      checkDraft: checkWhatHappensDraft,
    },
    // lk-core reads the files that are there; `whatHappensMediaSlots` lists all.
    mediaSlots: (data): MediaSlot[] =>
      whatHappensMediaSlots(data)
        .filter((slot) => slot.present)
        .map((slot) =>
          slot.kind === 'captions' ? { path: slot.path } : { path: slot.path, kind: slot.kind },
        ),
  });

export const whatHappensTemplate: TemplateDefinition<WhatHappensData> = {
  id: WHAT_HAPPENS_TYPE,
  version: WHAT_HAPPENS_SCHEMA_VERSION,
  label: 'What Happens',
  activityType: WHAT_HAPPENS_TYPE,
  validate: validateWhatHappensData,
  createDraft: (id) => createWhatHappensDraft(id),
  jsonSchema: WHAT_HAPPENS_JSON_SCHEMA,
  aiSpec: WHAT_HAPPENS_AI_SPEC,
  mediaSlots: whatHappensMediaSlots,
};
