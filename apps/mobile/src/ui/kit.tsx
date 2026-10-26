import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon, Logo, type IconName } from '@/ui/icons';
import { FONT, shadow, useTheme, type Weight } from '@/ui/theme';

/** Screen shell. `scroll` wraps children in a ScrollView; `footer` pins a bar (primary action) above the system inset. */
export function Screen({ children, scroll = true, pad = true, style, footer, edges = ['top'] }: { children: ReactNode; scroll?: boolean; pad?: boolean; style?: StyleProp<ViewStyle>; footer?: ReactNode; edges?: ('top' | 'bottom')[] }) {
  const { c } = useTheme();
  const inner = { padding: pad ? 16 : 0, paddingBottom: footer ? 24 : 48 } as const;
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.background }, style]}>
      {scroll ? <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[{ flex: 1 }, inner]}>{children}</View>}
      {footer}
    </SafeAreaView>
  );
}

type Tone = 'default' | 'muted' | 'primary' | 'error' | 'success' | 'inverse' | 'navy';
type Size = 'xs' | 'sm' | 'label' | 'base' | 'md' | 'lg' | 'xl' | 'h1' | 'display' | 'stat';
const LINE: Record<Size, number> = { xs: 16, sm: 18, label: 20, base: 22, md: 24, lg: 24, xl: 28, h1: 32, display: 40, stat: 44 };

export function Text({ children, size = 'base', weight = 'regular', tone = 'default', style, tabular, ...rest }: { children?: ReactNode; size?: Size; weight?: Weight; tone?: Tone; style?: StyleProp<TextStyle>; numberOfLines?: number; tabular?: boolean; accessibilityRole?: 'header' | 'link' | 'text'; accessibilityLabel?: string }) {
  const { c, typography } = useTheme();
  const color = { default: c.text, muted: c.textSecondary, primary: c.primary, error: c.error, success: c.success, inverse: '#fff', navy: '#102A43' }[tone];
  return <RNText {...rest} style={[{ color, fontFamily: FONT[weight], fontSize: typography.size[size], lineHeight: LINE[size] }, tabular ? { fontVariant: ['tabular-nums'] } : null, style]}>{children}</RNText>;
}

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'coral' | 'success';
/** Inline buttons are 48 high with 12 radius; full-width action bars use size="lg" (56 high, 16 radius). */
export function Button({ title, onPress, variant = 'primary', loading, disabled, style, icon, iconName, size = 'md', fullWidth }: { title: string; onPress: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: string; iconName?: IconName; size?: 'sm' | 'md' | 'lg'; fullWidth?: boolean }) {
  const { c } = useTheme();
  const v = variant === 'ghost' ? 'tertiary' : variant;
  const off = disabled || loading;
  const bg = off && v !== 'secondary' && v !== 'tertiary' ? c.border : { primary: c.primary, secondary: c.surface, tertiary: 'transparent', danger: c.error, coral: c.coral, success: c.success }[v];
  const fg = off ? (v === 'secondary' || v === 'tertiary' ? c.controlBorder : '#7A8598') : { primary: '#fff', secondary: c.primary, tertiary: c.primary, danger: '#fff', coral: '#102A43', success: '#fff' }[v];
  const h = size === 'lg' ? 56 : size === 'sm' ? 40 : 48;
  const radius = size === 'lg' ? 16 : 12;
  const pressedBg = { primary: c.primaryPressed, secondary: c.primarySoft, tertiary: c.primarySoft, danger: '#8F2323', coral: '#F2644A', success: '#0B5E41' }[v];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress}
      style={({ pressed }) => [{ height: h, minWidth: 96, borderRadius: radius, paddingHorizontal: size === 'lg' ? 16 : 20, backgroundColor: pressed ? pressedBg : bg, borderWidth: v === 'secondary' ? 1.5 : 0, borderColor: off ? c.border : c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, fullWidth ? { alignSelf: 'stretch' } : null, style]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : iconName ? <Icon name={iconName} size={size === 'lg' ? 22 : 20} color={fg} strokeWidth={2.25} /> : null}
      <RNText style={{ color: fg, fontFamily: size === 'lg' ? FONT.bold : FONT.semibold, fontSize: size === 'lg' ? 17 : 15 }}>{icon ? `${icon}  ` : ''}{loading ? 'Working…' : title}</RNText>
    </Pressable>
  );
}

