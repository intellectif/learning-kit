import { getActivityTypeDescriptor, type MediaSlot } from './registry/index.js';

/**
 * What a media reference points at. The first four are a holder's main file,
 * named by its `type`; the rest are the files beside it.
 */
export type MediaRefKind = 'audio' | 'video' | 'image' | 'embed' | 'captions' | 'track' | 'poster';

/** One address in a piece of content, with where it sits. See {@link listMediaRefs}. */
export interface MediaRef {
  /**
   * From the entry to the field holding the address, e.g.
   * `['items', 2, 'options', 1, 'media', 'url']`. Authored positions, so a
   * shuffle never moves it.
   */
  readonly path: readonly (string | number)[];
  readonly kind: MediaRefKind;
  /**
   * The address. `null` for a holder's main file that has none yet: a draft
   * whose recording is still to be made, as a parallel item's is.
   */
  readonly url: string | null;
  /**
   * The object holding the address, as stored and never to be changed: the
   * media, an option's media, a slow recording, or a caption track. A
   * recording's `transcript` and `script` are read from it.
   */
  readonly holder: Readonly<Record<string, unknown>>;
  /** The activity it belongs to. Absent for a group's stimulus. */
  readonly activityId?: string;
  /** The stimulus it belongs to, for a group's material. */
  readonly stimulusId?: string;
  /** A `track`'s language. */
  readonly srclang?: string;
}

const MAIN_KINDS: readonly string[] = ['audio', 'video', 'image', 'embed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAt(root: unknown, path: readonly (string | number)[]): unknown {
  let at = root;
  for (const key of path) {
    if (typeof key === 'number' ? !Array.isArray(at) : !isRecord(at)) {
      return undefined;
    }
    at = (at as Record<string | number, unknown>)[key];
  }
  return at;
}

/** Where `item` keeps its files: what its type declares, or its `media` alone. */
function slotsOf(item: Record<string, unknown>): readonly MediaSlot[] {
  const declared =
    typeof item.type === 'string' ? getActivityTypeDescriptor(item.type)?.mediaSlots : undefined;
  if (declared === undefined) {
    return [{ path: ['media'] }];
  }
  const slots = declared(item);
  return Array.isArray(slots) ? slots : [];
}

interface Owner {
  activityId?: string;
  stimulusId?: string;
}

function holderRefs(
  holder: unknown,
  path: readonly (string | number)[],
  kindOfSlot: MediaSlot['kind'],
  owner: Owner,
): MediaRef[] {
  if (!isRecord(holder)) {
    return [];
  }
  const own = typeof holder.type === 'string' && MAIN_KINDS.includes(holder.type);
  const main = (own ? holder.type : kindOfSlot) as MediaRefKind | undefined;
  const refs: MediaRef[] = [];
  const add = (field: readonly (string | number)[], kind: MediaRefKind, url: string | null) => {
    refs.push({ path: [...path, ...field], kind, url, holder, ...owner });
  };
  // A holder that names no kind of file is not valid content, and its file
  // could not be named; it is left out rather than guessed at.
  if (main !== undefined) {
    add(['url'], main, typeof holder.url === 'string' ? holder.url : null);
  }
  if (typeof holder.captionsUrl === 'string') {
    add(['captionsUrl'], 'captions', holder.captionsUrl);
  }
  if (Array.isArray(holder.tracks)) {
    holder.tracks.forEach((track, index) => {
      if (isRecord(track) && typeof track.src === 'string') {
        refs.push({
          path: [...path, 'tracks', index, 'src'],
          kind: 'track',
          url: track.src,
          holder: track,
          ...owner,
          ...(typeof track.srclang === 'string' ? { srclang: track.srclang } : {}),
        });
      }
    });
  }
  if (typeof holder.poster === 'string') {
    add(['poster'], 'poster', holder.poster);
  }
  return refs;
}

function activityRefs(item: unknown, base: readonly (string | number)[]): MediaRef[] {
  if (!isRecord(item)) {
    return [];
  }
  const owner: Owner = typeof item.id === 'string' ? { activityId: item.id } : {};
  return slotsOf(item).flatMap((slot) =>
    holderRefs(valueAt(item, slot.path), [...base, ...slot.path], slot.kind, owner),
  );
}

/**
 * Every media address in one piece of content: a loose activity or an item
 * group (its stimulus first, then each item in authored order), as a
 * `SequenceEntry` holds them. Drafts are read too.
 *
 * For each activity the walker reads the places its type keeps files: an
 * item's `media`, each multiple-choice option's `media`, and dictation's and
 * read-aloud's `slowMedia`. In each it lists the main file, `captionsUrl`,
 * every track's `src` and `poster`. A type you register declares its own with
 * `mediaSlots`; without that, its `media` is read.
 *
 * A main file with no address yet is listed with `url: null`, so a recording
 * still to be made has a place in the list. Not read: addresses inside an
 * `…Html` sidecar (the SDK does not parse HTML) and a learner's recordings,
 * which are responses rather than content.
 *
 * ```ts
 * const files = listMediaRefs(entry).filter((ref) => ref.url !== null);
 * ```
 */
