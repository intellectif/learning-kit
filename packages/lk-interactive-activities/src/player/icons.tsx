import type { JSX } from 'react';

/**
 * The few icons the players draw, as inline SVG in the current text colour.
 * Every one is decorative: the words beside it carry the meaning.
 */
type IconName = 'back' | 'play' | 'listen' | 'check' | 'cross' | 'return' | 'replay' | 'book';

const PATHS: Record<IconName, JSX.Element> = {
  back: <path d="M15 5l-7 7 7 7" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  listen: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  return: <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3" />,
  replay: <path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V9h4.5" />,
  book: (
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5" />
  ),
};

export function Icon({ name }: { name: IconName }): JSX.Element {
  return (
    <svg
      data-lkia-icon=""
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
