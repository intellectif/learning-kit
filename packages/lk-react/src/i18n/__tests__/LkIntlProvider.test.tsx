import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { localeDirectionOf } from '../direction.js';
import {
  DEFAULT_STRINGS,
  directionForLocale,
  LkIntlProvider,
  mergeStrings,
  useLkDirection,
  useLkStrings,
} from '../LkIntlProvider.js';

describe('mergeStrings', () => {
  it('returns the base untouched when there is no override', () => {
    expect(mergeStrings(DEFAULT_STRINGS)).toBe(DEFAULT_STRINGS);
  });

  it('replaces only the keys the override names', () => {
    const merged = mergeStrings(DEFAULT_STRINGS, { submit: 'Enviar' });
    expect(merged.submit).toBe('Enviar');
    expect(merged.next).toBe(DEFAULT_STRINGS.next);
    expect(merged.scoreAnnouncement).toBe(DEFAULT_STRINGS.scoreAnnouncement);
  });

  it('merges the two nested groups per key rather than replacing them wholesale', () => {
    const merged = mergeStrings(DEFAULT_STRINGS, {
      media: { play: 'Reproducir' },
      stimulusKind: { audio: 'Grabación' },
    });
    expect(merged.media.play).toBe('Reproducir');
    // A wholesale replace would leave the other 15 transport labels undefined,
    // which renders as a control with no accessible name rather than as an
    // English one — a partial translation must degrade to mixed, not to blank.
    expect(merged.media.pause).toBe(DEFAULT_STRINGS.media.pause);
    expect(merged.stimulusKind.audio).toBe('Grabación');
    expect(merged.stimulusKind.text).toBe(DEFAULT_STRINGS.stimulusKind.text);
  });

  it('never mutates the base, so the English defaults survive a merge', () => {
    mergeStrings(DEFAULT_STRINGS, { submit: 'Enviar', media: { play: 'Reproducir' } });
    expect(DEFAULT_STRINGS.submit).toBe('Submit');
    expect(DEFAULT_STRINGS.media.play).toBe('Play');
  });

  it('carries a replacement function through, arity and all', () => {
    const merged = mergeStrings(DEFAULT_STRINGS, {
      // A translation may reorder its arguments; a positional format string
      // could not express this, which is why these are functions.
      questionProgress: (index, total) => `${total} preguntas: vas por la ${index}`,
    });
    expect(merged.questionProgress(2, 10)).toBe('10 preguntas: vas por la 2');
  });
});

describe('the English defaults', () => {
  /**
   * Every other test in this package asserts these words indirectly, through a
   * component. Pinning them here is what makes "supplying no override changes
   * nothing on screen" checkable, and it is the only place the plural and range
   * forms are exercised at both ends — the singular arms were unreachable from
   * the component tests, which is exactly where an English typo would hide.
   */
  it('interpolate and pluralise as documented', () => {
    expect(DEFAULT_STRINGS.scoreAnnouncement(82, true)).toBe('Score 82%. Passed.');
    expect(DEFAULT_STRINGS.scoreAnnouncement(40, false)).toBe('Score 40%. Not passed.');
    expect(DEFAULT_STRINGS.blankLabel(3)).toBe('Fill in blank 3');
    expect(DEFAULT_STRINGS.questionProgress(3, 10)).toBe('Question 3 of 10');
    expect(DEFAULT_STRINGS.activityFailedNamed('Essay 1')).toBe(
      '"Essay 1" could not be displayed.',
    );

    expect(DEFAULT_STRINGS.wordCount(1)).toBe('1 word');
    expect(DEFAULT_STRINGS.wordCount(0)).toBe('0 words');
    expect(DEFAULT_STRINGS.wordCount(12)).toBe('12 words');

    // `min` of 0 means unbounded below, not "at least zero words".
    expect(DEFAULT_STRINGS.wordBounds(50, 200)).toBe('50–200 words');
    expect(DEFAULT_STRINGS.wordBounds(0, 200)).toBe('up to 200 words');

    expect(DEFAULT_STRINGS.stimulusRange(3, 8)).toBe('Questions 3–8');
    expect(DEFAULT_STRINGS.stimulusRange(4, 4)).toBe('Question 4');

    expect(DEFAULT_STRINGS.media.playsRemaining(2, 3)).toBe('2 of 3 plays remaining');
    // Takes ALREADY-FORMATTED clock strings, so a translation changes only the
    // word between them and never has to reimplement m:ss.
    expect(DEFAULT_STRINGS.media.timeValue('1:05', '4:30')).toBe('1:05 of 4:30');
    expect(DEFAULT_STRINGS.responseSubmitted).toBe(
      'Response submitted. It will be graded and your result will appear here later.',
    );
    expect(DEFAULT_STRINGS.embeddedMedia).toBe('Embedded media');
    expect(DEFAULT_STRINGS.media.playsRemaining(1, 1)).toBe('1 of 1 play remaining');
  });
});

