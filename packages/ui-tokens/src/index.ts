/** SoloTrav design tokens. Single source of truth for web (CSS variables / Tailwind) and mobile (React Native). */
export const colors = {
  primary: '#1769FF',
  primaryPressed: '#0B43AD',
  primarySoft: '#EAF1FF',
  navy: '#102A43',
  teal: '#19B5A5',
  tealText: '#0E7C70',
  tealSoft: '#E3F6F3',
  coral: '#FF7657',
  coralText: '#C8401F',
  coralSoft: '#FFEFEA',
  background: '#F7F9FC',
  surface: '#FFFFFF',
  text: '#182230',
  // Design system v1.0: #5B6678 is 5.8:1 on white (the old #697586 was lighter).
  textSecondary: '#5B6678',
  border: '#E5EAF0',
  /** Inputs and outlined controls (3.1:1 non-text contrast). */
  controlBorder: '#8793A6',
  mutedFill: '#F1F4F8',
  /** Completed text and icons. */
  success: '#0F7A55',
  /** Completed pins and progress fills (use with a white check). */
  successFill: '#15966A',
  successSoft: '#E3F5EE',
  warning: '#9A6200',
  warningFill: '#E6A23C',
  error: '#C23535',
} as const;

export type ColorTokens = { [K in keyof typeof colors]: string };

export const darkColors: ColorTokens = {
  primary: '#5B97FF',
  primaryPressed: '#3C7BEA',
  primarySoft: '#14305A',
  navy: '#F1F5FA',
  teal: '#3CCFBF',
  tealText: '#3CCFBF',
  tealSoft: '#0F3A38',
  coral: '#FF7657',
  coralText: '#FF9A80',
  coralSoft: '#4A2A22',
  background: '#0B1622',
  surface: '#12202F',
  text: '#EAF0F7',
  textSecondary: '#A5B2C3',
  border: '#26374A',
  controlBorder: '#5C6E85',
  mutedFill: '#1A2B3D',
  success: '#3DC291',
  successFill: '#15966A',
  successSoft: '#12372B',
  warning: '#E6A23C',
  warningFill: '#E6A23C',
  error: '#F07A7A',
};

/** Map-state colours: planned / completed / saved / destination / route must stay visually distinct. */
export const mapColors = {
  planned: '#1769FF',
  completed: '#15966A',
  saved: '#FF7657',
  destination: '#102A43',
  current: '#1769FF',
  route: '#FF7657',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const iconSizes = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
/** Minimum interactive target in px/dp. */
export const touchTarget = 44;

export const typography = {
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  // Design system v1.0 scale: caption 12, label 14, body 15, heading 3 17, heading 2 20, heading 1 24, display 32, stat 40. Minimum 12.
  size: { xs: 12, sm: 13, label: 14, base: 15, md: 16, lg: 17, xl: 20, h1: 24, display: 32, stat: 40 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  lineHeight: { tight: 1.2, normal: 1.5 },
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(16,42,67,.06)',
  md: '0 1px 2px rgba(16,42,67,.06), 0 4px 14px rgba(16,42,67,.06)',
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const vars = (c: ColorTokens) =>
  Object.entries(c)
    .map(([k, v]) => `--st-${kebab(k)}:${v};`)
    .join('');

/** CSS custom properties for the web apps (light + dark). */
export function cssVariables(): string {
  return (
    `:root{${vars(colors)}--st-radius-md:${radii.md}px;--st-radius-lg:${radii.lg}px;}` +
    `:root[data-theme=dark]{${vars(darkColors)}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${vars(darkColors)}}}`
  );
}
