import Svg, { Circle, Path } from 'react-native-svg';

/** Outline icon set from the SoloTrav design system: 24 px grid, 1.75 px stroke, rounded caps and joins. */
type Def = { d?: string[]; c?: [number, number, number][] };
const DEFS: Record<string, Def> = {
  home: { d: ['M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  explore: { c: [[12, 12, 9]], d: ['M15.5 8.5l-2 5-5 2 2-5z'] },
  trips: { d: ['M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 17.5H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.5'] },
  user: { d: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'] },
  users: { d: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M19 20a6 6 0 0 0-3-5'] },
  userPlus: { d: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M19 8v6M16 11h6'] },
  search: { c: [[11, 11, 7]], d: ['M20 20l-4-4'] },
  bell: { d: ['M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4'] },
  chat: { d: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z'] },
  back: { d: ['M15 6l-6 6 6 6'] },
  chevR: { d: ['M9 6l6 6-6 6'] },
  chevD: { d: ['M6 9l6 6 6-6'] },
  close: { d: ['M6 6l12 12M18 6L6 18'] },
  plus: { d: ['M12 5v14M5 12h14'] },
  minus: { d: ['M5 12h14'] },
  check: { d: ['M5 12.5l4.5 4.5L19 7'] },
  pin: { c: [[12, 10, 2.5]], d: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'] },
  lock: { d: ['M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3'] },
  globe: { c: [[12, 12, 9]], d: ['M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'] },
  edit: { d: ['M4 20h4L19 9l-4-4L4 16zM13 7l4 4'] },
  bookmark: { d: ['M6 3h12v18l-6-4-6 4z'] },
  share: { d: ['M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5'] },
  play: { d: ['M7 4v16l13-8z'] },
  stop: { d: ['M6 6h12v12H6z'] },
  pause: { d: ['M8 5v14M16 5v14'] },
  star: { d: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'] },
  locate: { c: [[12, 12, 4]], d: ['M12 2v3M12 19v3M2 12h3M19 12h3'] },
  camera: { c: [[12, 13, 3.5]], d: ['M4 8h3l2-3h6l2 3h3v11H4z'] },
  grip: { d: ['M5 9h14M5 15h14'] },
  copy: { d: ['M9 9h10v10H9zM5 15V5h10'] },
  mail: { d: ['M3 6h18v12H3zM3 7l9 7 9-7'] },
  heart: { d: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'] },
  send: { d: ['M5 12h14M13 6l6 6-6 6'] },
  settings: { c: [[8, 7, 2], [16, 17, 2]], d: ['M4 7h2M10 7h10M4 17h10M18 17h2'] },
  more: { d: ['M5 12h.01M12 12h.01M19 12h.01'] },
  note: { d: ['M4 5h16v11H8l-4 4zM8 9h8M8 12h5'] },
  logout: { d: ['M10 4H5v16h5M15 8l4 4-4 4M19 12H9'] },
  trash: { d: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'] },
  flag: { d: ['M5 21V4M5 4h11l-2 4 2 4H5'] },
  route: { c: [[6, 18, 2.5], [18, 6, 2.5]], d: ['M8.5 17.5H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.5'] },
  image: { c: [[9, 10, 1.5]], d: ['M4 5h16v14H4zM4 16l5-4 4 3 3-2 4 3'] },
  record: { c: [[12, 12, 7]] },
  info: { c: [[12, 12, 9]], d: ['M12 11v5M12 8h.01'] },
};

export type IconName = keyof typeof DEFS;

export function Icon({ name, size = 24, color = '#182230', strokeWidth = 1.75, fill }: { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string }) {
  const def = DEFS[name] as Def;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {def.c?.map(([cx, cy, r], i) => <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill={fill ?? 'none'} />)}
      {def.d?.map((d, i) => <Path key={`d${i}`} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill={fill ?? 'none'} />)}
    </Svg>
  );
}

/** The SoloTrav mark: a rounded blue square with a route line. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M12 0h24a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H12A12 12 0 0 1 0 36V12A12 12 0 0 1 12 0z" fill="#1769FF" />
      <Path d="M14 38 C 20 20, 30 44, 42 18" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" fill="none" transform="translate(-4 -2)" />
      <Circle cx={38} cy={16} r={4.5} fill="#FF7657" />
    </Svg>
  );
}