/**
 * The comments mark the tags 23.6 answered the other way. The upgrading guide
 * lists every such tag, found by running both builds over every 2- and 3-letter
 * language and every 4-letter script subtag.
 */
const DIRECTIONS: readonly (readonly [string | undefined, 'ltr' | 'rtl'])[] = [
  [undefined, 'ltr'],
  ['en', 'ltr'],
  ['es-MX', 'ltr'],
  ['pt-BR', 'ltr'],
  ['ar', 'rtl'],
  ['ar-EG', 'rtl'],
  ['AR-EG', 'rtl'],
  ['he', 'rtl'],
  ['fa-IR', 'rtl'],
  ['ur', 'rtl'],
  // Written in both directions: right-to-left without a script, as before.
  ['ku', 'rtl'],
  ['ku-IQ', 'rtl'],
  ['sd', 'rtl'],
  ['ug-CN', 'rtl'],
  ['ku-Arab', 'rtl'],
  // A script subtag decides. Was right-to-left.
  ['ku-Latn', 'ltr'],
  ['sd-Deva', 'ltr'],
  ['ug-Cyrl', 'ltr'],
  ['ar-Latn', 'ltr'],
  ['he-Latn-IL', 'ltr'],
  ['ar-arz-Latn', 'ltr'],
  // Was left-to-right.
  ['pa-Arab', 'rtl'],
  ['ff-Adlm', 'rtl'],
  ['und-Hebr', 'rtl'],
  ['zh-yue-Arab', 'rtl'],
  // A code for no particular script, or a private-use one, decides nothing.
  ['ar-Zyyy', 'rtl'],
  ['ar-Qaaa', 'rtl'],
  ['en-Zxxx', 'ltr'],
  // Languages written right to left in every common script. Were left-to-right.
  ['ckb', 'rtl'],
  ['syr', 'rtl'],
  ['nqo', 'rtl'],
  ['iw', 'rtl'],
  ['ji', 'rtl'],
  ['azb-IR', 'rtl'],
  ['mzn', 'rtl'],
  ['pnb', 'rtl'],
  ['prs-AF', 'rtl'],
  ['ckb-Latn', 'ltr'], // unchanged: its script decides
  // `_` separates subtags as `-` does. Were left-to-right.
  ['he_IL', 'rtl'],
  ['ar_EG', 'rtl'],
  ['ku_IQ', 'rtl'],
  ['ar_Latn', 'ltr'], // unchanged
  // A private-use or grandfathered tag names nothing, and an extension's
  // value is not a script.
  ['x-arab', 'ltr'],
  ['i-klingon', 'ltr'],
  ['zh-min-nan', 'ltr'],
  ['en-US-u-nu-arab', 'ltr'],
  ['ar-EG-u-nu-latn', 'rtl'],
];

