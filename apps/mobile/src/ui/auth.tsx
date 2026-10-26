import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Icon, Logo } from '@/ui/icons';
import { Field, Text } from '@/ui/kit';
import { FONT, shadow, useTheme } from '@/ui/theme';

/** White auth page: logo, title, subtitle, then content. Matches the design's "Screen 3A". */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Logo size={48} />
        <View>
          <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, color: c.navy }}>{title}</Text>
          {subtitle ? <Text tone="muted" style={{ marginTop: 4 }}>{subtitle}</Text> : null}
        </View>
        {children}
        {footer ? <View style={{ marginTop: 'auto', paddingTop: 12 }}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Two-way segmented control (Sign up / Log in). */
export function Segmented({ options, value, onChange }: { options: Array<{ key: string; label: string }>; value: string; onChange: (key: string) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.mutedFill, borderRadius: 12, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)}
            style={[{ flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' }, on ? shadow[1] : null]}>
            <RNText style={{ fontFamily: on ? FONT.bold : FONT.semibold, fontSize: 14, color: on ? c.text : c.textSecondary }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function GoogleButton({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" onPress={onPress}
      style={({ pressed }) => ({ height: 52, borderRadius: 12, borderWidth: 1, borderColor: c.controlBorder, backgroundColor: pressed ? c.mutedFill : c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 })}>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: c.primary, fontFamily: FONT.extrabold, fontSize: 13 }}>G</RNText></View>
      <RNText style={{ color: c.text, fontFamily: FONT.semibold, fontSize: 15 }}>Continue with Google</RNText>
    </Pressable>
  );
}

export function OrDivider({ label = 'or use email' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      <Text size="sm" tone="muted">{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
    </View>
  );
}

/** Password input with a Show/Hide toggle and an optional strength meter (4 segments). */
export function PasswordField({ label = 'Password', value, onChangeText, meter, ...rest }: { label?: string; value: string; onChangeText: (v: string) => void; meter?: boolean; autoComplete?: 'password' | 'new-password'; textContentType?: 'password' | 'newPassword' }) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  const score = Math.min(4, (value.length >= 8 ? 1 : 0) + (value.length >= 10 ? 1 : 0) + (/[A-Z]/.test(value) && /[a-z]/.test(value) ? 1 : 0) + (/\d/.test(value) || /[^A-Za-z0-9]/.test(value) ? 1 : 0));
  const word = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][value ? score : 0] ?? '';
  return (
    <View>
      <Field label={label} value={value} onChangeText={onChangeText} secureTextEntry={!show} autoCapitalize="none" {...rest}
        trailing={<Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow(!show)} style={{ height: 44, justifyContent: 'center', paddingLeft: 8 }}><RNText style={{ color: c.primary, fontFamily: FONT.bold, fontSize: 13 }}>{show ? 'Hide' : 'Show'}</RNText></Pressable>} />
      {meter && value ? (
        <View style={{ marginTop: -8, marginBottom: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < score ? (score >= 3 ? c.success : c.warningFill) : c.border }} />)}</View>
          <RNText style={{ color: score >= 3 ? c.success : c.textSecondary, fontFamily: FONT.semibold, fontSize: 12 }}>{word}{score >= 3 ? ' · 8 or more characters' : ''}</RNText>
        </View>
      ) : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: checked ? 0 : 2, borderColor: c.controlBorder, backgroundColor: checked ? c.primary : c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 0 }}>{checked ? <Icon name="check" size={16} color="#fff" strokeWidth={2.5} /> : null}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** "Already a member? Log in" style footer line. */
export function AuthLink({ prefix, link, href }: { prefix: string; link: string; href: '/(auth)/login' | '/(auth)/signup' | '/(auth)/forgot' }) {
  const router = useRouter();
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.replace(href)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ color: c.textSecondary, fontFamily: FONT.regular, fontSize: 14 }}>{prefix} <RNText style={{ color: c.primary, fontFamily: FONT.bold }}>{link}</RNText></RNText>
    </Pressable>
  );
}
