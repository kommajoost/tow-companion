import { useTheme } from '../theme';

// The app logo — used on the home cover, companion header, nav rail and settings. In the dark theme
// it's the gold emblem on its own black ground (a rounded tile); in the light theme we swap to the
// transparent emblem so the gold sits straight on the parchment instead of on a black square.
export function LogoMark({ size = 40, radius }: { size?: number; radius?: number }) {
  const { mode } = useTheme();
  const file = mode === 'dark' ? 'logo.png' : 'logo-light.png';
  return (
    <img
      src={`${import.meta.env.BASE_URL}${file}`}
      alt="Old World Companion"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'block',
        flexShrink: 0,
        borderRadius: mode === 'dark' ? (radius ?? Math.round(size * 0.2)) : 0,
        objectFit: 'cover',
      }}
    />
  );
}
