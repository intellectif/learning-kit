/**
 * The public speech primitives. The locale pattern and the assessment schema
 * stay internal: `validateSpeechAssessment` is the one way in, so its paths and
 * codes are the contract, not the shape of a zod schema.
 */
export { alignReadAloud } from './align.js';
export { validateSpeechAssessment } from './assessment.js';
export { gradeReadAloud } from './grade.js';
export {
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
  SPEECH_ASSESSMENT_MAX_WORDS,
} from './limits.js';
export { inspectWav } from './wav.js';
