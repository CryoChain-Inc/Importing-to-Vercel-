import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { Button, Card, Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

export function openMaps(lat: number, lng: number) {
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url);
}

export function openPhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits) Linking.openURL(`tel:${digits}`);
}

export const placed = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} icon="arrowLeft" variant="ghost" size="sm" onPress={onPress} style={{ alignSelf: 'flex-start' }} />;
}

/** One screen's single most important card: a label, a headline, supporting lines and the one button that moves the job on. */
export function NextCard({ eyebrow, title, lines, label, onPress, children }: {
  eyebrow: string;
  title: string;
  lines?: string[];
  label?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const s = useThemedStyles(styles);
  return (
    <Card tone="tint" style={s.next}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.headline}>{title}</Text>
      {(lines ?? []).filter(Boolean).map((line, i) => <Text key={`${i}-${line}`} style={s.meta}>{line}</Text>)}
      {children}
      {label && onPress ? <Button size="lg" label={label} icon="arrowRight" onPress={onPress} /> : null}
    </Card>
  );
}

/** Call / navigate / message: equal-width tap targets under a card. */
export function QuickActions({ items }: { items: { icon: 'phone' | 'pin' | 'message'; label: string; onPress: () => void }[] }) {
  const s = useThemedStyles(styles);
  if (items.length === 0) return null;
  return (
    <View style={s.quick}>
      {items.map((it) => <Button key={it.label} variant="tonal" icon={it.icon} label={it.label} onPress={it.onPress} style={s.quickBtn} />)}
    </View>
  );
}

/** Tappable list row: a lead marker, two lines and a chevron. */
export function RowCard({ lead, title, sub, right, done, onPress }: {
  lead?: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
  done?: boolean;
  onPress: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.row, pressed ? s.pressed : null]}>
      {lead}
      <View style={s.rowText}>
        <Text style={[s.rowTitle, done ? s.rowDone : null]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={s.meta} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right}
      <Icon name="chevronRight" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

/** Numbered step marker; a check once done. */
export function StepDot({ n, done, now }: { n: number; done?: boolean; now?: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={[s.dot, done ? s.dotDone : null, now ? s.dotNow : null]}>
      {done ? <Icon name="check" size={16} color="#ffffff" /> : <Text style={[s.dotText, now ? s.dotTextNow : null]}>{n}</Text>}
    </View>
  );
}

export function SectionLabel({ text }: { text: string }) {
  const s = useThemedStyles(styles);
  return <Text style={s.section}>{text}</Text>;
}

/** A label above a value, for the few facts a driver needs at a glance. */
export function Fact({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  next: { gap: 10, padding: 20 },
  eyebrow: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: c.brandInk },
  headline: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  quick: { flexDirection: 'row' as const, gap: 8 },
  quickBtn: { flex: 1 },
  row: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: c.surfaceCard, borderRadius: 14, borderWidth: 1, borderColor: c.cardEdge,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  rowDone: { color: c.inkMuted },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken, borderWidth: 1, borderColor: c.borderSubtle },
  dotDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  dotNow: { backgroundColor: c.brandTint, borderColor: c.brand600 },
  dotText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.inkMuted },
  dotTextNow: { color: c.brandInk },
  section: { fontFamily: fonts.sansBold, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: c.inkMuted, marginTop: 6 },
  fact: { flex: 1, gap: 2 },
  factLabel: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  factValue: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
});
