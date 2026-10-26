/** The SoloTrav mark: a rounded blue square with a route line and a coral destination dot. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="SoloTrav logo">
      <path d="M12 0h24a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H12A12 12 0 0 1 0 36V12A12 12 0 0 1 12 0z" fill="#1769FF" />
      <path d="M14 38 C 20 20, 30 44, 42 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" transform="translate(-4 -2)" />
      <circle cx="38" cy="16" r="4.5" fill="#FF7657" />
    </svg>
  );
}
