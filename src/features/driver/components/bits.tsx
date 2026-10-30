import type { ReactNode } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Button, Card } from '../../../components/common';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

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

export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} icon="arrowLeft" variant="ghost" size="sm" onPress={onPress} />;
}

export function DetailCard({ title, lines, actions }: { title: string; lines: string[]; actions?: ReactNode }) {
  const s = useThemedStyles(styles);
  return (
    <Card style={s.card}>
      <Text style={s.title}>{title}</Text>
      {lines.filter(Boolean).map((line, i) => <Text key={`${i}-${line}`} style={s.meta}>{line}</Text>)}
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
