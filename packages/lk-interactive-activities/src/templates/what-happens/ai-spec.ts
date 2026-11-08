import type { TemplateAiSpec } from '../../contract/ai-spec.js';
import {
  aiCatalogs,
  sharedAiRules,
  styleField,
  styleFields,
  textField,
  titleField,
  videoPromptField,
} from '../../contract/ai-spec-data.js';

const speakingFields = {
  freezeAt: { type: 'number', exclusiveMinimum: 0 },
  predictPrompt: textField,
  tellPrompt: textField,
  supportsEnabled: { type: 'boolean', default: true },
  supportsLabel: textField,
  supports: { type: 'array', uniqueItems: true, items: textField },
  answer: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: textField },
  },
};

export const WHAT_HAPPENS_AI_SPEC: TemplateAiSpec = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'style', 'clips'],
    properties: {
      title: titleField,
      style: styleField,
      supportsEnabled: { type: 'boolean', default: true },
      copy: {
        type: 'object',
        additionalProperties: false,
        properties: { predictTitle: textField, tellTitle: textField, supportsLabel: textField },
      },
      clips: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'freezeAt', 'answer', 'videoPrompt'],
          properties: { title: titleField, ...speakingFields, videoPrompt: videoPromptField },
        },
      },
    },
  },
  writableFields: [
    'title',
    ...styleFields,
    'supportsEnabled',
    'copy.predictTitle',
    'copy.tellTitle',
    'copy.supportsLabel',
    'clips[].title',
    'clips[].freezeAt',
    'clips[].predictPrompt',
    'clips[].tellPrompt',
    'clips[].supportsEnabled',
    'clips[].supportsLabel',
    'clips[].supports',
    'clips[].answer.text',
    'clips[].videoPrompt.text',
  ],
  counts: { clips: { min: 1, max: 12, default: 8 } },
  catalogs: aiCatalogs,
  rules: [
    ...sharedAiRules,
    'Generate 8 clips by default; accept 1–12. Host assigns unique clip IDs.',
    'Freeze and post-play speaking prompts are free text, not an enum; follow the editor brief.',
    'Supports are optional and enabled by default, with clip overrides; empty or disabled hides them.',
    'Supports may be hints, phrases or steps; they need not occur in answer.text. Only verbatim matches are underlined.',
    'Supply a sample answer, not a grade. Do not impose a fixed answer length or support count.',
    'freezeAt must be finite and satisfy 0 < freezeAt < durationS. Before upload it is provisional; revalidate against the actual duration.',
  ],
  promptFragments: [
    'Create an original paused-video speaking activity from the editor brief and language level.',
    'Give each clip a title, an open speaking prompt before the surprise, a follow-up task and a sample answer.',
    'Use optional supports and catalog choices to help learners, without grading their speech.',
  ],
  videoPrompt: {
    slotPath: 'clips[].video',
    writableFields: ['clips[].videoPrompt.text'],
    inputs: ['editorBrief', 'clipTitle', 'predictPrompt', 'tellPrompt', 'aspect', 'targetLengthS'],
    aspectRatios: ['9:16', '16:9'],
    defaultAspect: '9:16',
    targetLength:
      'Use the host/editor targetLengthS in seconds; describe a short setup and payoff within it.',
    scene: 'Describe subjects, setting, visible action, camera and continuity for this clip.',
    surpriseMoment:
      'Describe the surprise/payoff and the moment immediately before it where playback should freeze.',
    rules: [
      'One descriptive prompt per video slot.',
      'No text, subtitles, logos or watermarks.',
      'No media I/O or video API calls.',
    ],
    promptFragments: [
      'Describe a self-contained visual scene with a clear setup and surprise, matching the speaking task.',
    ],
  },
  freezeSuggestion: {
    inputs: ['durationS', 'aspect', 'editorBrief', 'currentClipCopy'],
    writableFields: [
      'freezeAt',
      'predictPrompt',
      'tellPrompt',
      'supportsEnabled',
      'supportsLabel',
      'supports',
      'answer.text',
    ],
    bounds: { exclusiveMinimum: 0, exclusiveMaximumField: 'durationS' },
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['freezeAt'],
      properties: speakingFields,
    },
    rules: [
      'The host supplies a finite positive actual durationS and aspect after upload; only the host/model inspects the video.',
      'Return a finite freezeAt in seconds satisfying 0 < freezeAt < durationS, immediately before the surprise.',
      'Write only the listed clip-relative fields. Keep related copy free text and supports optional.',
      'The editor accepts, edits or discards the suggestion; validate the merged clip before saving.',
    ],
    promptFragments: [
      'Suggest a freeze just before the payoff and related speaking copy; preserve the editor intent.',
    ],
  },
};
