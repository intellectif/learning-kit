import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultTheme, ThemeProvider, useTheme } from '../ThemeProvider.js';

describe('ThemeProvider / useTheme', () => {
  it('applies default tokens as inline CSS custom properties', () => {
    const { container } = render(
      <ThemeProvider>
        <span>child</span>
      </ThemeProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--lk-color-surface')).toBe('#ffffff');
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('merges an explicit theme prop over the defaults', () => {
    const { container } = render(
      <ThemeProvider theme={{ '--lk-color-primary': '#ff0000' }}>
        <span>child</span>
      </ThemeProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--lk-color-primary')).toBe('#ff0000');
    expect(wrapper.style.getPropertyValue('--lk-color-surface')).toBe('#ffffff');
  });

  it('useTheme returns the active tokens, defaulting without a provider', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current['--lk-color-surface']).toBe(defaultTheme['--lk-color-surface']);
  });

  it('useTheme reflects an explicit dark theme passed via the provider', () => {
    const Probe = () => <span>{useTheme()['--lk-color-surface']}</span>;
    render(
      <ThemeProvider theme={{ '--lk-color-surface': '#0f172a' }}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText('#0f172a')).toBeInTheDocument();
  });
});
