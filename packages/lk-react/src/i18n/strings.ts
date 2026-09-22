import type { ReadAloudDimension, ReadAloudWordState, Stimulus } from '@intellectif/lk-core';
import type { CaptionSize } from '../components/InteractiveVideo/prefs.js';
import type { VideoShortcutAction } from '../components/InteractiveVideo/shortcuts.js';
import type { MediaTransportStrings } from '../components/types.js';
import type { SpeechRecorderError } from '../hooks/useSpeechRecorder.js';

/**
 * Every string the SDK's own chrome renders.
 *
 * Until 0.8.1 these were literals, and `locale` set only the `lang` attribute —
 * so a learner sitting a Spanish paper read a Spanish passage inside an English
 * scaffold, and "No plays remaining" on a listening exam was untranslatable.
 * This is the whole surface, in one place, so a consumer can replace it.
 *
 * **Interpolation and plurals are functions, not format strings.** A message
 * like `"Question {n} of {total}"` needs a parser, and a parser needs plural
 * rules for every locale the SDK does not know. A function hands both problems
 * to the consumer, who has `Intl.PluralRules` and knows their own language:
 *
 * ```ts
 * questionProgress: (index, total) => `Pregunta ${index} de ${total}`,
 * wordCount: (n) => `${n} ${n === 1 ? 'palabra' : 'palabras'}`,
 * ```
 *
 * It also lets a translation reorder its arguments, which a positional token
 * cannot, and TypeScript checks the arity. No parser, no message catalogue
 * format, no runtime dependency.
 *
 * **What is deliberately NOT here: thrown errors.** Every `throw` in this
 * package is addressed to the developer who wired the component up, not to the
 * learner. Translating them would make them unsearchable and would put the one
 * audience who can act on them behind a translation. They stay English.
 */
export interface LkStrings {
  // ── Submission ─────────────────────────────────────────────────────────
  /** Multiple Choice submit button, and Written Response. */
  submit: string;
  /** Fill-in-the-Blanks in `practice`: the learner is checking their own work. */
  checkAnswers: string;
  /** Fill-in-the-Blanks in `exam`: nothing is checked on the client. */
  submitAnswers: string;

  // ── Outcome, announced after submit ────────────────────────────────────
  /**
   * The scored result, read by a screen reader on submit.
   *
   * `percent` is already rounded to a whole number. The authored overall
   * feedback is appended SEPARATELY by the component, so a translation of this
   * sentence never has to carry the author's words — the two were previously
   * concatenated into one literal, which made the score sentence untranslatable
   * without also touching authored content.
   */
  scoreAnnouncement: (percent: number, passed: boolean) => string;
  /** Prefix announced on submit, before the score sentence. */
  answerSubmitted: string;
  /** An answer submitted for grading that has none yet. Never rendered as 0%. */
  notGradedYet: string;
  /** An outcome that carries no grade and never will. */
  noGradeAvailable: string;

  // ── Feedback disclosure ────────────────────────────────────────────────
  showFeedback: string;
  hideFeedback: string;

  // ── Fill-in-the-Blanks ─────────────────────────────────────────────────
  /** Accessible name of a blank's input. `ordinal` is 1-based. */
  blankLabel: (ordinal: number) => string;

  // ── Gap select ────────────────────────────────────────────────────────────
  /** Accessible name of the selector for one gap in a Gap Select passage. */
  gapLabel: (ordinal: number) => string;
  /**
   * The empty first entry of a gap's selector — how a learner leaves a gap
   * alone, and how they take an answer back. Never a real choice.
   */
  gapPlaceholder: string;
  showHint: string;
  hideHint: string;

  // ── Written Response ───────────────────────────────────────────────────
  /**
   * Announced when an essay is handed in. Distinct from {@link LkStrings.awaitingGrade},
   * which is the `review`-mode state of a submission made earlier: this one
   * confirms the act, and is the only thing a learner hears at the moment they
   * commit work that nothing on the client will grade.
   */
  responseSubmitted: string;
  /** Live word counter. Needs the count for languages whose plural rules differ. */
  wordCount: (count: number) => string;
  /** The authored bounds, e.g. "50–200 words". `min` is 0 when unbounded below. */
  wordBounds: (min: number, max: number) => string;
  /** A rubric criterion the grader marked not applicable. */
  notApplicable: string;
  /** A returned grade flagged for a human to look at — learner-visible by design. */
  awaitingHumanReview: string;
  /** Submitted, no grade back yet. */
  awaitingGrade: string;
  /** The grader could not produce a grade. */
  couldNotBeGraded: string;

