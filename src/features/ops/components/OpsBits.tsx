import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Card, Icon, type IconName } from '../../../components/common';
import { Skeleton, SkeletonCard } from '../../../components/feedback';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

export const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 0 })} kg`;

/** Headline number with a caption; `tone` colours the figure. */
export function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'brand' | 'warn' | 'danger' }) {
  const s = useThemedStyles(styles);
  return (
    <Card style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone === 'brand' && s.brand, tone === 'warn' && s.warn, tone === 'danger' && s.danger]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </Card>
  );
}

/** Row of Stat tiles that wraps two-up on phones and fills the row on wide screens. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const s = useThemedStyles(styles);
  return <View style={s.grid}>{children}</View>;
}

export { StatHero as Hero } from '../../../components/common';

/** Segmented tabs with counts, for splitting a long page into a few short lists. */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={[s.segBtn, on && s.segOn]}>
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{o.label}{o.count != null ? <Text style={s.segCount}> {o.count}</Text> : null}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** First `page` rows, plus a button that reveals more. Paging restarts when `resetKey` changes. */
export function usePaged<T>(rows: T[], resetKey: string, page = 5) {
  const [state, setState] = useState({ key: resetKey, n: page });
  const n = state.key === resetKey ? state.n : page;
  const left = rows.length - n;
  const more = left > 0
    ? <Button label={`Show ${Math.min(page, left)} more · ${left} left`} variant="outline" onPress={() => setState({ key: resetKey, n: n + page })} />
    : null;
  return { rows: rows.slice(0, n), more };
}

/** Skeleton shaped like a panel: hero, two tiles, then list rows. */
export function PanelSkeleton() {
  const s = useThemedStyles(styles);
  return (
    <View style={s.skel}>
      <Skeleton height={150} radius={24} />
      <View style={s.grid}><Skeleton height={84} radius={16} style={s.tile} /><Skeleton height={84} radius={16} style={s.tile} /></View>
      {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={3} lead />)}
    </View>
  );
}

/** Empty list: say what the section is for and what will appear here. */
export function Empty({ icon, title, hint }: { icon: IconName; title: string; hint: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.empty}>
      <View style={s.emptyIcon}><Icon name={icon} size={22} color={colors.brandInk} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={[s.note, s.center]}>{hint}</Text>
    </Card>
  );
}

export function SectionTitle({ title, note }: { title: string; note?: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}

/** Captioned photo for proof-of-work galleries. */
export function Photo({ uri, caption, size = 112 }: { uri: string | null; caption: string; size?: number }) {
  const s = useThemedStyles(styles);
  return (
    <View style={[s.photo, { width: size }]}>
      {uri ? <Image source={{ uri }} style={[s.photoImg, { width: size, height: size }]} accessibilityLabel={caption} /> : <View style={[s.photoImg, s.photoNone, { width: size, height: size }]}><Text style={s.note}>No photo</Text></View>}
      <Text style={s.photoCap} numberOfLines={2}>{caption}</Text>
    </View>
  );
}

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const styles = (c: Record<ColorToken, string>) => ({
  seg: { flexDirection: 'row' as const, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSunken },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 11, paddingHorizontal: 4 },
  segOn: { backgroundColor: c.surfaceCard, shadowColor: c.brand900, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 1 },
  segText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  segTextOn: { fontFamily: fonts.sansBold, color: c.ink },
  segCount: { fontVariant: ['tabular-nums' as const], color: c.inkMuted },
  skel: { gap: 12 },
  tile: { flexGrow: 1, flexBasis: 150, width: undefined },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  stat: { flexGrow: 1, flexBasis: 150, gap: 4, padding: 16 },
  statLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  statValue: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.4, color: c.ink, fontVariant: ['tabular-nums' as const] },
  brand: { color: c.brandInk },
  warn: { color: c.harvestInk },
  danger: { color: c.dangerInk },
  note: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 28 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  center: { textAlign: 'center' as const, maxWidth: 360 },
  sectionHead: { gap: 2, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 19, letterSpacing: -0.2, color: c.ink },
  photo: { width: 112, gap: 4 },
  photoImg: { width: 112, height: 112, borderRadius: 12, backgroundColor: c.surfaceSunken },
  photoNone: { alignItems: 'center' as const, justifyContent: 'center' as const },
  photoCap: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16, color: c.inkMuted },
});
