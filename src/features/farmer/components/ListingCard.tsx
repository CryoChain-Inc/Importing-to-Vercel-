import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { produceImageUrl, type ProduceListing, type Sale } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { EditListing } from './EditListing';

export function ListingCard({ listing: l, sales = [], onRemove, onSaved }: { listing: ProduceListing; /** This listing's orders. */ sales?: Sale[]; onRemove?: (id: string) => void; onSaved: () => Promise<void> }) {
  const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} ${l.unit}`;
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const photo = l.imagePaths[0];
  const pct = (kg: number) => `${Math.min(100, (kg / l.weightKg) * 100)}%` as const;
  const soldOut = l.remainingKg <= 0;
  const toCollect = sales.filter((x) => x.status === 'awaiting_delivery').length;
  if (editing) return <Card style={s.card}><EditListing listing={l} onDone={() => setEditing(false)} onSaved={onSaved} /></Card>;
  return (
    <Card style={s.card}>
      <View style={s.top}>
        <View style={s.thumb}>
          {photo ? <Image source={{ uri: produceImageUrl(photo) }} style={s.img} accessibilityLabel={`${l.product} photo`} /> : <Icon name="leaf" size={24} color={colors.brandInk} />}
        </View>
        <View style={s.main}>
          <View style={s.titleRow}>
            <Text style={s.product} numberOfLines={1}>{l.product}</Text>
            <Badge label={l.unit} tone="success" />
          </View>
          <Text style={s.meta}>{kgText(l.weightKg)} listed · {new Date(l.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })}</Text>
        </View>
      </View>

      {l.imagePaths.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
          {l.imagePaths.map((p, i) => <Image key={p} source={{ uri: produceImageUrl(p) }} style={s.photo} accessibilityLabel={`${l.product} photo ${i + 1} of ${l.imagePaths.length}`} />)}
        </ScrollView>
      ) : null}

      <View style={s.track} accessibilityLabel={`${kgText(l.reservedKg)} reserved, ${kgText(l.collectedKg)} collected, ${kgText(l.remainingKg)} available of ${kgText(l.weightKg)}`}>
        <View style={s.bar}>
          <View style={[s.fill, s.fillDelivered, { width: pct(l.collectedKg) }]} />
          <View style={[s.fill, s.fillSold, { width: pct(l.reservedKg), left: pct(l.collectedKg) }]} />
        </View>
        <View style={s.legend}>
          <Stat label="Reserved" value={kgText(l.reservedKg)} s={s} />
          <Stat label="Collected" value={kgText(l.collectedKg)} s={s} />
          <Stat label="Available" value={kgText(l.remainingKg)} s={s} strong />
        </View>
      </View>
      <Text style={s.meta}>
        {sales.length === 0 ? 'No orders yet.' : `${sales.length} ${sales.length === 1 ? 'order' : 'orders'} · ${toCollect} to collect · ${sales.length - toCollect} delivered`}
      </Text>
      {l.withdrawnKg > 0 ? <Text style={s.meta}>{kgText(l.withdrawnKg)} came off this listing because it could not be supplied.</Text> : null}

      <View style={s.foot}>
        <View style={s.footText}>
          <Badge label={soldOut ? 'Sold out' : l.soldKg > 0 ? 'Part sold' : 'Waiting for a buyer'} tone={soldOut ? 'success' : l.soldKg > 0 ? 'info' : 'warning'} />
        </View>
        <View style={s.money}>
          {l.earned > 0 ? (
            <>
              <Text style={s.amount}>{ghs(l.earned)}</Text>
              <Text style={s.meta}>{l.paidOut >= l.earned ? 'Paid' : `${ghs(l.paidOut)} paid`}</Text>
            </>
          ) : l.estNet != null ? (
            <>
              <Text style={s.amount}>~{ghs(l.estNet)}</Text>
              <Text style={s.meta}>Expected</Text>
            </>
          ) : null}
        </View>
      </View>

      {history ? (
        <View style={s.history}>
          {sales.map((x) => (
            <View key={x.id} style={s.sale}>
              <View style={s.footText}>
                <Text style={s.status}>{kgText(x.kg)} · {ghs(x.amount)}</Text>
                <Text style={s.meta}>{new Date(x.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })} · {ghs(x.pricePerKg)}/{l.unit}</Text>
              </View>
              <Badge label={x.status === 'paid' ? 'Paid' : x.status === 'payable' ? 'Delivered' : 'To collect'} tone={x.status === 'paid' ? 'success' : 'warning'} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.actions}>
        {l.deliveredKg > 0 || l.collectedKg >= l.weightKg ? (
          <Text style={s.meta}>This produce has been {l.deliveredKg > 0 ? 'delivered' : 'collected'}, so the listing can no longer be changed.</Text>
        ) : (
          <Button label="Edit" variant="tonal" size="sm" icon="edit" onPress={() => setEditing(true)} />
        )}
        {onRemove && sales.length === 0 && l.soldKg + l.withdrawnKg === 0 ? (
          confirm ? (
            <>
              <Button label="Remove listing" variant="danger" size="sm" onPress={() => onRemove(l.id)} />
              <Button label="Keep" variant="ghost" size="sm" onPress={() => setConfirm(false)} />
            </>
          ) : <Button label="Remove" variant="ghost" size="sm" onPress={() => setConfirm(true)} />
        ) : null}
        {sales.length > 0 ? <Button label={history ? 'Hide sales' : `Sales history (${sales.length})`} variant="ghost" size="sm" onPress={() => setHistory(!history)} /> : null}
      </View>
    </Card>
  );
}

function Stat({ label, value, s, strong }: { label: string; value: string; s: ReturnType<typeof styles>; strong?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={s.meta}>{label}</Text>
      <Text style={[s.statVal, strong && s.statStrong]}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 16 },
  top: { flexDirection: 'row' as const, gap: 14, alignItems: 'center' as const },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  img: { width: 64, height: 64 },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  product: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  photos: { gap: 8 },
  photo: { width: 88, height: 88, borderRadius: 12, backgroundColor: c.surfaceSunken },
  track: { gap: 10 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  fill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0 },
  fillDelivered: { backgroundColor: c.brand500 },
  fillSold: { backgroundColor: c.brand500, opacity: 0.45 },
  legend: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  stat: { gap: 2 },
  statVal: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  statStrong: { fontFamily: fonts.sansBold },
  foot: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12, alignItems: 'flex-end' as const },
  footText: { flex: 1, gap: 2 },
  status: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  money: { alignItems: 'flex-end' as const, gap: 2 },
  amount: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  history: { gap: 4 },
  sale: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borderSubtle },
});