  // ── Sequence pager ─────────────────────────────────────────────────────
  previous: string;
  next: string;
  /** Progress label, also the question region's accessible name. `index` is 1-based. */
  questionProgress: (index: number, total: number) => string;
  /** Shown when no renderer is registered for an activity type. */
  unsupportedActivity: string;

  // ── Dictation ──────────────────────────────────────────────────────────
  /** Accessible name of the box the learner types the recording into. */
  dictationInputLabel: string;
  /** Accessible name of the group holding the recording. */
  dictationRecording: string;
  /** Accessible name of the group holding the slower recording, and its default `alt`. */
  dictationSlowRecording: string;
  /** The progressive-hint button, with how many transcript words are shown so far. */
  dictationRevealNextWord: (revealed: number, total: number) => string;
  /** Hides every revealed hint word again. */
  dictationResetHints: string;
  /** The solution toggle: shows the transcript after the attempt is marked. */
  showSolution: string;
  hideSolution: string;
  /** Accessible name of the revealed transcript. */
  dictationSolutionLabel: string;
  /** Accessible name of the word-by-word marked result. */
  dictationMarksLabel: string;
  /** Tells the learner the marks compare the normalised text, not what they typed. */
  dictationDiffNote: string;
  /**
   * The four sentences a screen reader hears for a marked word — the only
   * channel the marks have for assistive technology; the glyphs and the
   * character diff are decoration.
   */
  dictationWordCorrect: (word: string) => string;
  dictationWordWrong: (word: string, expected: string) => string;
  dictationWordMissing: (expected: string) => string;
  dictationWordExtra: (word: string) => string;
  /** The legend rows; the character-level marks reuse the same four. */
  dictationLegendCorrect: string;
  dictationLegendWrong: string;
  dictationLegendMissing: string;
  dictationLegendExtra: string;
  /** Marked result of an attempt with no words in it once punctuation and spacing are ignored, an empty one included. */
  dictationNothingTyped: string;
  /**
   * Appended to the score announcement, e.g. "4 of 6 words correct." — a whole
   * sentence, because authored feedback may follow it.
   */
  dictationWordsSummary: (correct: number, total: number) => string;

  // ── Read aloud ─────────────────────────────────────────────────────────
  /** Accessible name of the group holding the model recording. */
  readAloudModelRecording: string;
  /** Accessible name of the group holding the slower model recording, and its default `alt`. */
  readAloudSlowRecording: string;
  /** Starts a take. */
  readAloudRecord: string;
  /** Ends the take in progress. */
  readAloudStop: string;
  /** Throws the take away so the learner can start over. */
  readAloudRerecord: string;
  /** Accessible name of the player for the take the learner just made. */
  readAloudYourRecording: string;
  /**
   * In place of the player for the learner's own take, and of the buttons that
   * play one word of it, when the page refuses to play it — most often a
   * Content-Security-Policy whose `media-src` does not allow `blob:`. Said
   * rather than left as controls that do nothing when pressed.
   */
  readAloudPlaybackUnavailable: string;
  /**
   * Live progress while recording. Whole seconds, not a `m:ss` clock: a
   * recording is bounded in seconds by the item, and a translation should not
   * have to reimplement a clock to change the word around it.
   *
   * Shown on screen and hidden from assistive technology: it changes every
   * second, and a screen reader that spoke each change would speak into the
   * take being assessed. The two sentences below are what is announced instead.
   */
  readAloudRecordingProgress: (seconds: number, maxSeconds: number) => string;
  /** Announced once when a capture begins. */
  readAloudRecordingStarted: string;
  /**
   * Announced once when a capture ends, by the learner or at its own bound.
   * Carries the length because the progress counter is not announced: a take
   * that reads back as "20 of 20 seconds" is one that stopped itself.
   */
  readAloudRecordingStopped: (seconds: number, maxSeconds: number) => string;
  /** How many takes are left. Called with 0 as well, so the wording is one translation's. */
  readAloudTakesRemaining: (remaining: number, max: number) => string;
  /** `exam` only: hands the item in with no recording at all, deliberately. */
  readAloudSubmitWithoutRecording: string;
  /** Pending, while the take travels to the application's storage. */
  readAloudUploading: string;
  /** The take never reached storage, so nothing was submitted. */
  readAloudUploadFailed: string;
  /** Retries whichever step just failed. */
  readAloudTryAgain: string;
  /** Pending, while the assessor judges the take. */
  readAloudAssessing: string;
  /** The binding stores recordings but judges none, so there is no feedback to show. */
  readAloudAssessmentUnavailable: string;
  /** The assessor found no speech, or too little of it, in the take. */
  readAloudNotHeard: string;
  /** The assessor produced no grade for any other reason. The code itself is never shown. */
  readAloudNotAssessed: string;
  /** The assessment could not be run at all — a failure of the call, not of the reading. */
  readAloudAssessmentFailed: string;
  /**
   * What went wrong with the microphone or with the take. One function rather
   * than five keys, so a translation keeps the five sentences together and the
   * SDK keeps one name for the concept.
   */
  readAloudRecorderError: (reason: SpeechRecorderError) => string;

