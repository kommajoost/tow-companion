// The app logo, shown as a rounded square — used on the light parchment screens
// (home cover + companion header). The logo already carries its own dark ground.
export function LogoMark({ size = 40, radius }: { size?: number; radius?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.png`}
      alt="Old World Companion"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'block',
        flexShrink: 0,
        borderRadius: radius ?? Math.round(size * 0.2),
        objectFit: 'cover',
      }}
    />
  );
}
