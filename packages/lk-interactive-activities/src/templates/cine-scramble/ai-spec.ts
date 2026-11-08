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

export const CINE_SCRAMBLE_AI_SPEC: TemplateAiSpec = {
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'style', 'scenes'],
    properties: {
      title: titleField,
      tagline: textField,
      style: styleField,
      vocabEnabled: { type: 'boolean', default: true },
      vocab: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['term', 'definition'],
          properties: { term: titleField, definition: titleField },
        },
      },
      scenes: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'clips'],
          properties: {
            title: titleField,
            clips: {
              type: 'array',
              minItems: 3,
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['caption', 'videoPrompt'],
                properties: { caption: titleField, videoPrompt: videoPromptField },
              },
            },
          },
        },
      },
    },
  },
  writableFields: [
    'title',
    'tagline',
    ...styleFields,
    'vocabEnabled',
    'vocab[].term',
    'vocab[].definition',
    'scenes[].title',
    'scenes[].clips[].caption',
    'scenes[].clips[].videoPrompt.text',
  ],
  counts: { scenes: { min: 1, max: 8, default: 1 }, clipsPerScene: { min: 3, max: 6, default: 4 } },
  catalogs: aiCatalogs,
  rules: [
    ...sharedAiRules,
    'One story brief drives all scenes and per-clip video prompts. Keep characters, setting and chronological continuity consistent.',
    'Default to 1 scene (1–8 allowed) and 4 clips per scene (3–6 allowed). Host assigns unique scene IDs and chronological clip IDs 0..n-1.',
    'Exactly one nonempty caption per clip: it is both the timeline hint and a sentence in the stitched narrative.',
    'Vocabulary is optional, enabled by default, and one glossary of nonempty term/definition pairs. Empty or disabled hides its button.',
    'Do not generate Easy/Hard caption pairs, Reveal prompts or freezeAt. This template has no freeze point or Reveal mode.',
  ],
  promptFragments: [
    'Create an original chronological visual narrative from the editor story brief and language level.',
    'Divide it into scenes and clips; give each scene a title and each clip one caption and video-generation prompt.',
    'Captions should stitch into a coherent paragraph after learners restore the order. Offer an optional single glossary.',
  ],
  videoPrompt: {
    slotPath: 'scenes[].clips[].video',
    writableFields: ['scenes[].clips[].videoPrompt.text'],
    inputs: [
      'storyBrief',
      'sceneTitle',
      'caption',
      'chronologicalIndex',
      'aspect',
      'targetLengthS',
    ],
    aspectRatios: ['9:16', '16:9'],
    defaultAspect: '16:9',
    targetLength: 'Use host/editor targetLengthS in seconds for a short muted looping clip.',
    scene:
      'Describe subjects, setting, camera and a visible action matching this caption and its place in the story.',
    rules: [
      'One prompt per slot from the same story brief; preserve visual continuity.',
      'No text, subtitles, logos or watermarks.',
      'No media I/O or video API calls.',
    ],
    promptFragments: [
      'Describe this chronological story beat as a muted looping scene, consistent with adjacent clips.',
    ],
  },
};
