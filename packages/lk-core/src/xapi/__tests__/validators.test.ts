import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivitySchemaError } from '../../errors.js';
import type { XAPIStatement } from '../../types/index.js';
import { validateXAPIStatement, xAPIBuilder } from '../index.js';

const valid = (): XAPIStatement =>
  xAPIBuilder.buildStatement({
    actor: { objectType: 'Agent', mbox: 'mailto:l@example.com' },
    verb: 'ANSWERED',
    object: { id: 'https://example.com/act/1' },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('validateXAPIStatement', () => {
  it('accepts a well-formed statement (account-identified actor too)', () => {
    expect(() => validateXAPIStatement(valid())).not.toThrow();
    const accountActor = xAPIBuilder.buildStatement({
      actor: {
        objectType: 'Agent',
        account: { homePage: 'https://lrs.example', name: 'u' },
      },
      verb: 'COMPLETED',
      object: { id: 'urn:x:1' },
    });
    expect(() => validateXAPIStatement(accountActor)).not.toThrow();
  });

  it('throws ActivitySchemaError in development for an invalid statement', () => {
    const bad = { ...valid(), version: '1.0.0' } as XAPIStatement;
    expect(() => validateXAPIStatement(bad)).toThrow(ActivitySchemaError);
  });

  it('rejects an actor lacking both mbox and account', () => {
    const bad = { ...valid(), actor: { objectType: 'Agent' } } as XAPIStatement;
    expect(() => validateXAPIStatement(bad)).toThrow(ActivitySchemaError);
  });

  it('rejects a non-UUID id and a non-IRI verb/object id', () => {
    expect(() =>
      validateXAPIStatement({ ...valid(), id: 'not-a-uuid' } as XAPIStatement),
    ).toThrow();
    expect(() =>
      validateXAPIStatement({
        ...valid(),
        verb: { id: 'answered', display: { 'en-US': 'answered' } },
      } as XAPIStatement),
    ).toThrow();
  });

  it('in production, warns and does not throw (statement still sent)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { ...valid(), version: '9.9.9' } as XAPIStatement;
    expect(() => validateXAPIStatement(bad)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});
