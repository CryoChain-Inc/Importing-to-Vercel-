import React from 'react';
import { Text, View } from 'react-native';
import { Card, Icon, type IconName } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Designed placeholder for tabs whose backend is not built yet. Shows no fake data. */
export function ComingSoon({ icon, title, copy, points }: { icon: IconName; title: string; copy: string; points: string[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.card}>
      <View style={s.icon}><Icon name={icon} size={28} color={colors.brandInk} /></View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.copy}>{copy}</Text>
      <View style={s.list}>
        {points.map((p) => (
          <View key={p} style={s.point}>
            <Icon name="check" size={16} color={colors.brand600} strokeWidth={3} />
            <Text style={s.pointText}>{p}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { alignItems: 'center' as const, gap: 10, paddingVertical: 36, paddingHorizontal: 24 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  title: { fontFamily: fonts.sansBold, fontSize: 20, color: c.ink, textAlign: 'center' as const },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 360 },
  list: { gap: 8, marginTop: 8, alignSelf: 'stretch' as const, maxWidth: 360, width: '100%' as const, alignItems: 'flex-start' as const },
  point: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  pointText: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
});