  // ── Pronunciation feedback ─────────────────────────────────────────────
  /** Accessible name of the whole feedback region. */
  pronunciationFeedbackLabel: string;
  /** Name of one scored dimension, as a learner reads it. */
  pronunciationDimension: (dimension: ReadAloudDimension) => string;
  /** A dimension or a word the engine did not measure. NEVER rendered as 0%. */
  pronunciationNotAssessed: string;
  /** Accessible name of the word-by-word marks. */
  pronunciationWordsLabel: string;
  /** One legend row per marking state — the same four states the marks carry. */
  pronunciationLegend: (state: ReadAloudWordState) => string;
  /**
   * The four sentences a screen reader hears for a marked word: the only
   * channel the marks have for assistive technology, since the glyph and the
   * decoration are both hidden from it.
   */
  pronunciationWordCorrect: (word: string) => string;
  pronunciationWordMispronounced: (word: string) => string;
  pronunciationWordOmitted: (word: string) => string;
  pronunciationWordInserted: (word: string) => string;
  /** Opens one word's syllables, sounds and timings. */
  pronunciationWordDetails: (word: string) => string;
  pronunciationSyllables: string;
  pronunciationPhonemes: string;
  /** A syllable the engine also spelled out, e.g. `('ˈhæ', 'ha')`. */
  pronunciationSyllableSpelling: (syllable: string, grapheme: string) => string;
  /** A sound the engine named no symbol for; `ordinal` is 1-based. */
  pronunciationPhonemePosition: (ordinal: number) => string;
  /** Introduces the sounds the engine thought it heard in a sound's place. */
  pronunciationHeardAs: string;
  /** Plays one word out of the learner's own take. */
  pronunciationPlayWord: (word: string) => string;
  pronunciationBreakUnexpected: string;
  pronunciationBreakMissing: string;
  /** Shown only past the caller's own monotone threshold; the SDK sets none. */
  pronunciationMonotone: string;
  /** Names the alphabet the phoneme symbols are written in. */
  pronunciationIpaNote: string;

