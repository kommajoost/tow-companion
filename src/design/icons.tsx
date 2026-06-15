import type { CSSProperties } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Old World UI icon set — one cohesive, hand-tuned family used by BOTH the wide
// nav rail and the phone bottom bar (replacing the old emoji), plus the home
// emblem. Design rules, kept consistent so the set reads as a single system:
//   • 24×24 grid, artwork inset ~3px from the edges
//   • 1.7px stroke, round caps + joins (a touch heavier than hairline = "engraved")
//   • colour inherits (currentColor) but can be overridden per call
//   • small solid accents (pips / comet head / pommels) for heraldic weight
// ─────────────────────────────────────────────────────────────────────────────

export type IconId = 'turns' | 'rulebook' | 'game' | 'army' | 'settings' | 'home';

export type IconProps = {
  size?: number;
  color?: string;
  /** stroke width on the 24-grid; defaults to 1.7 */
  sw?: number;
  style?: CSSProperties;
  title?: string;
};

function Svg({
  size = 22,
  style,
  title,
  children,
}: {
  size?: number;
  style?: CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', ...style }}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

// Crossed swords — the turn tracker. Two blades crossing high, hilts + pommels
// low, with short crossguards so it reads as swords rather than a bare X.
export function TurnsIcon({ size, color = 'currentColor', sw = 1.7, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <g stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {/* blades: tip top-right → pommel bottom-left, and mirror */}
        <path d="M20 4 L7 17" />
        <path d="M4 4 L17 17" />
        {/* crossguards near the hilts */}
        <path d="M5.4 14.4 L9.1 18.1" />
        <path d="M18.6 14.4 L14.9 18.1" />
      </g>
      <g fill={color}>
        {/* pommels */}
        <circle cx="6.4" cy="18.6" r="1.25" />
        <circle cx="17.6" cy="18.6" r="1.25" />
      </g>
    </Svg>
  );
}

// Open tome — the rulebook. Two leaves fanning from a central spine.
export function RulebookIcon({ size, color = 'currentColor', sw = 1.7, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <g stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.6C10.3 5.2 7.6 4.7 4 5V17.7c3.6-.3 6.3.2 8 1.7" />
        <path d="M12 6.6C13.7 5.2 16.4 4.7 20 5V17.7c-3.6-.3-6.3.2-8 1.7" />
        <path d="M12 6.6V19.4" />
        {/* faint text lines on the right leaf */}
        <path d="M14.6 9.1c1.4-.2 2.6-.3 3.6-.2" opacity="0.5" />
        <path d="M14.6 11.6c1.4-.2 2.6-.3 3.6-.2" opacity="0.5" />
      </g>
    </Svg>
  );
}

// A single d6 showing five — the game / battle screen.
export function GameIcon({ size, color = 'currentColor', sw = 1.7, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <rect
        x="4.2"
        y="4.2"
        width="15.6"
        height="15.6"
        rx="3.4"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <g fill={color}>
        <circle cx="8.6" cy="8.6" r="1.05" />
        <circle cx="15.4" cy="8.6" r="1.05" />
        <circle cx="12" cy="12" r="1.05" />
        <circle cx="8.6" cy="15.4" r="1.05" />
        <circle cx="15.4" cy="15.4" r="1.05" />
      </g>
    </Svg>
  );
}

// Heraldic shield with a twin-tailed comet charge — the army.
export function ArmyIcon({ size, color = 'currentColor', sw = 1.7, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <path
        d="M12 3.2 19 5.6v5.4c0 4.4-3 7.7-7 9.4-4-1.7-7-5-7-9.4V5.6z"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* small comet charge — tail streams from the head's lower-left vertex */}
      <g stroke={color} strokeWidth={sw * 0.85} strokeLinecap="round">
        <path d="M13.3 10.7 9.5 14.7" />
      </g>
      <path
        d="M14.1 7.1 14.9 9.1 16.9 9.9 14.9 10.7 14.1 12.7 13.3 10.7 11.3 9.9 13.3 9.1Z"
        fill={color}
      />
    </Svg>
  );
}

// Cog — settings. 8 teeth, round hub.
export function SettingsIcon({ size, color = 'currentColor', sw = 1.5, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <g stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" fill="none">
        {/* 8-tooth cog (outer 9.2 / inner 6.6) + hub */}
        <path d="M18.10 9.47 21.02 10.21 21.02 13.79 18.10 14.53 19.65 17.11 17.11 19.65 14.53 18.10 13.79 21.02 10.21 21.02 9.47 18.10 6.89 19.65 4.35 17.11 5.90 14.53 2.98 13.79 2.98 10.21 5.90 9.47 4.35 6.89 6.89 4.35 9.47 5.90 10.21 2.98 13.79 2.98 14.53 5.90 17.11 4.35 19.65 6.89 18.10 9.47Z" />
        <circle cx="12" cy="12" r="2.9" />
      </g>
    </Svg>
  );
}

// Twin-tailed comet — the Old World emblem, used for Home and as the logo charge.
export function CometIcon({ size, color = 'currentColor', sw = 1.7, style, title }: IconProps) {
  return (
    <Svg size={size} style={style} title={title}>
      <g stroke={color} strokeWidth={sw} strokeLinecap="round">
        <path d="M14.6 9.6 5.6 19.6" />
        <path d="M16 11 8.8 20.8" opacity="0.85" />
      </g>
      <path
        d="M16 3.4 17.1 6.9 20.6 8 17.1 9.1 16 12.6 14.9 9.1 11.4 8 14.9 6.9Z"
        fill={color}
      />
    </Svg>
  );
}

export const ICONS: Record<IconId, (p: IconProps) => React.ReactElement> = {
  turns: TurnsIcon,
  rulebook: RulebookIcon,
  game: GameIcon,
  army: ArmyIcon,
  settings: SettingsIcon,
  home: CometIcon,
};

/** Convenience: render any set member by id. */
export function TowIcon({ id, ...props }: { id: IconId } & IconProps) {
  const Cmp = ICONS[id];
  return <Cmp {...props} />;
}
