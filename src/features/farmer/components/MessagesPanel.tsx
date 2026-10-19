import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Icon } from '../../../components/common';
import { SkeletonCard } from '../../../components/feedback';
import { fetchNotices, type Notice, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

const when = (iso: string) => new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Messages tab: system updates about the farmer's produce (bought, scheduled, weighed, delivered). */
export function MessagesPanel({ listings }: { listings: ProduceListing[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Listings change when a lot is bought, a pickup is scheduled or produce is weighed, so refetch with them.
  useEffect(() => {
    fetchNotices().then((n) => { setNotices(n); setFailed(false); }, () => setFailed(true));
  }, [listings]);

  if (failed && !notices) return <Text style={s.note}>We couldn&apos;t load your messages. Pull the page down or reopen the tab to try again.</Text>;
  if (!notices) return <View style={s.skel}>{[0, 1, 2].map((i) => <SkeletonCard key={i} lines={3} />)}</View>;
  if (notices.length === 0) {
    return (
      <Card style={s.emptyCard}>
        <View style={s.emptyIcon}><Icon name="message" size={26} color={colors.brandInk} /></View>
        <Text style={s.emptyTitle}>No messages yet</Text>
        <Text style={s.note}>When a buyer orders your produce, a pickup is booked, or your lot is weighed, it shows up here.</Text>
      </Card>
    );
  }
  return (
    <View style={s.list}>
      {notices.map((n, i) => (
        <Card key={n.id} style={s.item} tone={i === 0 ? 'tint' : 'default'}>
          <View style={s.dotCol}><View style={[s.dot, i === 0 && s.dotNew]} /></View>
          <View style={s.body}>
            <View style={s.row}>
              <Text style={s.title}>{n.title}</Text>
              <Text style={s.time}>{when(n.createdAt)}</Text>
            </View>
            <Text style={s.text}>{n.body}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { flexDirection: 'row' as const, gap: 12, padding: 16 },
  dotCol: { paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.borderStrong },
  dotNew: { backgroundColor: c.brand500 },
  body: { flex: 1, gap: 4 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  title: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  time: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted, fontVariant: ['tabular-nums' as const] },
  text: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: c.inkMuted },
  note: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 360 },
  emptyCard: { alignItems: 'center' as const, gap: 10, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  skel: { gap: 10 },
});
