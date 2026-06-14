// Runtime light/dark theme for the whole app.
//
// The actual colour/font values live in src/index.css as CSS custom properties:
//   :root                     → "Ivory"  (light, default)
//   :root[data-theme="dark"]  → "Slate Night" (dark)
// All TOW.* tokens resolve through those variables, so flipping the
// `data-theme` attribute on <html> re-skins every component instantly.
//
// This module is provider-free: <ThemeToggle/> (or any consumer) can call
// useTheme() directly. A tiny module-level store keeps every consumer in sync
// and persists the choice under localStorage key `tow:theme`.

import { useSyncExternalStore } from 'react';
import { TOW, towFont } from './design/tow';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'tow:theme';

function readStored(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Reflect the mode onto <html>. Light removes the attribute entirely so the
// bare `:root` (Ivory) defaults apply and the default look is unchanged.
function applyMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

let current: ThemeMode = typeof window === 'undefined' ? 'light' : readStored();

// Apply synchronously at module load — before React renders — to avoid a flash.
applyMode(current);

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Set the theme explicitly. */
export function setTheme(mode: ThemeMode) {
  if (mode === current) return;
  current = mode;
  applyMode(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable (private mode, etc.) — in-memory only */
  }
  emit();
}

/** Flip between light and dark. */
export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): ThemeMode {
  return current;
}

export interface UseThemeResult {
  mode: ThemeMode;
  toggle: () => void;
  set: (mode: ThemeMode) => void;
}

export function useTheme(): UseThemeResult {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => 'light' as ThemeMode);
  return { mode, toggle: toggleTheme, set: setTheme };
}

// ---- Toggle button ---------------------------------------------------------
// Sized + styled to match the square chrome buttons in the builder topbar
// (~34px, rounded 9, 1px solid TOW.lineStrong, TOW.cardLt fill).

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i * Math.PI) / 4;
      const x1 = 12 + Math.cos(a) * 7;
      const y1 = 12 + Math.sin(a) * 7;
      const x2 = 12 + Math.cos(a) * 9.4;
      const y2 = 12 + Math.sin(a) * 9.4;
      return (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      );
    })}
  </svg>
);

const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20 14.2A8 8 0 0 1 9.8 4 7 7 0 1 0 20 14.2Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

export interface ThemeToggleProps {
  /** Square edge length in px. Defaults to 34 to match the builder topbar. */
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function ThemeToggle({ size = 34, style, className }: ThemeToggleProps) {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      aria-pressed={isDark}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 9,
        cursor: 'pointer',
        border: `1px solid ${TOW.lineStrong}`,
        background: TOW.cardLt,
        color: TOW.inkDim,
        fontFamily: towFont.display,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        ...style,
      }}
    >
      {isDark ? <Sun /> : <Moon />}
    </button>
  );
}
