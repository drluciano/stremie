import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { C } from '@/constants/theme';

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? 'rgba(255,92,122,0.15)' : C.cardHi;
  const fg = kind === 'danger' ? C.bad : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Section({ title, children, footer }: { title: string; children: React.ReactNode; footer?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Pill({ text, color = C.dim, bg = C.cardHi }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  section: { marginTop: 24, marginHorizontal: 16 },
  sectionTitle: { color: C.dim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  sectionBody: { backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 12 },
  footer: { color: C.faint, fontSize: 12, marginTop: 6, lineHeight: 17 },
  pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
});
