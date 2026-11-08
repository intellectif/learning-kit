import { describe, expect, it, vi } from 'vitest';
import { defaultResolveUrl, resolveAssetUrl } from '../player/resolve-url.js';

describe('host and offline URL resolution', () => {
  it('preserves signed absolute URLs and relative paths, then falls back to assetKey', () => {
    for (const url of [
      'https://cdn.example/clip.mp4?Signature=a%2Bb&Expires=9',
      'media/clip.mp4',
      '../clips/one.mp4',
    ])
      expect(resolveAssetUrl({ assetKey: 'key', url })).toBe(url);
    expect(defaultResolveUrl({ assetKey: 'local.mp4' })).toBe('local.mp4');
    expect(defaultResolveUrl({ assetKey: 'local.mp4', url: '  ' })).toBe('local.mp4');
    const resolve = vi.fn((asset) => `signed/${asset.assetKey}`);
    expect(resolveAssetUrl({ assetKey: 'key', url: 'ignored' }, resolve)).toBe('signed/key');
    expect(resolve).toHaveBeenCalledWith({ assetKey: 'key', url: 'ignored' });
  });
});
