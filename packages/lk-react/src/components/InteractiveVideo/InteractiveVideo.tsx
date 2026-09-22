'use client';

import {
  type ActivityResult,
  ActivitySchemaError,
  assertRedactedItemGroup,
  flattenSequence,
  type InteractionEvent,
  type ItemGroup,
  type ItemOutcome,
  type LearnerResponse,
  type MediaProgress,
  type MediaTimeline,
  type MediaTrack,
  readMediaProgress,
  type SequenceSlot,
  type SpeechAssessment,
  type ThemeTokens,
  type TimelineCue,
  validateItemGroup,
} from '@intellectif/lk-core';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import { isDevelopment } from '../_internal.js';
import { Dictation } from '../Dictation/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { ReadAloud } from '../ReadAloud/index.js';
import type { RecordingBinding } from '../ReadAloud/ReadAloud.js';
import { stopCaptureGroup } from '../shared/capture-registry.js';
import { type SequenceSlotChannel, SequenceSlotContext } from '../shared/sequence-slot.js';
import type {
  HtmlSanitizer,
  RenderableActivity,
  RenderMode,
  SequenceRecordingBinding,
  SequenceRecordingSlot,
} from '../types.js';
import { clock, nudgeSpeed } from './format.js';
import {
  AlertIcon,
  BackIcon,
  CaptionsIcon,
  ContentsIcon,
  ForwardIcon,
  FullscreenIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  ReplayIcon,
  SettingsIcon,
  VolumeIcon,
} from './icons.js';
import {
  ContentsPanel,
  type ContentsQuiz,
  EndScreen,
  SettingsMenu,
  ShortcutSheet,
  SpeedMenu,
} from './panels.js';
import {
  applyPreferenceChange,
  readStoredPreferences,
  rememberPreferences,
  resolvePreferences,
  sanitizePartialPreferences,
  type VideoPreferences,
} from './prefs.js';
import { crossedQuiz, limitResume, limitSeek, quizzesAtEnd } from './quiz-engine.js';
import { type MarkerState, Scrubber, type ScrubberMarker } from './Scrubber.js';
import { FRAME_SECONDS, JUMP_SECONDS } from './shortcuts.js';
import { resolveCaptionTracks, secondaryCandidates } from './tracks.js';
import { type Cue, cueIndexAt, parseWebVtt } from './vtt.js';

/** An item group whose items may be `redact()` projections: the client's view of an interactive video. */
export type RenderableItemGroup = ItemGroup<RenderableActivity>;

/** A question's place: its slot, as `<ActivitySequence>` reports it, plus the quiz it sits in. */
export interface InteractiveVideoSlot extends SequenceRecordingSlot {
  cueId: string;
}

/** What `onFinished` reports: every question, and how the learner left it. */
export interface InteractiveVideoSummary {
  slots: {
    slotId: string;
    activityId: string;
    cueId: string;
    status: 'answered' | 'skipped' | 'unreached';
  }[];
}

export interface InteractiveVideoProps {
  /** An item group with a video stimulus and a timeline. Redacted projections in exam and review. */
  group: RenderableItemGroup;
  renderMode?: RenderMode;
  /** Where to resume. Read through `readMediaProgress` and clamped; a required quiz is never skipped by a resume. */
  progress?: MediaProgress;
  /** At most every 5 s while playing, and on pause, seek, a quiz opening and the end. */
  onProgress?: (progress: MediaProgress) => void;
  /** Answers restored from the host, by slot id: `AttemptState.responses`. Read once, at mount. */
  responses?: Readonly<Record<string, LearnerResponse>>;
  /**
   * Questions the learner had already submitted, from
   * `AttemptState.submittedSlotIds`: mounted submitted, and counted as
   * answered, so a resumed video neither reopens a committed answer nor stops
   * again at a quiz already done. Read once, at mount.
   */
  submittedSlotIds?: readonly string[];
  /** Stored outcomes, by slot id: review, and the grades of questions graded later. */
  outcomes?: Readonly<Record<string, ItemOutcome>>;
  onSubmit?: (response: LearnerResponse, slot: InteractiveVideoSlot) => void;
  onActivityComplete?: (result: ActivityResult, slot: InteractiveVideoSlot) => void;
  /** Once per mount: when the learner presses Finish, or the video ends with every question answered. */
  onFinished?: (summary: InteractiveVideoSummary) => void;
  onInteraction?: (event: InteractionEvent) => void;
  /** Where read-aloud takes are stored and judged. Required when the video holds a read-aloud, outside review. */
  recordingBinding?: SequenceRecordingBinding;
  /** Speech assessments by slot id, so `review` shows the marks behind a read-aloud's grade. Read live. */
  assessments?: Readonly<Record<string, SpeechAssessment>>;
  /** A self-hosted copy of the read-aloud capture processor, for a strict Content-Security-Policy. */
  workletUrl?: string;
  /**
   * Fetches a caption file with the host's credentials and returns its WebVTT
   * text. Without it, the player fetches `src` itself — which a `<track>`
   * could not do for a URL that needs an Authorization header.
   */
  captionsLoader?: (track: MediaTrack) => Promise<string>;
  /**
   * FORCES preferences: each field given here overrides what the learner chose,
   * every time the video opens. For a starting point the learner can still
   * change — a language pair, say — pass `defaultPreferences` instead. Read when
   * the video opens; the learner's own changes after that hold.
   */
  preferences?: Partial<VideoPreferences>;
  /**
   * Preferences to start from, below what the learner chose in this browser:
   * each field applies until the learner changes it. A host that keeps the
   * learner's choice on their account passes it back here — on a new device
   * nothing is stored, so the account's choice applies; on the same device the
   * stored choice is that same choice. Read live: a value that arrives after
   * the video opens still fills every field nobody chose.
   */
  defaultPreferences?: Partial<VideoPreferences>;
  /**
   * After each change the learner makes — a menu, a shortcut, the volume, the
   * speed — with the preferences now in force and the fields that changed.
   * Never when the video opens, and never for `preferences`. The player still
   * remembers the change in this browser; this is for a host that keeps it on
   * the learner's account as well.
   */
  onPreferencesChange?: (next: VideoPreferences, change: Partial<VideoPreferences>) => void;
  /** A short label in the corner, such as a lesson code. */
  label?: string;
  /** Seed for the option order of multiple-choice and gap-select questions: the attempt id. */
  shuffleSeed?: string;
  locale?: string;
  strings?: LkStringsOverride;
  theme?: Partial<ThemeTokens>;
  sanitizeHtml?: HtmlSanitizer;
}

/** What distinguishes one video's content from another's: when it changes, the player starts over. */
function contentKey(group: RenderableItemGroup): string {
  try {
    return JSON.stringify([group.id, group.stimulus, group.items, group.timeline]);
  } catch {
    return String(group?.id);
  }
}

/**
 * An interactive video: a video that pauses at each quiz so the learner can
 * answer it inside the player, then carries on.
 *
 * The player state is keyed on the CONTENT, not on the object: a host that
 * rebuilds its activity objects on every render — `redactItemGroup` returns a
 * new one each call — must not restart the video or lose an answer. Only a
 * different video, different questions or a moved quiz starts it over.
 */
export function InteractiveVideo(props: InteractiveVideoProps) {
  const key = useMemo(() => contentKey(props.group), [props.group]);
  return <Player key={key} {...props} />;
}

/**
 * The next frame, or a timer where there are no frames: a page rendered in a
 * document that never paints — a test environment, a hidden iframe — must
 * still track the playhead and still announce.
 */