  // ── Interactive video ──────────────────────────────────────────────────
  // Play, pause, mute, volume, speed, the progress bar's name and the time
  // readout are the `media` strings below: the same controls, the same words.
  /** Jump buttons, e.g. "Back 10 seconds". */
  videoBack: (seconds: number) => string;
  videoForward: (seconds: number) => string;
  /** The centre button once the video has ended. */
  videoReplay: string;
  /** The time readout flips between elapsed and remaining; these name what a press shows next. */
  videoShowRemaining: string;
  videoShowElapsed: string;
  /** The captions button, named by what a press does. */
  videoCaptionsShow: string;
  videoCaptionsHide: string;
  /** In the captions menu when a caption file could not be read. */
  videoCaptionsFailed: string;
  /** The same, for the second language: the first line keeps working. */
  videoSecondaryCaptionsFailed: string;
  /** A speed in the speed menu, e.g. "1.25×". */
  videoSpeedValue: (rate: number) => string;
  videoSettings: string;
  videoCaptionLanguage: string;
  /** The captions page's item, and page, for a second caption line under the first. */
  videoSecondCaptionLanguage: string;
  /**
   * The captions row of the settings menu when two languages show, from the
   * tracks' own labels: "English + Español". A translation may order them as its
   * language reads, but the first argument is always the upper line.
   */
  videoCaptionPair: (primary: string, secondary: string) => string;
  /** Announced when Shift + C finds no other language to show. */
  videoNoSecondLanguage: string;
  videoCaptionSize: string;
  videoCaptionSizeValue: (size: CaptionSize) => string;
  videoCaptionBackground: string;
  videoKeyboardShortcuts: string;
  videoShortcutList: string;
  /** Closes the shortcut list. */
  videoClose: string;
  /** A setting's state in the settings menu. */
  videoOn: string;
  videoOff: string;
  /** What each row of the shortcut list does. */
  videoShortcut: (action: VideoShortcutAction) => string;
  /** The button that opens the panel below the video, and its two tabs. */
  videoPanel: string;
  videoContents: string;
  videoTranscript: string;
  videoTranscriptSearch: string;
  videoTranscriptNoMatch: string;
  videoPictureInPicture: string;
  videoFullscreen: string;
  videoExitFullscreen: string;
  /**
   * Why the video will not play, by `MediaError.code` (1 aborted, 2 network,
   * 3 decode, 4 source), with 0 for anything else.
   */
  videoError: (code: number) => string;
  videoTryAgain: string;
  /** A quiz with no title of its own. */
  videoQuiz: string;
  /** Where the learner is inside a quiz, e.g. "Question 2 of 5". */
  videoQuestionProgress: (index: number, total: number) => string;
  /** A step of the quiz's step indicator, for assistive technology. */
  videoQuestionStep: (index: number, answered: boolean) => string;
  videoNextQuestion: string;
  videoContinue: string;
  videoSkipQuiz: string;
  videoRewatch: string;
  /** Exam mode, once a question is submitted: saved, not graded. */
  videoAnswerSaved: string;
  /** The end card, while an answer is still being stored or graded: why Finish waits. */
  videoAnswerPending: string;
  videoRequired: string;
  /** A quiz's progress in the contents panel and on the end screen. */
  videoQuizProgress: (answered: number, total: number) => string;
  /** Announced when a quiz opens. */
  videoQuizOpened: (time: string, questions: number) => string;
  /** Announced when a seek stopped at a required quiz. */
  videoHeldAtQuiz: (time: string) => string;
  /** Announced when a seek stopped at the furthest point reached. */
  videoHeldAhead: string;
  videoEnded: string;
  /** Practice end screen: questions answered, and the score. */
  videoEndScore: (answered: number, total: number, percent: number) => string;
  /** Exam end screen: questions answered, no score. */
  videoEndAnswered: (answered: number, total: number) => string;
  videoWatchAgain: string;
  videoFinish: string;

  // ── Authoring preview ──────────────────────────────────────────────────
  /**
   * `<ActivityPreview>`, in place of a draft that still has something missing.
   * Author-facing, not learner-facing — but an editor is translated too.
   */
  previewIncomplete: string;
  /** `<ActivityPreview>`, in place of a draft with something wrong in it. */
  previewInvalid: string;

  // ── Embedded media ────────────────────────────────────────────────────────
  /**
   * Accessible name of a provider iframe whose author supplied no `alt`.
   * `MediaSchema` requires `alt` on an embed, so validated content never
   * reaches this — but `validateActivity` is opt-in, and a screen-reader
   * learner meeting an unvalidated one should not meet it in English.
   */
  embeddedMedia: string;

  // ── Shared stimulus ────────────────────────────────────────────────────
  /**
   * Accessible name of the stimulus region when the author gave it no title.
   * Keyed by `Stimulus['kind']`, because "Recording" and "Passage" do not share
   * a gender or an article in every language.
   */
  stimulusKind: Record<Stimulus['kind'], string>;
  /**
   * How far the material carries, e.g. "Questions 3–8". Called with equal
   * `first` and `last` for a single question, so a translation can choose its
   * own singular rather than receive a pre-pluralised English one.
   */
  stimulusRange: (first: number, last: number) => string;

  // ── Error boundary ─────────────────────────────────────────────────────
  /** Production fallback when an activity throws during render. */
  activityFailed: string;
  /** The same, when the activity's title is known. */
  activityFailedNamed: (title: string) => string;
  /** Production fallback when the activity has no title to name. */
  activityFailedUnnamed: string;

  // ── Audio transport ────────────────────────────────────────────────────
  /**
   * The listening-paper transport. Shipped in 0.8.0 as its own `mediaStrings`
   * prop, which still works — this is the same shape, reachable from the one
   * provider so a consumer does not wire two mechanisms.
   */
  media: MediaTransportStrings;
}

