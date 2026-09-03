import type { Stimulus } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { StimulusPanel } from '../index.js';

const passage: Stimulus = {
  id: 'p1',
  kind: 'text',
  title: 'Tides',
  body: 'Line one.\nLine two.',
  attribution: 'Ocean Almanac, 2021',
};

describe('StimulusPanel', () => {
  it('renders a region named by the title, with the body and the attribution', () => {
    render(<StimulusPanel stimulus={passage} />);
    const region = screen.getByRole('region', { name: 'Tides' });
    expect(region).toHaveAttribute('data-kind', 'text');
    expect(screen.getByText(/Line one/)).toHaveAttribute('data-format', 'text');
    expect(screen.getByText('Ocean Almanac, 2021').tagName).toBe('CITE');
  });

  it('names the region by its kind when there is no title, and renders media', () => {
    const { container } = render(
      <StimulusPanel
        stimulus={{
          id: 'a',
          kind: 'audio',
          media: { type: 'audio', url: 'https://cdn.example.com/a.mp3' },
        }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Recording' })).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeInTheDocument();
    expect(container.querySelector('.lk-stimulus-body')).toBeNull();
  });

  it('renders the question range in singular and plural', () => {
    const { rerender } = render(<StimulusPanel stimulus={passage} range={{ first: 3, last: 8 }} />);
    expect(screen.getByText('Questions 3–8')).toBeInTheDocument();
    rerender(<StimulusPanel stimulus={passage} range={{ first: 4, last: 4 }} />);
    expect(screen.getByText('Question 4')).toBeInTheDocument();
  });

  it('renders bodyHtml only through a supplied sanitiser, otherwise the plain body', () => {
    const rich: Stimulus = { ...passage, bodyHtml: '<p><em>Line</em> one.</p>' };
    const { rerender, container } = render(<StimulusPanel stimulus={rich} />);
    expect(container.querySelector('em')).toBeNull();
    expect(screen.getByText(/Line one/)).toHaveAttribute('data-format', 'text');

    const sanitizeHtml = vi.fn((html: string) =>
      html.replace('<em>', '<strong>').replace('</em>', '</strong>'),
    );
    rerender(<StimulusPanel stimulus={rich} sanitizeHtml={sanitizeHtml} />);
    expect(sanitizeHtml).toHaveBeenCalledWith('<p><em>Line</em> one.</p>');
    expect(container.querySelector('strong')).toHaveTextContent('Line');
    expect(container.querySelector('.lk-stimulus-body')).toHaveAttribute('data-format', 'html');
  });

  it('declares the stimulus language on the authored content, not on SDK chrome', () => {
    const { container } = render(
      <StimulusPanel
        stimulus={{ ...passage, locale: 'es', body: 'La marea sube dos veces al día.' }}
        range={{ first: 3, last: 5 }}
        locale="en"
      />,
    );

    // The passage and its credit are Spanish...
    expect(container.querySelector('.lk-stimulus-body')).toHaveAttribute('lang', 'es');
    expect(container.querySelector('.lk-stimulus-title')).toHaveAttribute('lang', 'es');
    expect(container.querySelector('.lk-stimulus-attribution')).toHaveAttribute('lang', 'es');

    // ...but "Questions 3–5" is a string this package ships in English. With
    // `lang` on the whole region a screen reader read it, and the region's own
    // name, in a Spanish voice (WCAG 3.1.2 Language of Parts).
    const region = screen.getByRole('region', { name: 'Tides' });
    expect(region).toHaveAttribute('lang', 'en');
    expect(container.querySelector('.lk-stimulus-range')).not.toHaveAttribute('lang');
  });

  it('leaves content unmarked when the stimulus declares no locale', () => {
    const { container } = render(<StimulusPanel stimulus={passage} locale="en" />);
    expect(container.querySelector('.lk-stimulus-body')).not.toHaveAttribute('lang');
    expect(screen.getByRole('region', { name: 'Tides' })).toHaveAttribute('lang', 'en');
  });

  it('keeps the kind-derived region name in the UI language', () => {
    render(
      <StimulusPanel
        stimulus={{
          id: 'a',
          kind: 'audio',
          locale: 'es',
          media: { type: 'audio', url: 'https://cdn.example.com/a.mp3' },
        }}
        locale="en"
      />,
    );
    // "Recording" is an English SDK string; it must not inherit lang="es".
    expect(screen.getByRole('region', { name: 'Recording' })).toHaveAttribute('lang', 'en');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <StimulusPanel stimulus={passage} range={{ first: 1, last: 3 }} />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
