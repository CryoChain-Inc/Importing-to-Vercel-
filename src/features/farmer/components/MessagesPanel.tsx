import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Card, Icon, type IconName } from '../../../components/common';
import { SkeletonCard, useToast } from '../../../components/feedback';
import {
  NOTICE_PAGE,
  fetchNotices,
  type Notice,
  type ProduceListing,
} from '../../../services/farmer.service';
import { useNearEnd } from '../../../components/layout';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
/** Newest first, no duplicates (a refetch of page one overlaps what is already loaded). */
const merge = (a: Notice[], b: Notice[]) => {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((n) => !seen.has(n.id) && seen.add(n.id))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
};
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' });
};

// Notices are free text from the server, so the icon is inferred from the wording.
const kind = (n: Notice): IconName => {
  const x = `${n.title} ${n.body}`.toLowerCase();
  if (/paid|payout|payment|wallet/.test(x)) return 'wallet';
  if (/truck|driver|pickup|pick up/.test(x)) return 'truck';
  if (/weigh|collect|short/.test(x)) return 'package';
  if (/order|bought|buyer/.test(x)) return 'cart';
  return 'message';
};

/** Messages tab: system updates about the farmer's produce (bought, scheduled, weighed, delivered). */
export function MessagesPanel({ listings }: { listings: ProduceListing[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { show } = useToast();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);
  // null until the first page says whether older messages exist.
  const [more, setMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  // Listings change when a lot is bought, a pickup is scheduled or produce is weighed, so refetch the
  // newest page with them and keep any older pages already loaded.
  useEffect(() => {
    fetchNotices().then(
      (n) => {
        setNotices((prev) => merge(n, prev ?? []));
        setMore((m) => m ?? n.length === NOTICE_PAGE);
        setFailed(false);
      },
      () => {
        setFailed(true);
        show("We couldn't load your messages. Reopen the tab to try again.");
      },
    );
  }, [listings, show]);

  const loadMore = useCallback(() => {
    if (!notices?.length || !more || loadingMore || moreFailed) return;
    setLoadingMore(true);
    // shortcut: pages by created_at, so rows sharing the exact same timestamp across a page edge could be skipped; switch to an (created_at, id) cursor if that shows up.
    fetchNotices(notices[notices.length - 1].createdAt).then(
      (n) => {
        setNotices((prev) => merge(prev ?? [], n));
        setMore(n.length === NOTICE_PAGE);
        setLoadingMore(false);
      },
      () => {
        setMoreFailed(true);
        setLoadingMore(false);
      },
    );
  }, [notices, more, loadingMore, moreFailed]);
  useNearEnd(loadMore);

  if (failed && !notices) {
    return (
      <Card style={s.emptyCard}>
        <Text style={s.emptyTitle}>Couldn’t load messages</Text>
        <Text style={s.note}>Reopen this tab to try again.</Text>
      </Card>
    );
  }
  if (!notices)
    return (
      <View style={s.skel}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </View>
    );
  if (notices.length === 0) {
    return (
      <Card style={s.emptyCard}>
        <View style={s.emptyIcon}>
          <Icon name="message" size={26} color={colors.brandInk} />
        </View>
        <Text style={s.emptyTitle}>No messages yet</Text>
        <Text style={s.note}>
          When a buyer orders your produce, a pickup is booked, or your lot is weighed, it shows up
          here.
        </Text>
      </Card>
    );
  }
  const groups: { key: string; label: string; items: Notice[] }[] = [];
  for (const n of notices) {
    const key = dayKey(n.createdAt);
    const g = groups[groups.length - 1];
    if (g?.key === key) g.items.push(n);
    else groups.push({ key, label: dayLabel(n.createdAt), items: [n] });
  }
  return (
    <View style={s.list}>
      {groups.map((g, gi) => (
        <View key={g.key} style={s.group}>
          <Text style={s.day}>{g.label}</Text>
          <Card style={s.card}>
            {g.items.map((n, i) => (
              <View key={n.id} style={s.item}>
                <View style={s.rail}>
                  <View style={[s.chip, gi === 0 && i === 0 && s.chipNew]}>
                    <Icon name={kind(n)} size={16} color={colors.brandInk} />
                  </View>
                  {i < g.items.length - 1 ? <View style={s.line} /> : null}
                </View>
                <View style={[s.body, i < g.items.length - 1 && s.bodyGap]}>
                  <View style={s.row}>
                    <Text style={s.title}>{n.title}</Text>
                    <Text style={s.time}>{clock(n.createdAt)}</Text>
                  </View>
                  <Text style={s.text}>{n.body}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
      {loadingMore ? (
        <ActivityIndicator color={colors.brand600} accessibilityLabel="Loading older messages" />
      ) : moreFailed ? (
        <Pressable accessibilityRole="button" onPress={() => setMoreFailed(false)} style={s.retry}>
          <Text style={s.retryText}>Couldn’t load older messages. Tap to retry</Text>
        </Pressable>
      ) : more === false && notices.length > NOTICE_PAGE ? (
        <Text style={s.end}>You’re all caught up</Text>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 18 },
  group: { gap: 8 },
  day: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted, paddingHorizontal: 4 },
  card: { paddingVertical: 16, paddingHorizontal: 16 },
  item: { flexDirection: 'row' as const, gap: 12 },
  rail: { alignItems: 'center' as const },
  chip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceSunken,
  },
  chipNew: { backgroundColor: c.brandTint },
  line: { flex: 1, width: 2, marginVertical: 4, backgroundColor: c.borderSubtle },
  body: { flex: 1, gap: 4, paddingTop: 5 },
  bodyGap: { paddingBottom: 18 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  title: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  time: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: c.inkMuted,
    fontVariant: ['tabular-nums' as const],
  },
  text: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: c.inkMuted },
  note: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 21,
    color: c.inkMuted,
    textAlign: 'center' as const,
    maxWidth: 360,
  },
  emptyCard: { alignItems: 'center' as const, gap: 10, paddingVertical: 40 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  skel: { gap: 10 },
  retry: { minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  retryText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.brandInk },
  end: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.inkMuted,
    textAlign: 'center' as const,
  },
});
