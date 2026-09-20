'use client';

import type { ReactNode } from 'react';

/**
 * The player's icons: inline SVG, one stroke weight, drawn in `currentColor`,
 * so a theme recolours them and forced-colours mode repaints them. Inline
 * because the package has no runtime dependencies, and a 24 × 24 grid keeps
 * every icon on one optical size. Always decorative: the button that holds
 * one carries the name.
 */
function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className="lk-iv-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon filled>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" />
  </Icon>
);

export const ReplayIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M11 6.5 5.5 12l5.5 5.5" />
    <path d="M18.5 6.5 13 12l5.5 5.5" />
  </Icon>
);

export const ForwardIcon = () => (
  <Icon>
    <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    <path d="M5.5 6.5 11 12l-5.5 5.5" />
  </Icon>
);

export const VolumeIcon = ({ level }: { level: 'muted' | 'low' | 'high' }) => (
  <Icon>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    {level === 'muted' ? (
      <path d="m16 9.5 5 5m0-5-5 5" />
    ) : (
      <>
        <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
        {level === 'high' ? <path d="M18 7a7 7 0 0 1 0 10" /> : null}
      </>
    )}
  </Icon>
);

export const CaptionsIcon = ({ on }: { on: boolean }) => (
  <Icon>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3" />
    {on ? null : <path d="m4 20 16-16" />}
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" />
  </Icon>
);

export const ContentsIcon = () => (
  <Icon>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Icon>
);

export const PictureInPictureIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11.5" width="6.5" height="5" rx="1" />
  </Icon>
);

export const FullscreenIcon = ({ on }: { on: boolean }) => (
  <Icon>
    {on ? (
      <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
    ) : (
      <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    )}
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <Icon>
    <path d={direction === 'right' ? 'm9.5 6 6 6-6 6' : 'm14.5 6-6 6 6 6'} />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m6.5 6.5 11 11m0-11-11 11" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
