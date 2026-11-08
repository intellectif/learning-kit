import { validateXAPIStatement, XAPIVerb, xAPIBuilder } from '@intellectif/lk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_EVENT_XAPI_EXTENSION,
  type PlayerEvent,
  type PlayerEventXapiContext,
  playerEventToXapi,
} from '../index.js';
import type { PlayerEvent as LegacyPlayerEvent } from '../player/events.js';

const clip = { activityId: 'activity-1', clipId: 'clip-1' };
const scene = { activityId: 'activity-1', sceneId: 'scene-1' };
const events: PlayerEvent[] = [
  { type: 'clip.opened', ...clip },
  { type: 'clip.frozen', ...clip },
  { type: 'clip.revealed', ...clip },
  { type: 'answer.shown', ...clip },
  { type: 'audio.played', ...clip, via: 'audio' },
  { type: 'audio.played', ...clip, via: 'speechSynthesis' },
  { type: 'clip.completed', ...clip },
  { type: 'board.completed', activityId: 'activity-1' },
  { type: 'scramble.started', ...scene },
  { type: 'scramble.completed', ...scene },
  { type: 'scramble.checked', ...scene, correct: true },
  { type: 'scramble.checked', ...scene, correct: false },
  { type: 'vocab.opened', activityId: 'activity-1' },
];
const host: PlayerEventXapiContext = {
  actor: { objectType: 'Agent', account: { homePage: 'https://example.org', name: 'session' } },
  object: { id: 'https://example.org/activities/activity-1' },
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('player event xAPI adapter', () => {
  it.each(events)('maps $type to a validated local statement without a score', (event) => {
    const legacy: LegacyPlayerEvent = event;
    const builder = vi.spyOn(xAPIBuilder, 'buildStatement');
    const statement = playerEventToXapi(legacy, host);
    expect(builder).toHaveBeenCalledOnce();
    expect(() => validateXAPIStatement(statement)).not.toThrow();
    expect(statement.actor).toBe(host.actor);
    expect(statement.object.id).toBe('https://example.org/activities/activity-1');
    expect(statement.context?.extensions?.[PLAYER_EVENT_XAPI_EXTENSION]).toEqual(event);
    expect(statement.result ?? {}).not.toHaveProperty('score');
    if (event.type === 'scramble.checked') {
      expect(statement.verb.id).toBe(XAPIVerb.INTERACTED);
      expect(statement.result).toEqual({ success: event.correct });
    } else {
      expect(statement.result ?? {}).not.toHaveProperty('success');
      if (event.type.endsWith('.completed')) {
        expect(statement.verb.id).toBe(XAPIVerb.COMPLETED);
        expect(statement.result).toEqual({ completion: true });
      } else {
        expect(statement.verb.id).toBe(XAPIVerb.EXPERIENCED);
        expect(statement).not.toHaveProperty('result');
      }
    }
  });

  it('lets a host resolve object IRIs from event IDs and preserves context without mutation', () => {
    const context = Object.freeze({
      platform: 'OCW',
      language: 'es',
      extensions: Object.freeze({
        'https://example.org/custom': 'retained',
        [PLAYER_EVENT_XAPI_EXTENSION]: 'replaced',
      }),
    });
    const resolve = vi.fn((event: PlayerEvent) => ({
      id: `urn:example:activity:${event.activityId}`,
      name: { en: 'Original story' },
    }));
    const event = Object.freeze({ type: 'clip.frozen' as const, ...clip });
    const statement = playerEventToXapi(event, { ...host, object: resolve, context });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(statement.object).toMatchObject({
      id: 'urn:example:activity:activity-1',
      definition: {
        name: { en: 'Original story' },
      },
    });
    expect(statement.context).toMatchObject({
      platform: 'OCW',
      language: 'es',
      extensions: {
        'https://example.org/custom': 'retained',
        [PLAYER_EVENT_XAPI_EXTENSION]: event,
      },
    });
    expect(context.extensions[PLAYER_EVENT_XAPI_EXTENSION]).toBe('replaced');
    expect(statement.context?.extensions?.[PLAYER_EVENT_XAPI_EXTENSION]).not.toBe(event);
  });

  it('does no fetch or XHR for any event and produces fresh statements', () => {
    const fetch = vi.fn(() => {
      throw new Error('Network forbidden');
    });
    const xhr = vi.fn(() => {
      throw new Error('Network forbidden');
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('XMLHttpRequest', xhr);
    const statements = events.map((event) => playerEventToXapi(event, host));
    expect(new Set(statements.map(({ id }) => id)).size).toBe(events.length);
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it('delegates malformed host context to lk-core validation', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(() =>
      playerEventToXapi(
        { type: 'board.completed', activityId: 'a' },
        {
          ...host,
          object: { id: 'not-an-iri' },
        },
      ),
    ).toThrow();
    vi.unstubAllEnvs();
  });
});