/** A partial override, nested one level for {@link LkStrings.media}. */
export type LkStringsOverride = Partial<Omit<LkStrings, 'media' | 'stimulusKind'>> & {
  media?: Partial<MediaTransportStrings>;
  stimulusKind?: Partial<Record<Stimulus['kind'], string>>;
};

/**
 * English defaults, byte-identical to what every component rendered before the
 * strings surface existed. Supplying no override changes nothing on screen.
 */
export const DEFAULT_STRINGS: LkStrings = {
  submit: 'Submit',
  checkAnswers: 'Check answers',
  submitAnswers: 'Submit answers',

  scoreAnnouncement: (percent, passed) =>
    `Score ${percent}%. ${passed ? 'Passed.' : 'Not passed.'}`,
  answerSubmitted: 'Answer submitted.',
  notGradedYet: 'Not graded yet.',
  noGradeAvailable: 'No grade available.',

  showFeedback: 'Show feedback',
  hideFeedback: 'Hide feedback',

  blankLabel: (ordinal) => `Fill in blank ${ordinal}`,

  gapLabel: (ordinal) => `Choose the answer for gap ${ordinal}`,
  gapPlaceholder: 'Choose…',
  showHint: 'Show hint',
  hideHint: 'Hide hint',

  responseSubmitted:
    'Response submitted. It will be graded and your result will appear here later.',
  wordCount: (count) => `${count} ${count === 1 ? 'word' : 'words'}`,
  wordBounds: (min, max) => (min > 0 ? `${min}–${max} words` : `up to ${max} words`),
  notApplicable: 'Not applicable',
  awaitingHumanReview: 'This grade is awaiting review by a teacher.',
  awaitingGrade: 'Not graded yet. This response is waiting for its grade.',
  couldNotBeGraded: 'This response could not be graded.',

  previous: 'Previous',
  next: 'Next',
  questionProgress: (index, total) => `Question ${index} of ${total}`,
  unsupportedActivity: 'This activity type has no renderer. Supply one through the renderers prop.',

  dictationInputLabel: 'Type what you hear',
  dictationRecording: 'Recording',
  dictationSlowRecording: 'Slow recording',
  dictationRevealNextWord: (revealed, total) =>
    `Reveal the next word (${revealed} of ${total} shown)`,
  dictationResetHints: 'Reset hints',
  showSolution: 'Show solution',
  hideSolution: 'Hide solution',
  dictationSolutionLabel: 'Solution',
  dictationMarksLabel: 'Your answer, word by word',
  dictationDiffNote: 'Compared after ignoring case, punctuation and extra spaces.',
  dictationWordCorrect: (word) => `“${word}” is correct`,
  dictationWordWrong: (word, expected) => `“${word}” should be “${expected}”`,
  dictationWordMissing: (expected) => `“${expected}” is missing`,
  dictationWordExtra: (word) => `“${word}” is extra`,
  dictationLegendCorrect: 'Correct',
  dictationLegendWrong: 'Wrong',
  dictationLegendMissing: 'Missing',
  dictationLegendExtra: 'Extra',
  dictationNothingTyped: 'Nothing to compare: no words were entered.',
  dictationWordsSummary: (correct, total) =>
    `${correct} of ${total} ${total === 1 ? 'word' : 'words'} correct.`,

  readAloudModelRecording: 'Model recording',
  readAloudSlowRecording: 'Slow model recording',
  readAloudRecord: 'Record',
  readAloudStop: 'Stop recording',
  readAloudRerecord: 'Record again',
  readAloudYourRecording: 'Your recording',
  readAloudPlaybackUnavailable: 'Your recording cannot be played back on this page.',
  readAloudRecordingProgress: (seconds, maxSeconds) =>
    `Recording: ${seconds} of ${maxSeconds} seconds`,
  readAloudRecordingStarted: 'Recording started.',
  readAloudRecordingStopped: (seconds, maxSeconds) =>
    `Recording stopped. ${seconds} of ${maxSeconds} seconds recorded.`,
  readAloudTakesRemaining: (remaining, max) =>
    `${remaining} of ${max} recording${max === 1 ? '' : 's'} left`,
  readAloudSubmitWithoutRecording: 'Submit without recording',
  readAloudUploading: 'Sending your recording…',
  readAloudUploadFailed: 'Your recording could not be sent.',
  readAloudTryAgain: 'Try again',
  readAloudAssessing: 'Checking your pronunciation…',
  readAloudAssessmentUnavailable: 'Pronunciation feedback is not available for this activity.',
  readAloudNotHeard: 'We could not hear you. Record again somewhere quieter.',
  readAloudNotAssessed: 'This recording could not be assessed. Try recording it again.',
  readAloudAssessmentFailed: 'Your pronunciation could not be checked.',
  readAloudRecorderError: (reason) => {
    switch (reason) {
      case 'permission-denied':
        return 'This page is not allowed to use the microphone.';
      case 'no-device':
        return 'No microphone was found.';
      case 'unsupported':
        return 'This browser cannot record audio.';
      case 'too-short':
        return 'That recording was too short.';
      default:
        return 'The recording could not be made.';
    }
  },

  pronunciationFeedbackLabel: 'Pronunciation feedback',
  pronunciationDimension: (dimension) => {
    switch (dimension) {
      case 'accuracy':
        return 'Accuracy';
      case 'fluency':
        return 'Fluency';
      case 'completeness':
        return 'Completeness';
      default:
        return 'Intonation';
    }
  },
  pronunciationNotAssessed: 'Not assessed',
  pronunciationWordsLabel: 'Your reading, word by word',
  pronunciationLegend: (state) => {
    switch (state) {
      case 'correct':
        return 'Read correctly';
      case 'mispronounced':
        return 'Mispronounced';
      case 'omitted':
        return 'Not read';
      default:
        return 'Added';
    }
  },
  pronunciationWordCorrect: (word) => `“${word}” was read correctly`,
  pronunciationWordMispronounced: (word) => `“${word}” was mispronounced`,
  pronunciationWordOmitted: (word) => `“${word}” was not read`,
  pronunciationWordInserted: (word) => `“${word}” was added`,
  pronunciationWordDetails: (word) => `Details for “${word}”`,
  pronunciationSyllables: 'Syllables',
  pronunciationPhonemes: 'Sounds',
  pronunciationSyllableSpelling: (syllable, grapheme) => `${syllable} (spelled “${grapheme}”)`,
  pronunciationPhonemePosition: (ordinal) => `Sound ${ordinal}`,
  pronunciationHeardAs: 'Heard as',
  pronunciationPlayWord: (word) => `Play “${word}”`,
  pronunciationBreakUnexpected: 'There was an unexpected pause here.',
  pronunciationBreakMissing: 'A pause was expected here.',
  pronunciationMonotone: 'Your reading stayed on one note. Try varying your pitch.',
  pronunciationIpaNote: 'Sounds are written in the International Phonetic Alphabet.',
  videoBack: (seconds) => `Back ${seconds} seconds`,
  videoForward: (seconds) => `Forward ${seconds} seconds`,
  videoReplay: 'Replay',
  videoShowRemaining: 'Show time remaining',
  videoShowElapsed: 'Show time elapsed',
  videoCaptionsShow: 'Show captions',
  videoCaptionsHide: 'Hide captions',
  videoCaptionsFailed: 'Captions could not be loaded.',
  videoSecondaryCaptionsFailed: 'The second language could not be loaded.',
  videoSpeedValue: (rate) => (rate === 1 ? 'Normal' : `${rate}×`),
  videoSettings: 'Settings',
  videoCaptionLanguage: 'Captions',
  videoSecondCaptionLanguage: 'Second language',
  videoCaptionPair: (primary, secondary) => `${primary} + ${secondary}`,
  videoNoSecondLanguage: 'No second language for this video.',
  videoCaptionSize: 'Caption size',
  videoCaptionSizeValue: (size) =>
    size === 'small' ? 'Small' : size === 'large' ? 'Large' : 'Medium',
  videoCaptionBackground: 'Caption background',
  videoKeyboardShortcuts: 'Keyboard shortcuts',
  videoShortcutList: 'Shortcut list',
  videoClose: 'Close',
  videoOn: 'On',
  videoOff: 'Off',
  videoShortcut: (action) => {
    switch (action) {
      case 'play-pause':
        return 'Play or pause';
      case 'jump-10':
        return 'Back or forward 10 seconds';
      case 'jump-5':
        return 'Back or forward 5 seconds';
      case 'jump-1':
        return 'Back or forward 1 second';
      case 'frame':
        return 'Previous or next frame, while paused';
      case 'speed':
        return 'Slower or faster';
      case 'percent':
        return 'Jump to 0% – 90%';
      case 'start-end':
        return 'Start or end';
      case 'chapter':
        return 'Previous or next chapter or quiz';
      case 'mute':
        return 'Mute';
      case 'captions':
        return 'Captions';
      case 'secondary-captions':
        return 'Second caption language on/off';
      case 'transcript':
        return 'Transcript';
      case 'picture-in-picture':
        return 'Picture in picture';
      case 'fullscreen':
        return 'Fullscreen';
      default:
        return 'This list';
    }
  },
  videoPanel: 'Contents and transcript',
  videoContents: 'Contents',
  videoTranscript: 'Transcript',
  videoTranscriptSearch: 'Search the transcript',
  videoTranscriptNoMatch: 'No lines match.',
  videoPictureInPicture: 'Picture in picture',
  videoFullscreen: 'Fullscreen',
  videoExitFullscreen: 'Exit fullscreen',
  videoError: (code) =>
    code === 2
      ? 'The connection dropped while the video was loading.'
      : code === 3
        ? 'This video file could not be played.'
        : code === 4
          ? 'The video could not be loaded.'
          : 'The video stopped before it could play.',
  videoTryAgain: 'Try again',
  videoQuiz: 'Quiz',
  videoQuestionProgress: (index, total) => `Question ${index} of ${total}`,
  videoQuestionStep: (index, answered) => `Question ${index}${answered ? ', answered' : ''}`,
  videoNextQuestion: 'Next question',
  videoContinue: 'Continue video',
  videoSkipQuiz: 'Skip quiz',
  videoRewatch: 'Rewatch',
  videoAnswerSaved: 'Answer saved',
  videoAnswerPending: 'Saving your answer…',
  videoRequired: 'Required',
  videoQuizProgress: (answered, total) =>
    answered === total
      ? 'Answered'
      : answered === 0
        ? 'Not started'
        : `${answered} of ${total} answered`,
  videoQuizOpened: (time, questions) =>
    `Video paused. Quiz at ${time}, ${questions} question${questions === 1 ? '' : 's'}.`,
  videoHeldAtQuiz: (time) => `Finish the quiz at ${time} to continue.`,
  videoHeldAhead: 'You can rewind, but not skip ahead.',
  videoEnded: 'You reached the end',
  videoEndScore: (answered, total, percent) => `You answered ${answered} of ${total} · ${percent}%`,
  videoEndAnswered: (answered, total) => `You answered ${answered} of ${total} questions`,
  videoWatchAgain: 'Watch again',
  videoFinish: 'Finish',

  previewIncomplete: 'This activity is not finished yet, so it cannot be previewed.',
  previewInvalid: 'This activity has a problem to fix before it can be previewed.',

  embeddedMedia: 'Embedded media',

  stimulusKind: {
    text: 'Passage',
    audio: 'Recording',
    video: 'Video',
    image: 'Image',
    mixed: 'Material',
  },
  stimulusRange: (first, last) =>
    first === last ? `Question ${first}` : `Questions ${first}–${last}`,

  activityFailed: 'Activity failed to render',
  activityFailedNamed: (title) => `"${title}" could not be displayed.`,
  activityFailedUnnamed: 'This activity could not be displayed.',

  media: {
    play: 'Play',
    pause: 'Pause',
    preparing: 'Preparing…',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    speed: 'Playback speed',
    seek: 'Seek',
    timeValue: (elapsed, duration) => `${elapsed} of ${duration}`,
    playsRemaining: (remaining, max) =>
      `${remaining} of ${max} play${max === 1 ? '' : 's'} remaining`,
    noPlaysRemaining: 'No plays remaining',
    lastPlayConfirm: 'This is your last play. Start it now?',
    lastPlayStart: 'Start last play',
    lastPlayCancel: 'Not yet',
    seekBlocked: 'Rewinding is not available for this recording.',
    rateBlocked: 'Playback speed is fixed for this recording.',
    playFailed: 'The recording could not be started. Try again.',
  },
};

/**
 * Layers an override onto a base dictionary.
 *
 * Two levels deep and no further, because the shape is two levels deep. A
 * generic deep merge would silently accept a nested object where a function
 * belongs and fail at render instead of at the call site.
 */
export function mergeStrings(base: LkStrings, override?: LkStringsOverride): LkStrings {
  if (override === undefined) {
    return base;
  }
  const { media, stimulusKind, ...flat } = override;
  return {
    ...base,
    ...flat,
    stimulusKind: { ...base.stimulusKind, ...stimulusKind },
    media: { ...base.media, ...media },
  };
}