/** White card, 1 px border, 16 radius. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const s = [{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const }, style];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...s, { opacity: pressed ? 0.92 : 1 }]}>{children}</Pressable> : <View style={s}>{children}</View>;
}

/** Labelled input: 48 high, 12 radius, 1 px control border; focus = 2 px blue border with a soft 4 px ring. */
export function Field({ label, error, hint, optional, trailing, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string; optional?: boolean; trailing?: ReactNode }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  const border = error ? c.error : focus ? c.primary : c.controlBorder;
  const multi = !!props.multiline;
  return (
    <View style={{ marginBottom: 14 }}>
      <RNText style={{ color: c.text, fontFamily: FONT.semibold, fontSize: 14, marginBottom: 4 }}>{label}{optional ? <RNText style={{ fontFamily: FONT.regular, color: c.textSecondary }}> (optional)</RNText> : null}</RNText>
      <View style={focus ? { margin: -4, padding: 4, borderRadius: 16, backgroundColor: 'rgba(23,105,255,0.18)' } : null}>
        <View style={{ minHeight: multi ? 84 : 48, borderRadius: 12, borderWidth: focus || error ? 2 : 1, borderColor: border, backgroundColor: c.surface, flexDirection: 'row', alignItems: multi ? 'flex-start' : 'center', paddingHorizontal: focus || error ? 12 : 13 }}>
          <TextInput accessibilityLabel={label} placeholderTextColor={c.textSecondary} {...props}
            onFocus={(e) => { setFocus(true); props.onFocus?.(e); }} onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
            style={[{ flex: 1, minWidth: 0, color: c.text, fontFamily: FONT.regular, fontSize: 15, paddingVertical: multi ? 10 : 0, height: multi ? undefined : 46 }, multi ? { textAlignVertical: 'top', minHeight: 80 } : null, props.style]} />
          {trailing}
        </View>
      </View>
      {error ? <RNText accessibilityRole="alert" style={{ color: c.error, fontFamily: FONT.medium, fontSize: 12, marginTop: 4 }}>{error}</RNText> : hint ? <RNText style={{ color: c.textSecondary, fontFamily: FONT.regular, fontSize: 12, marginTop: 4 }}>{hint}</RNText> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' | 'ok'; icon?: IconName }) {
  const { c, dark } = useTheme();
  const m = {
    info: { bg: c.primarySoft, border: c.primarySoft, fg: c.primary, ic: 'info' as IconName },
    warn: { bg: dark ? '#3B2D0F' : '#FFF3DC', border: dark ? '#3B2D0F' : '#FFF3DC', fg: c.warning, ic: 'info' as IconName },
    error: { bg: dark ? '#3F1B1B' : '#FBE7E7', border: dark ? '#3F1B1B' : '#FBE7E7', fg: c.error, ic: 'info' as IconName },
    ok: { bg: c.successSoft, border: c.success, fg: c.success, ic: 'lock' as IconName },
  }[tone];
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={{ backgroundColor: m.bg, borderRadius: 12, borderWidth: tone === 'ok' ? 1 : 0, borderColor: m.border, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 1 }}><Icon name={icon ?? m.ic} size={20} color={m.fg} /></View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text size="sm" style={{ lineHeight: 18 }}>{children}</Text> : children}</View>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'blue' | 'ok' | 'warn' | 'bad' | 'coral' }) {
  const { c, dark } = useTheme();
  const map = { neutral: [c.border, c.text], blue: [c.primarySoft, c.primaryPressed], ok: [c.successSoft, c.success], warn: [dark ? '#3B2D0F' : '#FFF3DC', c.warning], bad: [dark ? '#3F1B1B' : '#FBE7E7', c.error], coral: [c.coralSoft, c.coralText] }[tone];
  return <View style={{ backgroundColor: map[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' }}><RNText style={{ color: map[1], fontFamily: FONT.semibold, fontSize: 12 }}>{label}</RNText></View>;
}

/** Filter chip: 36 high pill. Selected = blue tint, 1.5 px blue border and a check mark (never colour alone). */
export function Chip({ label, selected, onPress, disabled, icon }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: selected ? c.primarySoft : pressed ? c.mutedFill : c.surface, borderWidth: selected ? 1.5 : 1, borderColor: selected ? c.primary : disabled ? c.border : c.controlBorder })}>
      {selected ? <Icon name="check" size={16} color={c.primaryPressed} strokeWidth={2.25} /> : icon ? <Icon name={icon} size={16} color={c.text} /> : null}
      <RNText style={{ color: disabled ? c.controlBorder : selected ? c.primaryPressed : c.text, fontFamily: FONT.semibold, fontSize: 14 }}>{label}</RNText>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={8}
      style={{ width: 52, height: 32, borderRadius: 16, borderWidth: 2, borderColor: value ? c.primary : c.controlBorder, backgroundColor: value ? c.primary : c.surface, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: value ? 24 : 4, width: 20, height: 20, borderRadius: 10, backgroundColor: value ? '#fff' : c.controlBorder }} />
    </Pressable>
  );
}

/** Row with a title, optional helper line and a switch. */
export function ToggleRow({ title, helper, value, onChange }: { title: string; helper?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Text size="label" weight="semibold">{title}</Text>
        {helper ? <Text size="xs" tone="muted">{helper}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

/** Thin progress bar (used for uploads and single values). */
export function Progress({ percent, label }: { percent: number; label?: string }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Progress'} accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', backgroundColor: c.successFill, borderRadius: 4 }} />
    </View>
  );
}

/** Segmented step/stop progress: filled = done (green), one current (blue), rest grey. */
export function Segments({ total, done, current, height = 6, doneColor, label }: { total: number; done: number; current?: number; height?: number; doneColor?: string; label?: string }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label ?? `${done} of ${total}`} accessibilityValue={{ min: 0, max: total, now: done }} style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: i < done ? (doneColor ?? c.successFill) : current !== undefined && i === current ? c.primary : c.border }} />
      ))}
    </View>
  );
}

