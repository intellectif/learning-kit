/** Serializable generation ports. The host calls models and validates merged drafts. */
export interface AiCatalogEntry {
  id: string;
  label: string;
  description: string;
}

export interface AiCountRule {
  min: number;
  max: number;
  default: number;
}

export interface VideoPromptSpec {
  slotPath: string;
  writableFields: readonly string[];
  inputs: readonly string[];
  aspectRatios: readonly ['9:16', '16:9'];
  defaultAspect: '9:16' | '16:9';
  targetLength: string;
  scene: string;
  surpriseMoment?: string;
  rules: readonly string[];
  promptFragments: readonly string[];
}

export interface FreezeSuggestionSpec {
  inputs: readonly string[];
  writableFields: readonly string[];
  bounds: { exclusiveMinimum: 0; exclusiveMaximumField: 'durationS' };
  jsonSchema: Record<string, unknown>;
  rules: readonly string[];
  promptFragments: readonly string[];
}

export interface TemplateAiSpec {
  /** Schema of AI-fillable content, not host-owned asset URLs, keys or provenance. */
  jsonSchema: Record<string, unknown>;
  /** Dot paths; [] denotes each array element. */
  writableFields: readonly string[];
  counts: Readonly<Record<string, AiCountRule>>;
  rules: readonly string[];
  promptFragments: readonly string[];
  catalogs: {
    styles: readonly AiCatalogEntry[];
    motions: readonly AiCatalogEntry[];
    animations: readonly AiCatalogEntry[];
    fonts: readonly AiCatalogEntry[];
  };
  videoPrompt: VideoPromptSpec;
  freezeSuggestion?: FreezeSuggestionSpec;
}
