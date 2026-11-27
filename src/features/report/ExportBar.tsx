import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Card, Icon, type IconName } from '../../components/common';
import type { ExportFormat } from '../../services/report.service';
import {
  focusRing,
  fonts,
  useTheme,
  useThemedStyles,
  type ColorToken,
  type PressState,
} from '../../theme';

const FORMATS: { key: ExportFormat; title: string; sub: string; icon: IconName }[] = [
  { key: 'pdf', title: 'PDF report', sub: 'Invoice-style report with map and totals', icon: 'clipboard' },
  { key: 'xlsx', title: 'Excel workbook', sub: 'Summary, products and every listing', icon: 'grid' },
  { key: 'csv', title: 'CSV data', sub: 'Plain rows for any tool', icon: 'download' },
];

/** One tile per export format; all three download what the filters currently show. */
export function ExportBar({
  count,
  busy,
  disabled,
  onExport,
}: {
  count: number;
  busy: ExportFormat | null;
  disabled: boolean;
  onExport: (f: ExportFormat) => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Download this view</Text>
        <Text style={s.note}>
          {count.toLocaleString('en-GH')} farmer{count === 1 ? '' : 's'}, filters and sort applied
        </Text>
      </View>
      <View style={s.tiles}>
        {FORMATS.map((f) => {
          const loading = busy === f.key;
          const off = disabled || busy !== null;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityLabel={`Download ${f.title}`}
              accessibilityState={{ disabled: off, busy: loading }}
              disabled={off}
              onPress={() => onExport(f.key)}
              style={({ hovered, pressed, focused }: PressState) => [
                s.tile,
                hovered && !off && s.hover,
                pressed && s.press,
                off && !loading && s.off,
                focused && focusRing(colors.focusRing),
              ]}
            >
              <View style={s.icon}>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.brandInk} />
                ) : (
                  <Icon name={f.icon} size={20} color={colors.brandInk} />
                )}
              </View>
              <View style={s.grow}>
                <Text style={s.tileTitle} numberOfLines={1}>
                  {loading ? 'Preparing…' : f.title}
                </Text>
                <Text style={s.tileSub} numberOfLines={2}>
                  {f.sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 12 },
  head: { gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: 17, color: c.ink },
  note: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  tile: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 68,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceCard,
  },
  hover: { borderColor: c.brand500, backgroundColor: c.brandTint },
  press: { transform: [{ scale: 0.985 }] },
  off: { opacity: 0.5 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  grow: { flex: 1, minWidth: 0 },
  tileTitle: { fontFamily: fonts.sansBold, fontSize: 14.5, color: c.ink },
  tileSub: { fontFamily: fonts.sansRegular, fontSize: 12.5, color: c.inkMuted, marginTop: 1 },
});