const AVATAR_COLORS = ['#19B5A5', '#E6A23C', '#8793A6', '#FF7657', '#102A43', '#1769FF'];
export function Avatar({ name, size = 40, ring, gradient }: { name: string; size?: number; ring?: 'dashed' | 'blue' | 'plain'; gradient?: boolean }) {
  const initials = name.split(/[\s._]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  const bg = AVATAR_COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length] as string;
  const fg = bg === '#102A43' || bg === '#1769FF' || bg === '#8793A6' ? '#fff' : '#102A43';
  const core = (
    <View accessibilityElementsHidden style={{ width: '100%', height: '100%', borderRadius: size, backgroundColor: gradient ? '#1769FF' : bg, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ color: gradient ? '#fff' : fg, fontFamily: FONT.bold, fontSize: Math.round(size * 0.36) }}>{initials}</RNText>
    </View>
  );
  if (!ring) return <View style={{ width: size, height: size }}>{core}</View>;
  return (
    <View style={{ width: size, height: size, borderRadius: size, padding: 3, borderWidth: ring === 'blue' ? 3 : 2, borderStyle: ring === 'dashed' ? 'dashed' : 'solid', borderColor: ring === 'blue' ? '#1769FF' : ring === 'dashed' ? '#8793A6' : '#E5EAF0' }}>{core}</View>
  );
}

export function EmptyState({ title, body, action, icon = 'explore' }: { title: string; body?: string; action?: ReactNode; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={32} color={c.primary} /></View>
      <Text size="xl" weight="bold" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text tone="muted" style={{ textAlign: 'center' }}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Skeleton({ height = 80, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View accessibilityElementsHidden style={[{ height, borderRadius: 16, backgroundColor: c.border, opacity: 0.6, marginBottom: 12 }, style]} />;
}

/** 56 px header with back button, title and an optional right label (e.g. "2 of 5"). */
export function TopBar({ title, right, onBack, close }: { title: string; right?: ReactNode; onBack?: () => void; close?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <View style={{ height: 56, paddingLeft: 4, paddingRight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={close ? 'Close' : 'Back'} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home')))} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={close ? 'close' : 'back'} size={24} color={c.text} />
        </Pressable>
        <Text size="lg" weight="bold" numberOfLines={1} accessibilityRole="header" style={{ fontSize: 18, flex: 1 }}>{title}</Text>
      </View>
      {typeof right === 'string' ? <Text size="sm" weight="semibold" tone="muted">{right}</Text> : right}
    </View>
  );
}

/** Home header: logo, wordmark and the search / notifications / messages / avatar cluster. */
export function AppHeader({ unread = 0, name = '?' }: { unread?: number; name?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const btn = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ height: 64, paddingLeft: 16, paddingRight: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Logo size={32} />
        <RNText accessibilityRole="header" style={{ fontFamily: FONT.extrabold, fontSize: 20, letterSpacing: -0.4, color: c.navy }}>SoloTrav</RNText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" style={btn} onPress={() => router.push('/(tabs)/explore')}><Icon name="search" color={c.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} style={btn} onPress={() => router.push('/notifications')}>
          <Icon name="bell" color={c.text} />
          {unread > 0 ? <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.error, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: '#fff', fontFamily: FONT.bold, fontSize: 11 }}>{unread > 9 ? '9+' : unread}</RNText></View> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Messages" style={btn} onPress={() => router.push('/messages')}><Icon name="chat" color={c.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/(tabs)/profile')} style={{ marginLeft: 4 }}><Avatar name={name} size={36} gradient /></Pressable>
      </View>
    </View>
  );
}

/** Bottom action bar for wizard/composer screens. */
export function ActionBar({ children, height = 84 }: { children: ReactNode; height?: number }) {
  const { c } = useTheme();
  return <View style={{ minHeight: height, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{children}</View>;
}

/** A tappable row with a leading icon, a small caption and a value (used in composers and settings). */
export function ListRow({ icon, caption, value, onPress, trailing, destructive }: { icon?: IconName; caption?: string; value: string; onPress?: () => void; trailing?: ReactNode; destructive?: boolean }) {
  const { c } = useTheme();
  const body = (
    <View style={{ minHeight: 52, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon ? <Icon name={icon} size={22} color={destructive ? c.error : c.primary} /> : null}
      <View style={{ flex: 1 }}>
        {caption ? <Text size="xs" tone="muted">{caption}</Text> : null}
        <Text size="base" weight="semibold" style={destructive ? { color: c.error } : null}>{value}</Text>
      </View>
      {trailing ?? (onPress ? <Icon name="chevR" size={20} color={c.textSecondary} /> : null)}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? c.mutedFill : 'transparent' })}>{body}</Pressable> : body;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
      <Text size="lg" weight="bold" accessibilityRole="header">{children}</Text>
      {action ? <Pressable accessibilityRole="link" onPress={onAction} hitSlop={8}><Text size="sm" weight="semibold" tone="primary">{action}</Text></Pressable> : null}
    </View>
  );
}

export { shadow };
export const StyleSheetHelpers = StyleSheet;
