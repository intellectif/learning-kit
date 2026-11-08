// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postEmbedResize } from '../player/embed.js';
import { resolveLayout, STAGE_HEIGHT, STAGE_WIDTH, stageScale } from '../player/layout.js';
import { Stage } from '../player/Stage.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('responsive stage', () => {
  it('scales landscape and stacks narrow or portrait; no negative scale', () => {
    expect([STAGE_WIDTH, STAGE_HEIGHT]).toEqual([1920, 1080]);
    expect(resolveLayout(1920, 1080)).toBe('landscape');
    expect(resolveLayout(400, 800)).toBe('portrait');
    expect(resolveLayout(500, 300)).toBe('portrait');
    expect(stageScale(960, 540)).toBe(0.5);
    expect(stageScale(-1, 5)).toBe(0);
  });
  it('scopes styles per instance, honors reduced motion, and optionally posts dimensions', () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { container, rerender } = render(
      <Stage
        style={{ presetId: 'cinema-dark', mode: 'dark' }}
        template="test"
        stage="start"
        viewport={{ width: 1152, height: 648 }}
        reducedMotion
        embed={{ postResize: true }}
        chromeLocale="en"
      >
        Stage
      </Stage>,
    );
    expect(container.querySelector('[data-lkia-layout="landscape"]')).not.toBeNull();
    expect(container.querySelector('[data-lkia-stage]')?.getAttribute('style')).toContain(
      'scale(0.6)',
    );
    expect(container.querySelector('[data-reduced-motion="true"]')).not.toBeNull();
    // Nothing is posted until the player has a real rendered size (jsdom draws none).
    expect(post).not.toHaveBeenCalled();
    rerender(
      <Stage
        style={{ presetId: 'default' }}
        template="test"
        stage="start"
        viewport={{ width: 400, height: 800 }}
        embed={{ postResize: false }}
        chromeLocale="en"
      >
        Portrait
      </Stage>,
    );
    expect(container.querySelector('[data-lkia-layout="portrait"]')).not.toBeNull();
    expect(container.querySelector('style')?.textContent).toContain('[data-lkia-root="');
    postEmbedResize(1, 2);
    expect(post).toHaveBeenLastCalledWith(
      { type: 'lk-interactive-activity:resize', width: 1, height: 2 },
      '*',
    );
  });
  it('follows window resize and isolates two style presets', () => {
    const { container } = render(
      <>
        <Stage style={{ presetId: 'default' }} template="a" stage="start" chromeLocale="en">
          A
        </Stage>
        <Stage style={{ presetId: 'cinema-dark' }} template="b" stage="start" chromeLocale="en">
          B
        </Stage>
      </>,
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    fireEvent(window, new Event('resize'));
    expect(container.querySelectorAll('[data-lkia-layout="portrait"]')).toHaveLength(2);
    const roots = container.querySelectorAll('[data-lkia-root]');
    expect(roots[0]?.getAttribute('data-lkia-root')).not.toBe(
      roots[1]?.getAttribute('data-lkia-root'),
    );
  });
  it('fits the content box of its container, not its padded outer edge', () => {
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    const host = document.createElement('div');
    host.style.padding = '24px';
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1280 });
    document.body.append(host);
    const { container } = render(
      <Stage style={{ presetId: 'default' }} template="test" stage="start" chromeLocale="en">
        Stage
      </Stage>,
      { container: host },
    );
    // 1280 wide with 24 px each side leaves 1232 for the player.
    expect(container.querySelector('[data-lkia-root]')?.getAttribute('style')).toContain(
      'width: 1232px',
    );
    vi.unstubAllGlobals();
    host.remove();
  });
});
