import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { produceImageUrl, type ProduceListing, type Sale } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { EditListing } from './EditListing';

export function ListingCard({
  listing: l,
  sales = [],
  onRemove,
  onSaved,
}: {
  listing: ProduceListing;
  /** This listing's orders. */ sales?: Sale[];
  onRemove?: (id: string) => void;
  onSaved: () => Promise<void>;
}) {
  const kgText = (n: number) => fmtQty(n, l.unit);
  const soldOut = l.remainingKg <= 0;
  const [editing, setEditing] = useState(false);
  // A sold-out batch is history, so it starts folded to one line.
  const [open, setOpen] = useState(!soldOut);
  const [confirm, setConfirm] = useState(false);
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const photo = l.imagePaths[0];
  const pct = (kg: number) => `${Math.min(100, (kg / l.weightKg) * 100)}%` as const;
  const toCollect = sales.filter((x) => x.status === 'awaiting_delivery').length;
  const listed = new Date(l.createdAt).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
  });
  const status = soldOut ? 'Sold out' : l.soldKg > 0 ? 'Part sold' : 'Waiting for a buyer';
  const tone = soldOut ? 'neutral' : l.soldKg > 0 ? 'info' : 'warning';
  const money =
    l.earned > 0
      ? { value: ghs(l.earned), note: l.paidOut >= l.earned ? 'Paid' : `${ghs(l.paidOut)} paid` }
      : l.estNet != null
        ? { value: `~${ghs(l.estNet)}`, note: 'Expected' }
        : null;
  return (
    <Card style={s.card}>
      {editing ? (
        <EditListing listing={l} onDone={() => setEditing(false)} onSaved={onSaved} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Batch listed ${listed}, ${kgText(l.weightKg)}, ${status}`}
        onPress={() => setOpen(!open)}
        style={s.top}
      >
        <View style={s.thumb}>
          {photo ? (
            <Image
              source={{ uri: produceImageUrl(photo) }}
              style={s.img}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Icon name="leaf" size={22} color={colors.brandInk} />
          )}
        </View>
        <View style={s.main}>
          <Text style={s.product} numberOfLines={1}>
            Listed {listed}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {kgText(l.weightKg)} listed
            {!open && money ? ` · ${money.value}` : ''}
          </Text>
        </View>
        <Badge label={status} tone={tone} />
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={colors.inkMuted} />
      </Pressable>

      {open ? (
        <>
          {l.imagePaths.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.photos}
            >
              {l.imagePaths.map((p, i) => (
                <Image
                  key={p}
                  source={{ uri: produceImageUrl(p) }}
                  style={s.photo}
                  accessibilityLabel={`${l.product} photo ${i + 1} of ${l.imagePaths.length}`}
                />
              ))}
            </ScrollView>
          ) : null}

          <View
            style={s.track}
            accessibilityLabel={`${kgText(l.reservedKg)} reserved, ${kgText(l.collectedKg)} collected, ${kgText(l.remainingKg)} available of ${kgText(l.weightKg)}`}
          >
            <View style={s.bar}>
              <View style={[s.fill, s.fillDelivered, { width: pct(l.collectedKg) }]} />
              <View
                style={[s.fill, s.fillSold, { width: pct(l.reservedKg), left: pct(l.collectedKg) }]}
              />
            </View>
            <View style={s.legend}>
              <Stat label="Reserved" value={kgText(l.reservedKg)} s={s} />
              <Stat label="Collected" value={kgText(l.collectedKg)} s={s} />
              <Stat label="Available" value={kgText(l.remainingKg)} s={s} strong />
            </View>
          </View>
          <Text style={s.meta}>
            {sales.length === 0
              ? 'No orders yet.'
              : `${sales.length} ${sales.length === 1 ? 'order' : 'orders'} · ${toCollect} to collect · ${sales.length - toCollect} delivered`}
          </Text>
          {l.withdrawnKg > 0 ? (
            <Text style={s.meta}>
              {kgText(l.withdrawnKg)} came off this listing because it could not be supplied.
            </Text>
          ) : null}
          {money ? (
            <View style={s.money}>
              <Text style={s.meta}>{money.note}</Text>
              <Text style={s.amount}>{money.value}</Text>
            </View>
          ) : null}

          <View style={s.actions}>
            {l.deliveredKg > 0 || l.collectedKg >= l.weightKg ? (
              <Text style={s.meta}>
                This produce has been {l.deliveredKg > 0 ? 'delivered' : 'collected'}, so the
                listing can no longer be changed.
              </Text>
            ) : (
              <Button
                label="Edit"
                variant="tonal"
                size="sm"
                icon="edit"
                onPress={() => setEditing(true)}
              />
            )}
            {onRemove && sales.length === 0 && l.soldKg + l.withdrawnKg === 0 ? (
              confirm ? (
                <>
                  <Button
                    label="Remove listing"
                    variant="danger"
                    size="sm"
                    onPress={() => onRemove(l.id)}
                  />
                  <Button
                    label="Keep"
                    variant="ghost"
                    size="sm"
                    onPress={() => setConfirm(false)}
                  />
                </>
              ) : (
                <Button label="Remove" variant="ghost" size="sm" onPress={() => setConfirm(true)} />
              )
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  s,
  strong,
}: {
  label: string;
  value: string;
  s: ReturnType<typeof styles>;
  strong?: boolean;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.meta}>{label}</Text>
      <Text style={[s.statVal, strong && s.statStrong]}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14 },
  top: { flexDirection: 'row' as const, gap: 12, alignItems: 'center' as const, minHeight: 44 },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  img: { width: 48, height: 48 },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  product: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  photos: { gap: 8 },
  photo: { width: 88, height: 88, borderRadius: 12, backgroundColor: c.surfaceSunken },
  track: { gap: 10 },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    backgroundColor: c.surfaceSunken,
  },
  fill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0 },
  fillDelivered: { backgroundColor: c.brand500 },
  fillSold: { backgroundColor: c.brand500, opacity: 0.45 },
  legend: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  stat: { gap: 2 },
  statVal: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  statStrong: { fontFamily: fonts.sansBold },
  money: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
  },
  amount: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
});