export function listMediaRefs(entry: unknown): MediaRef[] {
  if (!isRecord(entry)) {
    return [];
  }
  if (entry.type !== 'item-group') {
    return activityRefs(entry, []);
  }
  const refs: MediaRef[] = [];
  const stimulus = entry.stimulus;
  if (isRecord(stimulus)) {
    const owner: Owner = typeof stimulus.id === 'string' ? { stimulusId: stimulus.id } : {};
    refs.push(...holderRefs(stimulus.media, ['stimulus', 'media'], undefined, owner));
  }
  if (Array.isArray(entry.items)) {
    entry.items.forEach((item, index) => {
      refs.push(...activityRefs(item, ['items', index]));
    });
  }
  return refs;
}

/** A deep copy of a JSON value. Content is plain data; a cycle cannot be copied. */
function copyOf(value: unknown, seen: Set<object>): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (seen.has(value)) {
    throw new TypeError('mapMediaRefs: the content contains a circular reference.');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((element) => copyOf(element, seen));
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      copy[key] = copyOf(field, seen);
    }
    return copy;
  } finally {
    seen.delete(value);
  }
}

/**
 * A copy of `entry` with each address {@link listMediaRefs} finds replaced
 * by what `fn` returns for it: files moved into a new folder structure, or an
 * export's file names pointed at where an import stored them. Nothing else
 * changes, and `entry` is never modified: with `(ref) => ref.url`, the copy is
 * deep-equal to it, with the same `canonicalJson`.
 *
 * For a main file with no address yet (`url: null`), a string attaches one
 * and `null` leaves it empty. For an address that is there, `fn` must return
 * a string: removing a file is not mapping.
 *
 * The copy validates as the original did when every address `fn` returns is
 * one the media rule accepts: `https:`, `http:`, `data:`, `blob:`, or
 * root-relative (`/…`). A bundle-relative `media/part1.mp3` is refused.
 *
 * @throws TypeError when `fn` returns something other than a string or
 *   `null`, or `null` for an address that is there, or when `entry` is circular.
 */
export function mapMediaRefs<T>(entry: T, fn: (ref: MediaRef) => string | null): T {
  const refs = listMediaRefs(entry);
  const copy = copyOf(entry, new Set()) as T;
  for (const ref of refs) {
    const next = fn(ref);
    if (next === null) {
      if (ref.url !== null) {
        throw new TypeError(
          `mapMediaRefs: ${ref.path.join('.')} has a file; returning null would remove it, which is not mapping.`,
        );
      }
      continue;
    }
    if (typeof next !== 'string') {
      throw new TypeError(
        `mapMediaRefs: the function must return a string or null for ${ref.path.join('.')}, not ${typeof next}.`,
      );
    }
    if (next === ref.url) {
      continue;
    }
    const holder = valueAt(copy, ref.path.slice(0, -1)) as Record<string | number, unknown>;
    holder[ref.path[ref.path.length - 1] as string | number] = next;
  }
  return copy;
}

/** A holder's own text: its transcript, else its script as "Speaker: text" lines. */
function ownText(holder: Record<string, unknown>): string | null {
  if (typeof holder.transcript === 'string' && holder.transcript.trim() !== '') {
    return holder.transcript;
  }
  const turns = Array.isArray(holder.script)
    ? holder.script.flatMap((turn) =>
        isRecord(turn) &&
        typeof turn.speaker === 'string' &&
        typeof turn.text === 'string' &&
        turn.text.trim() !== ''
          ? [`${turn.speaker.trim()}: ${turn.text.trim()}`]
          : [],
      )
    : [];
  return turns.length > 0 ? turns.join('\n') : null;
}

/**
 * The author-side text of a recording: its `transcript`, or else its
 * `script` as one "Speaker: text" line per turn. `null` when it has neither.
 *
 * `holder` is a media object, a stimulus, or an activity. A stimulus or an
 * activity is read for its own text first and then for its `media`'s; a
 * stimulus keeps both at its own level. Author-only: pass it to the author's
 * requests (`aiDraftsRequest`'s `source`, a critique), never to a learner's.
 *
 * ```ts
 * const text = transcriptOf(item.media);
 * if (text !== null) aiDraftsRequest({ types: ['multiple-choice'], source: { kind: 'transcript', text } });
 * ```
 */
export function transcriptOf(holder: unknown): string | null {
  if (!isRecord(holder)) {
    return null;
  }
  return ownText(holder) ?? (isRecord(holder.media) ? ownText(holder.media) : null);
}