describe('directionForLocale', () => {
  it.each(DIRECTIONS)('%s is written %s', (locale, expected) => {
    expect(directionForLocale(locale)).toBe(expected);
  });

  it('agrees with a dictation wherever the tag names a direction', () => {
    // The two read a tag with one resolver, so a provider and a dictation
    // given the same tag never lay it out in opposite directions.
    for (const [locale] of DIRECTIONS) {
      const named = localeDirectionOf(locale);
      if (named !== undefined) {
        expect(directionForLocale(locale), String(locale)).toBe(named);
      }
    }
  });

  it('reads the tag alone, so it answers the same with no Intl at all', () => {
    // A server and a browser can disagree on what `Intl.Locale` says about a
    // tag; a provider rendered on one and hydrated on the other must not.
    vi.stubGlobal('Intl', {});
    try {
      for (const [locale, expected] of DIRECTIONS) {
        expect(directionForLocale(locale), String(locale)).toBe(expected);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('declares that direction, and hydrates its own server HTML without a warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();
    try {
      for (const [locale, expected] of DIRECTIONS) {
        const tree = (
          <LkIntlProvider {...(locale === undefined ? {} : { locale })}>
            <span>child</span>
          </LkIntlProvider>
        );
        const island = document.createElement('div');
        island.innerHTML = renderToString(tree);
        document.body.appendChild(island);
        let root: Root | undefined;
        await act(async () => {
          root = hydrateRoot(island, tree, { onRecoverableError: recoverable });
        });
        const declared = locale === undefined ? null : expected;
        expect((island.firstElementChild as HTMLElement).getAttribute('dir'), String(locale)).toBe(
          declared,
        );
        act(() => root?.unmount());
        island.remove();
      }
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});

describe('LkIntlProvider', () => {
  it('marks the subtree with the interface language and its direction', () => {
    const { container } = render(
      <LkIntlProvider locale="ar-EG">
        <span>child</span>
      </LkIntlProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute('lang', 'ar-EG');
    expect(wrapper).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('declares neither lang nor dir when nothing told it either one', () => {
    // Claiming `lang="en"` for a tree the consumer never labelled would make a
    // screen reader read a Spanish passage in an English voice. `dir` is the
    // same rule and used to break it: with no locale and no explicit direction
    // the wrapper wrote dir="ltr", which silently flipped an RTL host's own
    // subtree back to left-to-right.
    const { container } = render(
      <LkIntlProvider>
        <span>child</span>
      </LkIntlProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute('lang')).toBe(false);
    expect(wrapper.hasAttribute('dir')).toBe(false);
  });

  it('does not flip an RTL host back to ltr when it is given no locale', () => {
    // The realistic case: an Arabic application already sets dir on <html> and
    // mounts the SDK only to translate its chrome.
    const host = document.createElement('div');
    host.setAttribute('dir', 'rtl');
    document.body.appendChild(host);
    const { container } = render(
      <LkIntlProvider strings={{ submit: 'إرسال' }}>
        <span>child</span>
      </LkIntlProvider>,
      { container: host },
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute('dir')).toBe(false);
    // Inherited, not overridden.
    expect(wrapper.closest('[dir]')).toBe(host);
  });

  it('still declares dir when a locale or an explicit direction supplies one', () => {
    const derived = render(
      <LkIntlProvider locale="en">
        <span>a</span>
      </LkIntlProvider>,
    );
    expect(derived.container.firstElementChild).toHaveAttribute('dir', 'ltr');
    cleanup();

    const explicit = render(
      <LkIntlProvider direction="rtl">
        <span>b</span>
      </LkIntlProvider>,
    );
    expect(explicit.container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });

  it('an explicit direction wins over the one derived from the locale', () => {
    const { container } = render(
      <LkIntlProvider locale="ar" direction="ltr">
        <span>child</span>
      </LkIntlProvider>,
    );
    expect(container.firstElementChild).toHaveAttribute('dir', 'ltr');
  });

  it('useLkDirection reports the direction in force, and ltr with no provider', () => {
    const withProvider = renderHook(() => useLkDirection(), {
      wrapper: ({ children }) => <LkIntlProvider locale="he">{children}</LkIntlProvider>,
    });
    expect(withProvider.result.current).toBe('rtl');
    expect(renderHook(() => useLkDirection()).result.current).toBe('ltr');
  });
});

describe('useLkStrings', () => {
  it('falls back to the English defaults with no provider', () => {
    const { result } = renderHook(() => useLkStrings());
    expect(result.current.submit).toBe(DEFAULT_STRINGS.submit);
    expect(result.current.media.play).toBe(DEFAULT_STRINGS.media.play);
  });

  it('reads the provider, layering it over the defaults', () => {
    const { result } = renderHook(() => useLkStrings(), {
      wrapper: ({ children }) => (
        <LkIntlProvider strings={{ submit: 'Enviar' }}>{children}</LkIntlProvider>
      ),
    });
    expect(result.current.submit).toBe('Enviar');
    expect(result.current.next).toBe(DEFAULT_STRINGS.next);
  });

  it('a per-component override wins over the provider, key by key', () => {
    const { result } = renderHook(() => useLkStrings({ submit: 'Entregar' }), {
      wrapper: ({ children }) => (
        <LkIntlProvider strings={{ submit: 'Enviar', next: 'Siguiente' }}>
          {children}
        </LkIntlProvider>
      ),
    });
    expect(result.current.submit).toBe('Entregar');
    // The keys the component did NOT override still come from the provider:
    // one relabelled activity must not fall back to English for everything else.
    expect(result.current.next).toBe('Siguiente');
  });
});