function onNextFrame(run: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }
  const timer = setTimeout(run, 33);
  return () => clearTimeout(timer);
}

/** A track as the cue cache knows it. */
function trackKey(track: MediaTrack): string {
  return `${track.kind}:${track.srclang}:${track.src}`;
}

const NO_CUES: Cue[] = [];

/**
 * One caption line's cues: loaded when its track changes, and never another
 * track's. A late answer for a track the line has since left is dropped — a
 * slow Spanish file must never land in a line that now shows Portuguese — and
 * until the new track's cues arrive the line shows nothing rather than the old
 * language, unless they are cached already.
 */
function useCaptionLine(
  track: MediaTrack | undefined,
  load: (track: MediaTrack) => Promise<Cue[]>,
  peek: (key: string) => Cue[] | undefined,
): { cues: Cue[]; failed: boolean } {
  const key = track === undefined ? undefined : trackKey(track);
  const [line, setLine] = useState<{ key?: string; cues: Cue[]; failed: boolean }>({
    cues: NO_CUES,
    failed: false,
  });
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(() => {
    const wanted = trackRef.current;
    if (key === undefined || wanted === undefined) {
      return;
    }
    let live = true;
    load(wanted).then(
      (cues) => {
        if (live) {
          setLine({ key, cues, failed: false });
        }
      },
      () => {
        if (live) {
          setLine({ key, cues: NO_CUES, failed: true });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [key, load]);
  if (key === undefined) {
    return { cues: NO_CUES, failed: false };
  }
  if (line.key === key) {
    return line;
  }
  return { cues: peek(key) ?? NO_CUES, failed: false };
}

/** What `video-captions-changed` reports: the language of each line on screen, or `null`. */
function captionsShown(
  tracks: readonly MediaTrack[],
  preferences: VideoPreferences,
): { srclang: string | null; secondary: string | null } {
  if (!preferences.captions) {
    return { srclang: null, secondary: null };
  }
  const shown = resolveCaptionTracks(tracks, preferences);
  return { srclang: shown.primary?.srclang ?? null, secondary: shown.secondary?.srclang ?? null };
}

/** One id per mount, for the quiz capture groups. Module-level: never a render-time `useId`. */
let playerCount = 0;

const ITEM_TYPES = new Set([
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'dictation',
  'read-aloud',
]);

function Player(props: InteractiveVideoProps) {
  const {
    renderMode = 'practice',
    onProgress,
    onSubmit,
    onActivityComplete,
    onFinished,
    onInteraction,
    recordingBinding,
    workletUrl,
    captionsLoader,
    label,
    shuffleSeed,
    locale,
    theme,
    sanitizeHtml,
  } = props;
  const strings = useLkStrings(props.strings);

  // The group this mount was made for. The key above changes whenever the
  // content does, so reading the first one keeps every question's `data`
  // object stable — a renderer resets when its data's identity changes.
  const group = useRef(props.group).current;
  const timeline: MediaTimeline = group.timeline ?? { cues: [] };
  const media = group.stimulus.media;
  const chapters = timeline.chapters ?? [];

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (group.timeline === undefined) {
      return new Error(
        `InteractiveVideo "${group.id}" was given an item group with no timeline. Give it a timeline — a list of quizzes, each at a moment of the video — or render it with <ActivitySequence>.`,
      );
    }
    if ((group as { redacted?: unknown }).redacted === true) {
      try {
        assertRedactedItemGroup(group as unknown as Parameters<typeof assertRedactedItemGroup>[0]);
      } catch (error) {
        return error as Error;
      }
      return null;
    }
    const result = validateItemGroup(group);
    return result.success ? null : new ActivitySchemaError('item-group', result.errors);
  }, [group]);

  const slots = useMemo(() => {
    try {
      return flattenSequence<RenderableActivity>([group]);
    } catch {
      return [];
    }
  }, [group]);

  // The quizzes the video can open: those with at least one question it can show.
  const cues = useMemo(
    () =>
      timeline.cues.filter((cue) =>
        slots.some((slot) => slot.group?.cue?.id === cue.id && ITEM_TYPES.has(slot.activity.type)),
      ),
    [timeline.cues, slots],
  );
  const slotsByCue = useMemo(() => {
    const byCue = new Map<string, SequenceSlot<RenderableActivity>[]>();
    for (const slot of slots) {
      const cueId = slot.group?.cue?.id;
      if (cueId !== undefined && ITEM_TYPES.has(slot.activity.type)) {
        byCue.set(cueId, [...(byCue.get(cueId) ?? []), slot]);
      }
    }
    return byCue;
  }, [slots]);

  const [playerId] = useState(() => {
    playerCount += 1;
    return `lk-iv-${playerCount}`;
  });

  // ── Preferences ──────────────────────────────────────────────────────
  // Four layers, field by field — see `resolvePreferences`. Storage is read
  // after mount, not during render: a server render has no storage, and a
  // first client render that read it would disagree with the server's.
  const forced = useRef(props.preferences).current;
  // The host's defaults, by content: a host that builds the object afresh on
  // every render must not have them re-resolved on every render.
  const defaultsKey = JSON.stringify(props.defaultPreferences ?? null);
  const defaults = useMemo<unknown>(() => JSON.parse(defaultsKey), [defaultsKey]);
  // What the learner changed while this video has been open.
  const chosen = useRef<Partial<VideoPreferences>>({});
  const [preferences, setPreferences] = useState<VideoPreferences>(() =>
    resolvePreferences({ force: forced, defaults: props.defaultPreferences }),
  );
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  useEffect(() => {
    setPreferences(
      resolvePreferences({
        force: forced,
        stored: readStoredPreferences(),
        defaults,
        chosen: chosen.current,
      }),
    );
  }, [forced, defaults]);

  // ── Answers ──────────────────────────────────────────────────────────
  // Read at mount, like `responses`: a later change is a different attempt,
  // and a different attempt is a remount with a new `key`.
  const [submitted] = useState(() => new Set(props.submittedSlotIds ?? []));
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => {
    const seeded = new Set<string>();
    for (const slot of slots) {
      if (
        submitted.has(slot.slotId) ||
        (props.outcomes !== undefined && Object.hasOwn(props.outcomes, slot.slotId))
      ) {
        seeded.add(slot.slotId);
      }
    }
    return seeded;
  });
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  const scores = useRef(new Map<string, number>());
  const markAnswered = useCallback((slotId: string) => {
    setAnswered((previous) => {
      if (previous.has(slotId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(slotId);
      answeredRef.current = next;
      return next;
    });
  }, []);
  const finished = useCallback(
    (cueId: string): boolean =>
      (slotsByCue.get(cueId) ?? []).every((slot) => answeredRef.current.has(slot.slotId)),
    [slotsByCue],
  );

  // ── Playback state ───────────────────────────────────────────────────
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const quizHeadingRef = useRef<HTMLHeadingElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const [menu, setMenu] = useState<'speed' | 'settings' | null>(null);
  const [sheet, setSheet] = useState(false);
  const [panelTab, setPanelTab] = useState<'contents' | 'transcript'>('contents');
  const [chromeShown, setChromeShown] = useState(true);
  const [focusInChrome, setFocusInChrome] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousTime = useRef(0);
  const furthest = useRef(0);
  const [furthestShown, setFurthestShown] = useState(0);
  const lastProgressAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // How the last press arrived: a tap on a playing video brings the controls
  // back first, where a click pauses it.
  const lastPointer = useRef('mouse');
  const finishedOnce = useRef(false);

  // ── Quizzes ──────────────────────────────────────────────────────────
  const [openQuiz, setOpenQuiz] = useState<{ cueId: string; step: number } | null>(null);
  const openQuizRef = useRef(openQuiz);
  openQuizRef.current = openQuiz;
  const [mounted, setMounted] = useState<ReadonlySet<string>>(new Set());
  // Quizzes closed with Continue or Skip in this session: never reopened by playback.
  const handled = useRef(new Set<string>());

  const announce = useCallback((text: string) => {
    // Cleared first, so the same sentence twice is announced twice.
    setAnnouncement('');
    onNextFrame(() => setAnnouncement(text));
  }, []);
  const emit = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      onInteraction?.({
        type,
        activityId: group.id,
        timestamp: Date.now(),
        ...(payload !== undefined ? { payload } : {}),
      } as InteractionEvent);
    },
    [onInteraction, group.id],
  );
  const reportProgress = useCallback(
    (force: boolean) => {
      const video = videoRef.current;
      if (onProgress === undefined || video === null) {
        return;
      }
      const now = Date.now();
      if (!force && now - lastProgressAt.current < 5000) {
        return;
      }
      lastProgressAt.current = now;
      onProgress({ progressVersion: '1.0', at: video.currentTime, furthest: furthest.current });
    },
    [onProgress],
  );

  const quizTitle = useCallback(
    (cue: TimelineCue): string => cue.title ?? strings.videoQuiz,
    [strings.videoQuiz],
  );

  const openAt = useCallback(
    (cue: TimelineCue) => {
      const video = videoRef.current;
      const quizSlots = slotsByCue.get(cue.id) ?? [];
      if (video !== null) {
        video.pause();
        if (Math.abs(video.currentTime - cue.at) > 0.25 && cue.at <= (video.duration || cue.at)) {
          video.currentTime = Math.min(cue.at, video.duration || cue.at);
        }
        previousTime.current = cue.at;
        // A quiz cannot draw over native fullscreen or a picture-in-picture
        // window: both hold only the video. Leave them, then show the quiz.
        const webkit = video as HTMLVideoElement & {
          webkitDisplayingFullscreen?: boolean;
          webkitExitFullscreen?: () => void;
        };
        if (webkit.webkitDisplayingFullscreen) {
          webkit.webkitExitFullscreen?.();
        }
        if (typeof document !== 'undefined' && document.pictureInPictureElement === video) {
          void document.exitPictureInPicture?.().catch(() => undefined);
        }
      }
      const firstOpen = quizSlots.findIndex((slot) => !answeredRef.current.has(slot.slotId));
      setMenu(null);
      setSheet(false);
      setEnded(false);
      setMounted((previous) => (previous.has(cue.id) ? previous : new Set([...previous, cue.id])));
      setOpenQuiz({ cueId: cue.id, step: firstOpen === -1 ? 0 : firstOpen });
      announce(strings.videoQuizOpened(clock(cue.at), quizSlots.length));
      emit('video-quiz-opened', { cueId: cue.id, at: cue.at });
      reportProgress(true);
    },
    [slotsByCue, announce, strings, emit, reportProgress],
  );

  // Focus moves into the quiz when it opens, to its heading.
  useEffect(() => {
    if (openQuiz !== null) {
      quizHeadingRef.current?.focus();
    }
  }, [openQuiz?.cueId, openQuiz]);

  const closeQuiz = useCallback(
    (how: 'continue' | 'skip' | 'rewatch') => {
      const open = openQuizRef.current;
      if (open === null) {
        return;
      }
      const cue = cues.find((candidate) => candidate.id === open.cueId);
      // Whatever was being recorded or played inside the quiz stops with it:
      // each question's pane does that as it is hidden.
      setOpenQuiz(null);
      const video = videoRef.current;
      if (how === 'rewatch' && cue !== undefined && video !== null) {
        const earlier = [...cues.map((c) => c.at), ...chapters.map((c) => c.at)]
          .filter((at) => at < cue.at - 0.5)
          .sort((a, b) => b - a)[0];
        const to = earlier ?? 0;
        video.currentTime = to;
        previousTime.current = to;
        setCurrent(to);
      } else if (cue !== undefined) {
        handled.current.add(cue.id);
        emit(how === 'skip' ? 'video-quiz-skipped' : 'video-quiz-closed', { cueId: cue.id });
      }
      playButtonRef.current?.focus();
      if (
        video !== null &&
        !(video.ended || (duration > 0 && video.currentTime >= duration - 0.05))
      ) {
        void video.play().catch(() => setPlaying(false));
      } else if (video !== null) {
        // At the end: a quiz placed at the end may be followed by another.
        const next = quizzesAtEnd(cues, duration, handled.current)[0];
        if (next !== undefined) {
          openAt(next);
        } else {
          setEnded(true);
        }
      }
    },
    [cues, chapters, emit, duration, openAt],
  );

  // ── The clock ────────────────────────────────────────────────────────
  const onTick = useCallback(
    (now: number) => {
      const before = previousTime.current;
      previousTime.current = now;
      if (now > furthest.current) {
        furthest.current = now;
      }
      if (openQuizRef.current !== null || scrubbing) {
        return;
      }
      const crossed = crossedQuiz(cues, before, now, handled.current);
      if (crossed !== undefined) {
        openAt(crossed);
      }
    },
    [cues, scrubbing, openAt],
  );

  // Frames, not `timeupdate`: `timeupdate` fires about four times a second,
  // which lurches the bar and — at 2.5× — lets a quiz slip 0.6 s past its mark.
  useEffect(() => {
    if (!playing || scrubbing) {
      return;
    }
    let cancel = () => {};
    const tick = (): void => {
      const video = videoRef.current;
      if (video !== null) {
        setCurrent(video.currentTime);
        setBuffered(bufferedAhead(video));
        onTick(video.currentTime);
        if (furthest.current > furthestShown + 1) {
          setFurthestShown(furthest.current);
        }
        reportProgress(false);
      }
      cancel = onNextFrame(tick);
    };
    cancel = onNextFrame(tick);
    return () => cancel();
  }, [playing, scrubbing, onTick, reportProgress, furthestShown]);

  // ── Seeking ──────────────────────────────────────────────────────────
  const seek = useCallback(
    (to: number) => {
      const video = videoRef.current;
      if (video === null || duration <= 0) {
        return;
      }
      const from = video.currentTime;
      const target = Math.min(Math.max(0, to), duration);
      const limited =
        renderMode === 'review'
          ? { at: target }
          : limitSeek(timeline, from, target, furthest.current, finished);
      video.currentTime = limited.at;
      // A seek never opens a quiz by crossing it; only playback does.
      previousTime.current = limited.at;
      setCurrent(limited.at);
      setEnded(false);
      emit('video-seeked', { from, to: limited.at, clamped: limited.hold !== undefined });
      if (limited.hold?.kind === 'required') {
        // Opened first, so the reason is the sentence that is heard: the
        // quiz's own announcement would otherwise replace it.
        openAt(limited.hold.cue);
        announce(strings.videoHeldAtQuiz(clock(limited.hold.cue.at)));
      } else if (limited.hold?.kind === 'no-skip-ahead') {
        announce(strings.videoHeldAhead);
      }
      reportProgress(true);
    },
    [duration, renderMode, timeline, finished, emit, announce, strings, openAt, reportProgress],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    if (ended) {
      setEnded(false);
      handled.current.clear();
      video.currentTime = 0;
      previousTime.current = -1;
      void video.play().catch(() => setPlaying(false));
      return;
    }
    if (video.paused) {
      // The first play: a quiz at 0 opens before anything plays.
      if (video.currentTime === 0 && previousTime.current <= 0) {
        const atStart = crossedQuiz(cues, -1, 0, handled.current);
        if (atStart !== undefined) {
          previousTime.current = 0;
          openAt(atStart);
          return;
        }
      }
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [ended, cues, openAt]);

  // ── Captions ─────────────────────────────────────────────────────────
  const tracks: MediaTrack[] = useMemo(() => {
    if (media?.tracks !== undefined && media.tracks.length > 0) {
      return media.tracks.filter(
        (track) => track.kind === 'captions' || track.kind === 'subtitles',
      );
    }
    return media?.captionsUrl !== undefined
      ? [
          {
            kind: 'captions',
            src: media.captionsUrl,
            srclang: locale ?? 'en',
            label: strings.videoCaptionLanguage,
          },
        ]
      : [];
  }, [media, locale, strings.videoCaptionLanguage]);
  const { primary: primaryTrack, secondary: secondaryTrack } = useMemo(
    () =>
      resolveCaptionTracks(tracks, {
        captionLanguage: preferences.captionLanguage,
        secondaryCaptionLanguage: preferences.secondaryCaptionLanguage,
      }),
    [tracks, preferences.captionLanguage, preferences.secondaryCaptionLanguage],
  );
  const loaderRef = useRef(captionsLoader);
  loaderRef.current = captionsLoader;
  // Parsed cues per track, for the life of the mount: switching languages back
  // and forth never refetches. The promise while a file loads — so a swap, which
  // asks for a file both lines want, makes one request — and the cues once it
  // has. A failure is forgotten, so coming back to that language tries again.
  const loading = useRef(new Map<string, Promise<Cue[]>>());
  const loaded = useRef(new Map<string, Cue[]>());
  const loadCues = useCallback((track: MediaTrack): Promise<Cue[]> => {
    const key = trackKey(track);
    const pending = loading.current.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const request = Promise.resolve()
      .then(() =>
        loaderRef.current
          ? loaderRef.current(track)
          : fetch(track.src, { credentials: 'same-origin' }).then((response) => {
              if (!response.ok) {
                throw new Error(String(response.status));
              }
              return response.text();
            }),
      )
      .then((text) => {
        const parsed = parseWebVtt(text);
        if (parsed.length === 0) {
          throw new Error('The caption file held no cues.');
        }
        loaded.current.set(key, parsed);
        return parsed;
      });
    loading.current.set(key, request);
    request.catch(() => {
      loading.current.delete(key);
    });
    return request;
  }, []);
  const peekCues = useCallback((key: string) => loaded.current.get(key), []);
  const primaryLine = useCaptionLine(primaryTrack, loadCues, peekCues);
  const secondaryLine = useCaptionLine(secondaryTrack, loadCues, peekCues);
  const primaryCues = primaryLine.cues;
  const secondaryCues = secondaryLine.cues;
  // Per line: a second language that failed never takes the first one with it.
  const captionsFailed = { primary: primaryLine.failed, secondary: secondaryLine.failed };
  const hasCaptions = primaryCues.length > 0 || secondaryCues.length > 0;
  // The transcript and the preview on the bar are the first line's.
  const hasTranscript = primaryCues.length > 0;
  const activeCueIndex = useMemo(() => cueIndexAt(primaryCues, current), [primaryCues, current]);
  const secondaryCueIndex = useMemo(
    () => cueIndexAt(secondaryCues, current),
    [secondaryCues, current],
  );
  const spoilerLimit =
    timeline.navigation === 'no-skip-ahead' && renderMode !== 'review'
      ? Math.max(furthestShown, current)
      : Number.POSITIVE_INFINITY;

  // ── Changing preferences ─────────────────────────────────────────────
  const onPreferencesChangeRef = useRef(props.onPreferencesChange);
  onPreferencesChangeRef.current = props.onPreferencesChange;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  /** The last second language the learner had, for Shift + C to bring back. */
  const lastSecondary = useRef<string | null>(null);
  /**
   * A change the learner made: applied, remembered in this browser, handed to
   * the host, and — when it changes the captions on screen — reported.
   */
  const changePreferences = useCallback(
    (change: Partial<VideoPreferences>) => {
      const previous = preferencesRef.current;
      const next = applyPreferenceChange(previous, change);
      if (previous.secondaryCaptionLanguage !== null) {
        lastSecondary.current = previous.secondaryCaptionLanguage;
      }
      chosen.current = { ...chosen.current, ...change };
      preferencesRef.current = next;
      setPreferences(next);
      rememberPreferences(change);
      onPreferencesChangeRef.current?.(next, change);
      const before = captionsShown(tracksRef.current, previous);
      const after = captionsShown(tracksRef.current, next);
      if (before.srclang !== after.srclang || before.secondary !== after.secondary) {
        emit('video-captions-changed', after);
      }
    },
    [emit],
  );

  /**
   * A first language picked from the menu. Picking the language the second
   * line shows swaps the two — English + Español becomes Español + English —
   * rather than silently dropping one.
   */
  const chooseCaptionTrack = (track: MediaTrack): void => {
    const swaps =
      primaryTrack !== undefined &&
      secondaryTrack !== undefined &&
      track.srclang.toLowerCase() === secondaryTrack.srclang.toLowerCase();
    changePreferences({
      captions: true,
      captionLanguage: track.srclang,
      ...(swaps ? { secondaryCaptionLanguage: primaryTrack.srclang } : {}),
    });
  };

  /** A second language picked from the menu, or none. Picking one shows the captions. */
  const chooseSecondaryTrack = (track: MediaTrack | null): void => {
    changePreferences(
      track === null
        ? { secondaryCaptionLanguage: null }
        : { secondaryCaptionLanguage: track.srclang, captions: true },
    );
  };

  /**
   * Shift + C. With a second line showing, it goes; with one chosen but the
   * captions off, the pair comes back; otherwise a second line comes on — the
   * last language the learner had, else the host's suggestion, else the first
   * other language the video has. Pressing the key is asking for a second
   * line, so that first language is the learner's choice, not a fallback the
   * player made for them. With no other language at all, it says so and
   * changes nothing.
   */
  const toggleSecondary = (): void => {
    if (secondaryTrack !== undefined) {
      changePreferences(
        preferences.captions ? { secondaryCaptionLanguage: null } : { captions: true },
      );
      return;
    }
    const wanted = [
      lastSecondary.current,
      preferences.secondaryCaptionLanguage,
      sanitizePartialPreferences(defaults).secondaryCaptionLanguage ?? null,
      secondaryCandidates(tracks, primaryTrack)[0]?.srclang ?? null,
    ];
    for (const language of wanted) {
      if (language === null) {
        continue;
      }
      const { secondary } = resolveCaptionTracks(tracks, {
        captionLanguage: preferences.captionLanguage,
        secondaryCaptionLanguage: language,
      });
      if (secondary !== undefined) {
        changePreferences({ secondaryCaptionLanguage: secondary.srclang, captions: true });
        return;
      }
    }
    announce(strings.videoNoSecondLanguage);
  };

  // ── Element state React does not own ─────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (video !== null) {
      video.playbackRate = preferences.speed;
      video.volume = preferences.volume;
      video.muted = preferences.muted;
    }
  }, [preferences.speed, preferences.volume, preferences.muted]);

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // React has no props for these two events.
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    const enter = (): void => {
      setPictureInPicture(true);
      emit('video-pip-changed', { on: true });
    };
    const leave = (): void => {
      setPictureInPicture(false);
      emit('video-pip-changed', { on: false });
    };
    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', leave);
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', leave);
    };
  }, [emit]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
      }
    },
    [],
  );

  const revealChrome = useCallback(() => {
    setChromeShown(true);
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => setChromeShown(false), 2400);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (typeof document === 'undefined' || shell === null) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (
      typeof shell.requestFullscreen === 'function' &&
      document.fullscreenEnabled !== false
    ) {
      void shell.requestFullscreen().catch(() => undefined);
    } else {
      // iPhone: only the video element can go fullscreen, natively. A quiz
      // takes it back out before it opens.
      video?.webkitEnterFullscreen?.();
    }
    emit('video-fullscreen-changed');
  }, [emit]);

  const pictureInPictureSupported =
    typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
  const togglePictureInPicture = useCallback(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else {
      void video.requestPictureInPicture?.().catch(() => undefined);
    }
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────
  const jumpPoints = useMemo(
    () =>
      [...new Set([...chapters.map((c) => c.at), ...cues.map((c) => c.at)])].sort((a, b) => a - b),
    [chapters, cues],
  );
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // A quiz owns the keyboard while it is open: a letter typed into an answer
    // must never scrub the video.
    if (openQuiz !== null || !preferences.shortcuts) {
      return;
    }
    const target = event.target as HTMLElement;
    if (
      target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      (target.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter'))
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const video = videoRef.current;
    const key = event.key;
    const done = (): void => {
      event.preventDefault();
      revealChrome();
    };
    if (/^[0-9]$/.test(key)) {
      done();
      seek((Number(key) / 10) * duration);
      return;
    }
    switch (key) {
      case ' ':
      case 'k':
      case 'K':
        done();
        togglePlay();
        return;
      case 'j':
      case 'J':
        done();
        seek(current - JUMP_SECONDS);
        return;
      case 'l':
      case 'L':
        done();
        seek(current + JUMP_SECONDS);
        return;
      case 'ArrowLeft':
        done();
        seek(current - (event.shiftKey ? 1 : 5));
        return;
      case 'ArrowRight':
        done();
        seek(current + (event.shiftKey ? 1 : 5));
        return;
      case 'Home':
        done();
        seek(0);
        return;
      case 'End':
        done();
        seek(duration);
        return;
      case ',':
      case '.':
        done();
        video?.pause();
        seek(current + (key === ',' ? -FRAME_SECONDS : FRAME_SECONDS));
        return;
      case '<':
      case '>':
        done();
        changePreferences({ speed: nudgeSpeed(preferences.speed, key === '<' ? -1 : 1) });
        return;
      case '[': {
        done();
        const previous = [...jumpPoints].reverse().find((at) => at < current - 1);
        seek(previous ?? 0);
        return;
      }
      case ']': {
        done();
        const next = jumpPoints.find((at) => at > current + 0.5);
        if (next !== undefined) {
          seek(next);
        }
        return;
      }
      case 'm':
      case 'M':
        done();
        changePreferences({ muted: !preferences.muted });
        return;
      case 'c':
      case 'C':
        // Shift + C is the second line; C is both lines together.
        if (event.shiftKey) {
          done();
          toggleSecondary();
        } else if (hasCaptions) {
          done();
          changePreferences({ captions: !preferences.captions });
        }
        return;
      case 't':
      case 'T':
        if (hasTranscript) {
          done();
          setPanelTab('transcript');
          changePreferences({ panel: !(preferences.panel && panelTab === 'transcript') });
        }
        return;
      case 'p':
      case 'P':
        if (pictureInPictureSupported) {
          done();
          togglePictureInPicture();
        }
        return;
      case 'f':
      case 'F':
        done();
        toggleFullscreen();
        return;
      case '?':
        done();
        setSheet((open) => !open);
        return;
      default:
        return;
    }
  };

  // ── Quiz status, for markers, contents and the end screen ────────────
  const quizzes: ContentsQuiz[] = cues.map((cue) => {
    const quizSlots = slotsByCue.get(cue.id) ?? [];
    const count = quizSlots.filter((slot) => answered.has(slot.slotId)).length;
    return {
      id: cue.id,
      at: cue.at,
      title: quizTitle(cue),
      answered: count,
      total: quizSlots.length,
      // In review the attempt is over: nothing is required of the learner any
      // more, in the list or on the bar.
      required: cue.required === true && renderMode !== 'review',
      state: markerState(quizSlots, answered, renderMode, props.outcomes),
    };
  });
  const markers: ScrubberMarker[] = quizzes.map((quiz) => ({
    id: quiz.id,
    at: quiz.at,
    label: `${quiz.title} · ${strings.videoQuizProgress(quiz.answered, quiz.total)}`,
    state: quiz.state,
    required: quiz.required,
  }));
  const totalQuestions = quizzes.reduce((sum, quiz) => sum + quiz.total, 0);
  const answeredCount = quizzes.reduce((sum, quiz) => sum + quiz.answered, 0);
  const graded = [...scores.current.values()];
  const percent =
    graded.length === 0
      ? null
      : Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100);

  const summary = useCallback((): InteractiveVideoSummary => {
    return {
      slots: slots
        .filter((slot) => slot.group?.cue !== undefined)
        .map((slot) => {
          const cueId = slot.group?.cue?.id as string;
          return {
            slotId: slot.slotId,
            activityId: slot.activity.id,
            cueId,
            status: answeredRef.current.has(slot.slotId)
              ? ('answered' as const)
              : handled.current.has(cueId)
                ? ('skipped' as const)
                : ('unreached' as const),
          };
        }),
    };
  }, [slots]);
  const finish = useCallback(() => {
    if (finishedOnce.current) {
      return;
    }
    finishedOnce.current = true;
    onFinished?.(summary());
  }, [onFinished, summary]);
  // The video ended with every question answered: that is finishing too.
  useEffect(() => {
    if (
      ended &&
      totalQuestions > 0 &&
      answeredCount === totalQuestions &&
      renderMode !== 'review'
    ) {
      finish();
    }
  }, [ended, totalQuestions, answeredCount, renderMode, finish]);

  // ── Rendering the questions ──────────────────────────────────────────
  const slotBindings = useMemo(() => {
    const bindings = new Map<string, RecordingBinding>();
    if (recordingBinding === undefined) {
      return bindings;
    }
    // As the pager builds them: called on the binding, so a binding written as
    // a class keeps its `this`, and `assess` / `playbackUrl` copied only when
    // supplied — a binding carrying `assess: undefined` is one a take would call.
    const { assess, playbackUrl } = recordingBinding;
    for (const slot of slots) {
      const place: SequenceRecordingSlot = {
        slotId: slot.slotId,
        index: slot.index,
        activityId: slot.activity.id,
      };
      bindings.set(slot.slotId, {
        upload: (take) => recordingBinding.upload(take, place),
        ...(assess !== undefined
          ? { assess: (ref) => assess.call(recordingBinding, ref, place) }
          : {}),
        ...(playbackUrl !== undefined
          ? { playbackUrl: (ref) => playbackUrl.call(recordingBinding, ref, place) }
          : {}),
      });
    }
    return bindings;
  }, [slots, recordingBinding]);

  const renderQuestion = (slot: SequenceSlot<RenderableActivity>, cueId: string): ReactNode => {
    const activity = slot.activity;
    const place: InteractiveVideoSlot = {
      slotId: slot.slotId,
      index: slot.index,
      activityId: activity.id,
      cueId,
    };
    const restored =
      props.responses !== undefined && Object.hasOwn(props.responses, slot.slotId)
        ? props.responses[slot.slotId]
        : undefined;
    const outcome =
      props.outcomes !== undefined && Object.hasOwn(props.outcomes, slot.slotId)
        ? props.outcomes[slot.slotId]
        : undefined;
    const common = {
      renderMode,
      ...(restored !== undefined ? { defaultValue: restored } : {}),
      ...(submitted.has(slot.slotId) ? { defaultSubmitted: true } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
      onSubmit: (response: LearnerResponse) => {
        markAnswered(slot.slotId);
        onSubmit?.(response, place);
      },
      onComplete: (result: ActivityResult) => {
        markAnswered(slot.slotId);
        if (result.maxScore > 0) {
          scores.current.set(slot.slotId, result.score / result.maxScore);
        }
        onActivityComplete?.(result, place);
      },
      ...(onInteraction !== undefined ? { onInteraction } : {}),
      ...(sanitizeHtml !== undefined ? { sanitizeHtml } : {}),
      ...(props.strings !== undefined ? { strings: props.strings } : {}),
      ...(locale !== undefined ? { locale } : {}),
    };
    let question: ReactNode;
    switch (activity.type) {
      case 'multiple-choice':
        question = (
          <MultipleChoice
            data={activity}
            {...common}
            {...(shuffleSeed !== undefined ? { shuffleSeed } : {})}
          />
        );
        break;
      case 'fill-in-the-blanks':
        question = <FillInTheBlanks data={activity} {...common} />;
        break;
      case 'gap-select':
        question = (
          <GapSelect
            data={activity}
            {...common}
            {...(shuffleSeed !== undefined ? { shuffleSeed } : {})}
          />
        );
        break;
      case 'dictation':
        question = <Dictation data={activity} {...common} />;
        break;
      case 'read-aloud': {
        const binding = slotBindings.get(slot.slotId);
        const assessment =
          props.assessments !== undefined && Object.hasOwn(props.assessments, slot.slotId)
            ? props.assessments[slot.slotId]
            : undefined;
        question = (
          <ReadAloud
            data={activity}
            {...common}
            {...(binding !== undefined ? { recordingBinding: binding } : {})}
            {...(assessment !== undefined ? { assessment } : {})}
            {...(workletUrl !== undefined ? { workletUrl } : {})}
          />
        );
        break;
      }
      default:
        question = null;
    }
    return question;
  };
  // One channel per question for the life of the player: a recorder joins its
  // capture group once, and a new object each render would re-render it.
  const channels = useRef(new Map<string, SequenceSlotChannel>());
  const channelFor = (slotId: string): SequenceSlotChannel => {
    let channel = channels.current.get(slotId);
    if (channel === undefined) {
      channel = { captureGroup: `${playerId}::${slotId}`, takeState: () => undefined };
      channels.current.set(slotId, channel);
    }
    return channel;
  };

  if (devError !== null) {
    throw devError;
  }

  // ── The quiz panel ───────────────────────────────────────────────────
  const openCue = openQuiz === null ? undefined : cues.find((cue) => cue.id === openQuiz.cueId);
  const openSlots = openCue === undefined ? [] : (slotsByCue.get(openCue.id) ?? []);
  const step = openQuiz?.step ?? 0;
  const stepSlot = openSlots[step];
  const stepAnswered = stepSlot !== undefined && answered.has(stepSlot.slotId);
  const lastStep = step >= openSlots.length - 1;
  const required = openCue?.required === true && renderMode !== 'review';
  const canAdvance = !required || stepAnswered;
  const goToStep = (next: number): void => {
    setOpenQuiz((open) => (open === null ? open : { ...open, step: next }));
    const slot = openSlots[next];
    if (slot !== undefined && openCue !== undefined) {
      announce(strings.videoQuestionProgress(next + 1, openSlots.length));
      emit('video-quiz-question-shown', { cueId: openCue.id, slotId: slot.slotId });
    }
  };

  // Never over a quiz, the end card or a failure: the captions belong to the
  // video, and nothing is being spoken behind any of the three. Each line shows
  // its own cue — the two tracks need not share timings — and a line with
  // nothing to say at this moment is not drawn, while the other stays.
  const captionsHidden = !preferences.captions || openQuiz !== null || ended || errorCode !== null;
  const primaryText = captionsHidden ? undefined : primaryCues[activeCueIndex]?.text;
  const secondaryText = captionsHidden ? undefined : secondaryCues[secondaryCueIndex]?.text;
  const chromeVisible =
    !playing ||
    chromeShown ||
    menu !== null ||
    scrubbing ||
    focusInChrome ||
    sheet ||
    openQuiz !== null;
  const volumeLevel =
    preferences.muted || preferences.volume === 0
      ? 'muted'
      : preferences.volume < 0.5
        ? 'low'
        : 'high';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the player's keyboard shortcuts, scoped to the player; each is also a button
    <div
      ref={shellRef}
      className="lk-iv"
      tabIndex={-1}
      lang={locale}
      style={theme as CSSProperties | undefined}
      data-render-mode={renderMode}
      data-quiz-open={openQuiz !== null || undefined}
      data-fullscreen={fullscreen || undefined}
      data-chrome={chromeVisible ? 'shown' : 'hidden'}
      onKeyDown={onKeyDown}
    >
      <div
        className="lk-iv-stage"
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') {
            revealChrome();
          }
        }}
        onPointerLeave={() => {
          if (playing) {
            setChromeShown(false);
          }
        }}
      >
        <video
          ref={videoRef}
          className="lk-iv-video"
          src={media?.url}
          {...(media?.poster !== undefined ? { poster: media.poster } : {})}
          preload="metadata"
          playsInline
          aria-label={group.title ?? media?.alt}
          onClick={() => {
            if (lastPointer.current === 'touch' && !chromeVisible) {
              revealChrome();
              return;
            }
            togglePlay();
          }}
          onDoubleClick={toggleFullscreen}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
            revealChrome();
            emit('video-played', { at: videoRef.current?.currentTime ?? 0 });
          }}
          onPause={() => {
            setPlaying(false);
            emit('video-paused', { at: videoRef.current?.currentTime ?? 0 });
            reportProgress(true);
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onProgress={(event) => setBuffered(bufferedAhead(event.currentTarget))}
          onTimeUpdate={(event) => {
            // The paused case, where the frame loop is off but a media key or
            // the picture-in-picture window still moves the playhead.
            if (!playing && !scrubbing) {
              setCurrent(event.currentTarget.currentTime);
            }
          }}
          onRateChange={(event) =>
            emit('video-rate-changed', { rate: event.currentTarget.playbackRate })
          }
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const length = Number.isFinite(video.duration) ? video.duration : 0;
            setDuration(length);
            video.playbackRate = preferences.speed;
            video.volume = preferences.volume;
            video.muted = preferences.muted;
            const stored = readMediaProgress(props.progress, length);
            if (stored !== null) {
              const at =
                renderMode === 'review' ? stored.at : limitResume(timeline, stored.at, finished);
              furthest.current = Math.max(stored.furthest, at);
              setFurthestShown(furthest.current);
              video.currentTime = at;
              previousTime.current = at;
              setCurrent(at);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            setCurrent(duration);
            emit('video-ended');
            reportProgress(true);
            const atEnd = quizzesAtEnd(cues, duration, handled.current);
            const first = atEnd[0];
            if (first !== undefined) {
              openAt(first);
            } else {
              setEnded(true);
            }
          }}
          onError={(event) => {
            setWaiting(false);
            setErrorCode(event.currentTarget.error?.code ?? 0);
          }}
        />

        {label !== undefined ? <span className="lk-iv-label">{label}</span> : null}

        {primaryText !== undefined || secondaryText !== undefined ? (
          // The lines keep `.lk-iv-caption`, `data-size` and `data-background`
          // as well, so a stylesheet written against 15.x still matches them.
          <div
            className="lk-iv-captions"
            data-size={preferences.captionSize}
            data-background={preferences.captionBackground || undefined}
          >
            {primaryText !== undefined ? (
              <div
                className="lk-iv-caption"
                data-role="primary"
                data-size={preferences.captionSize}
                data-background={preferences.captionBackground || undefined}
                lang={primaryTrack?.srclang}
                dir="auto"
              >
                <span>{primaryText}</span>
              </div>
            ) : null}
            {secondaryText !== undefined ? (
              <div
                className="lk-iv-caption"
                data-role="secondary"
                data-size={preferences.captionSize}
                data-background={preferences.captionBackground || undefined}
                lang={secondaryTrack?.srclang}
                dir="auto"
              >
                <span>{secondaryText}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {waiting && errorCode === null && openQuiz === null ? (
          <span className="lk-iv-spinner" aria-hidden="true" />
        ) : null}

        {errorCode !== null ? (
          <div className="lk-iv-error" role="alert">
            <AlertIcon />
            <p>{strings.videoError(errorCode)}</p>
            <button
              type="button"
              className="lk-iv-action"
              onClick={() => {
                setErrorCode(null);
                videoRef.current?.load();
              }}
            >
              {strings.videoTryAgain}
            </button>
          </div>
        ) : null}

        {!playing && !waiting && errorCode === null && openQuiz === null && !ended ? (
          <button
            type="button"
            className="lk-iv-big-play"
            aria-label={strings.media.play}
            onClick={togglePlay}
          >
            <PlayIcon />
          </button>
        ) : null}

        {/* biome-ignore lint/a11y/noStaticElementInteractions: focus is only observed, to keep the controls shown while a keyboard user is among them */}
        <div
          className="lk-iv-chrome"
          inert={openQuiz !== null}
          onFocus={() => setFocusInChrome(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocusInChrome(false);
            }
          }}
        >
          <Scrubber
            current={current}
            duration={duration}
            buffered={buffered}
            chapters={chapters}
            markers={markers}
            cues={primaryCues}
            previewLimit={spoilerLimit}
            strings={strings}
            onSeek={seek}
            onScrubChange={setScrubbing}
          />
          <div className="lk-iv-bar">
            <div className="lk-iv-bar-group">
              <button
                ref={playButtonRef}
                type="button"
                className="lk-iv-button"
                aria-label={
                  ended ? strings.videoReplay : playing ? strings.media.pause : strings.media.play
                }
                onClick={togglePlay}
              >
                {ended ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className="lk-iv-button lk-iv-wide"
                aria-label={strings.videoBack(JUMP_SECONDS)}
                onClick={() => seek(current - JUMP_SECONDS)}
              >
                <BackIcon />
              </button>
              <button
                type="button"
                className="lk-iv-button lk-iv-wide"
                aria-label={strings.videoForward(JUMP_SECONDS)}
                onClick={() => seek(current + JUMP_SECONDS)}
              >
                <ForwardIcon />
              </button>
              <div className="lk-iv-volume">
                <button
                  type="button"
                  className="lk-iv-button"
                  aria-label={preferences.muted ? strings.media.unmute : strings.media.mute}
                  aria-pressed={preferences.muted}
                  onClick={() => changePreferences({ muted: !preferences.muted })}
                >
                  <VolumeIcon level={volumeLevel} />
                </button>
                <input
                  id={`${playerId}-volume`}
                  className="lk-iv-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={preferences.muted ? 0 : preferences.volume}
                  aria-label={strings.media.volume}
                  onChange={(event) =>
                    changePreferences({ volume: Number(event.target.value), muted: false })
                  }
                />
              </div>
              <button
                type="button"
                className="lk-iv-time"
                aria-label={countdown ? strings.videoShowElapsed : strings.videoShowRemaining}
                onClick={() => setCountdown((on) => !on)}
              >
                <span aria-hidden="true">
                  {countdown ? `-${clock(Math.max(0, duration - current))}` : clock(current)}
                  <span className="lk-iv-time-total"> / {clock(duration)}</span>
                </span>
              </button>
            </div>
            <div className="lk-iv-bar-group">
              {quizzes.length > 0 || chapters.length > 0 || hasTranscript ? (
                <button
                  type="button"
                  className="lk-iv-button"
                  aria-label={strings.videoPanel}
                  aria-pressed={preferences.panel}
                  onClick={() => changePreferences({ panel: !preferences.panel })}
                >
                  <ContentsIcon />
                </button>
              ) : null}
              {hasCaptions ? (
                <button
                  type="button"
                  className="lk-iv-button"
                  aria-label={
                    preferences.captions ? strings.videoCaptionsHide : strings.videoCaptionsShow
                  }
                  aria-pressed={preferences.captions}
                  onClick={() => changePreferences({ captions: !preferences.captions })}
                >
                  <CaptionsIcon on={preferences.captions} />
                </button>
              ) : null}
              <div className="lk-iv-menu-anchor">
                <button
                  type="button"
                  className="lk-iv-button lk-iv-speed"
                  aria-label={strings.media.speed}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'speed'}
                  onClick={() => setMenu((open) => (open === 'speed' ? null : 'speed'))}
                >
                  <span aria-hidden="true">{`${preferences.speed}×`}</span>
                </button>
                {menu === 'speed' ? (
                  <SpeedMenu
                    speed={preferences.speed}
                    strings={strings}
                    onChoose={(speed) => {
                      changePreferences({ speed });
                      setMenu(null);
                    }}
                    onClose={() => setMenu(null)}
                  />
                ) : null}
              </div>
              <div className="lk-iv-menu-anchor">
                <button
                  type="button"
                  className="lk-iv-button"
                  aria-label={strings.videoSettings}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'settings'}
                  onClick={() => setMenu((open) => (open === 'settings' ? null : 'settings'))}
                >
                  <SettingsIcon />
                </button>
                {menu === 'settings' ? (
                  <SettingsMenu
                    preferences={preferences}
                    tracks={tracks}
                    primaryTrack={primaryTrack}
                    secondaryTrack={secondaryTrack}
                    captionsFailed={captionsFailed}
                    onCaptionTrack={chooseCaptionTrack}
                    onSecondaryTrack={chooseSecondaryTrack}
                    strings={strings}
                    onChange={changePreferences}
                    onShowShortcuts={() => {
                      setMenu(null);
                      setSheet(true);
                    }}
                    onClose={() => setMenu(null)}
                  />
                ) : null}
              </div>
              {pictureInPictureSupported ? (
                <button
                  type="button"
                  className="lk-iv-button lk-iv-wide"
                  aria-label={strings.videoPictureInPicture}
                  aria-pressed={pictureInPicture}
                  onClick={togglePictureInPicture}
                >
                  <PictureInPictureIcon />
                </button>
              ) : null}
              <button
                type="button"
                className="lk-iv-button"
                aria-label={fullscreen ? strings.videoExitFullscreen : strings.videoFullscreen}
                onClick={toggleFullscreen}
              >
                <FullscreenIcon on={fullscreen} />
              </button>
            </div>
          </div>
        </div>

        <div
          className="lk-iv-quiz"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${playerId}-quiz-title`}
          hidden={openQuiz === null}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !required && openQuiz !== null) {
              event.preventDefault();
              closeQuiz('skip');
            }
          }}
        >
          {openCue !== undefined ? (
            <div className="lk-iv-quiz-head">
              <h3
                id={`${playerId}-quiz-title`}
                ref={quizHeadingRef}
                tabIndex={-1}
                className="lk-iv-quiz-title"
              >
                {quizTitle(openCue)}
                <span className="lk-iv-quiz-time"> · {clock(openCue.at)}</span>
                {required ? (
                  <>
                    {' '}
                    <span className="lk-iv-tag">{strings.videoRequired}</span>
                  </>
                ) : null}
              </h3>
              {openSlots.length > 1 ? (
                <div className="lk-iv-steps">
                  <span className="lk-iv-steps-label">
                    {strings.videoQuestionProgress(step + 1, openSlots.length)}
                  </span>
                  <ol className="lk-iv-steps-dots">
                    {openSlots.map((slot, index) => (
                      <li key={slot.slotId}>
                        <button
                          type="button"
                          className="lk-iv-step"
                          data-current={index === step || undefined}
                          data-answered={answered.has(slot.slotId) || undefined}
                          aria-current={index === step ? 'step' : undefined}
                          aria-label={strings.videoQuestionStep(
                            index + 1,
                            answered.has(slot.slotId),
                          )}
                          onClick={() => goToStep(index)}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="lk-iv-quiz-body">
            {cues
              .filter((cue) => mounted.has(cue.id))
              .map((cue) =>
                (slotsByCue.get(cue.id) ?? []).map((slot, index) => (
                  <QuestionPane
                    key={slot.slotId}
                    hidden={!(openQuiz?.cueId === cue.id && step === index)}
                    channel={channelFor(slot.slotId)}
                  >
                    {renderQuestion(slot, cue.id)}
                  </QuestionPane>
                )),
              )}
          </div>
          {openCue !== undefined ? (
            <div className="lk-iv-quiz-foot">
              <div className="lk-iv-quiz-foot-start">
                <button type="button" className="lk-iv-link" onClick={() => closeQuiz('rewatch')}>
                  <ReplayIcon />
                  {strings.videoRewatch}
                </button>
                {!required && !lastStep ? (
                  <button type="button" className="lk-iv-link" onClick={() => closeQuiz('skip')}>
                    {strings.videoSkipQuiz}
                  </button>
                ) : null}
              </div>
              <div className="lk-iv-quiz-foot-end">
                {renderMode === 'exam' && stepAnswered ? (
                  <span className="lk-iv-saved" role="status">
                    {strings.videoAnswerSaved}
                  </span>
                ) : null}
                {/* Quiet until the question is answered: the question's own
                    Submit is the one strong button on the panel until then. */}
                <button
                  type="button"
                  className={
                    stepAnswered || renderMode === 'review'
                      ? 'lk-iv-action lk-iv-action-primary'
                      : 'lk-iv-action'
                  }
                  aria-disabled={!canAdvance || undefined}
                  onClick={() => {
                    if (!canAdvance) {
                      return;
                    }
                    if (lastStep) {
                      closeQuiz('continue');
                    } else {
                      goToStep(step + 1);
                    }
                  }}
                >
                  {lastStep ? strings.videoContinue : strings.videoNextQuestion}
                  {lastStep ? <PlayIcon /> : null}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {ended && openQuiz === null ? (
          <EndScreen
            idPrefix={playerId}
            renderMode={renderMode}
            quizzes={quizzes}
            answered={answeredCount}
            total={totalQuestions}
            percent={percent}
            strings={strings}
            onOpenQuiz={(id) => {
              const cue = cues.find((candidate) => candidate.id === id);
              if (cue !== undefined) {
                openAt(cue);
              }
            }}
            onWatchAgain={togglePlay}
            onFinish={renderMode === 'review' ? undefined : finish}
          />
        ) : null}

        {sheet ? (
          <ShortcutSheet
            strings={strings}
            onClose={() => {
              setSheet(false);
              playButtonRef.current?.focus();
            }}
          />
        ) : null}
      </div>

      {preferences.panel ? (
        <ContentsPanel
          idPrefix={playerId}
          tab={panelTab}
          onTab={setPanelTab}
          chapters={chapters}
          quizzes={quizzes}
          cues={primaryCues}
          primaryLanguage={primaryTrack?.srclang}
          secondaryCues={secondaryTrack === undefined ? NO_CUES : secondaryCues}
          secondaryLanguage={secondaryTrack?.srclang}
          activeCue={activeCueIndex}
          limit={spoilerLimit}
          strings={strings}
          onSeek={seek}
          onOpenQuiz={(id) => {
            const cue = cues.find((candidate) => candidate.id === id);
            if (cue === undefined) {
              return;
            }
            // Within navigation limits: a quiz the learner may not reach yet
            // stays where it is, and the seek says why.
            if (
              renderMode !== 'review' &&
              limitSeek(
                timeline,
                videoRef.current?.currentTime ?? 0,
                cue.at,
                furthest.current,
                finished,
              ).at <
                cue.at - 0.25
            ) {
              seek(cue.at);
              return;
            }
            openAt(cue);
          }}
        />
      ) : null}

      <div className="lk-iv-live" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

/**
 * One question of a quiz. Every question stays mounted once its quiz has
 * opened, so an answer survives stepping back or rewinding the video; hiding
 * it — another question, or the quiz closing — stops whatever it was
 * recording or playing, as a sequence's pane does.
 */
function QuestionPane({
  hidden,
  channel,
  children,
}: {
  hidden: boolean;
  channel: SequenceSlotChannel;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const captureGroup = channel.captureGroup;
  useEffect(() => {
    if (!hidden) {
      return;
    }
    stopCaptureGroup(captureGroup);
    for (const media of ref.current?.querySelectorAll('audio, video') ?? []) {
      const element = media as HTMLMediaElement;
      if (!element.paused) {
        element.pause();
      }
    }
  }, [hidden, captureGroup]);
  return (
    <div ref={ref} className="lk-iv-question" hidden={hidden}>
      <SequenceSlotContext.Provider value={channel}>{children}</SequenceSlotContext.Provider>
    </div>
  );
}

/** How far the browser has downloaded past the playhead, in seconds from 0. */
function bufferedAhead(video: HTMLVideoElement): number {
  const ranges = video.buffered as TimeRanges | undefined;
  if (ranges === undefined) {
    return 0;
  }
  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges.start(index) <= video.currentTime && video.currentTime <= ranges.end(index)) {
      return ranges.end(index);
    }
  }
  return 0;
}

/** A quiz's marker state: its shape on the progress bar and its dot in the lists. */
function markerState(
  quizSlots: readonly SequenceSlot<RenderableActivity>[],
  answered: ReadonlySet<string>,
  renderMode: RenderMode,
  outcomes: Readonly<Record<string, ItemOutcome>> | undefined,
): MarkerState {
  if (renderMode === 'review' && outcomes !== undefined) {
    const results = quizSlots.map((slot) =>
      Object.hasOwn(outcomes, slot.slotId) ? outcomes[slot.slotId] : undefined,
    );
    if (results.some((outcome) => outcome === undefined || outcome.status === 'deferred')) {
      return 'pending';
    }
    const scored = results.filter(
      (outcome): outcome is Extract<ItemOutcome, { status: 'scored' }> =>
        outcome?.status === 'scored',
    );
    if (scored.length === results.length && scored.every((outcome) => outcome.passed)) {
      return 'correct';
    }
    return scored.some((outcome) => outcome.passed) ? 'partial' : 'incorrect';
  }
  const count = quizSlots.filter((slot) => answered.has(slot.slotId)).length;
  if (count === quizSlots.length && count > 0) {
    return 'answered';
  }
  // Begun, not finished. A quiz passed or skipped with nothing answered keeps
  // its empty ring: the bar shows what the learner did, not where they went.
  if (count > 0) {
    return 'open';
  }
  return 'unreached';
}
