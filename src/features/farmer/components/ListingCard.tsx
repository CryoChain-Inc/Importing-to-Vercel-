import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { produceImageUrl, type ListingStage, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtWindow, ghs } from '../../../utils/format';
import { EditListing } from './EditListing';

const STEPS = ['Listed', 'Sold', 'Collected', 'Delivered'];
const STEP_OF: Record<ListingStage, number> = { available: 0, sold: 1, scheduled: 1, captured: 2, loaded: 2, delivered: 3 };
const STAGE_LABEL: Record<ListingStage, string> = {
  available: 'Waiting for a buyer',
  sold: 'Sold, pickup date to follow',
  scheduled: 'Pickup scheduled',
  captured: 'Weighed and graded',
  loaded: 'On the truck',
  delivered: 'Delivered to the buyer',
};
const PAYOUT_LABEL = { pending: 'Pending delivery', payable: 'Ready to pay', paid: 'Paid' } as const;
const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

export function ListingCard({ listing: l, onRemove, onSaved }: { listing: ProduceListing; onRemove?: (id: string) => void; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const step = STEP_OF[l.stage];
  const kg = l.recordedKg ?? l.weightKg;
  const photo = l.imagePaths[0];
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
            <Badge label={`Grade ${l.recordedGrade ?? l.grade}`} tone="success" />
          </View>
          <Text style={s.meta}>
            {kgText(kg)}{l.recordedKg != null ? ' recorded' : ''}{l.point ? ` · ${l.point}` : ''}
          </Text>
          {l.recordedKg != null && l.recordedKg !== l.weightKg ? <Text style={s.meta}>Listed as {kgText(l.weightKg)}</Text> : null}
        </View>
      </View>

      <View style={s.track} accessibilityLabel={`Progress: ${STEPS[step]}`}>
        {STEPS.map((name, i) => (
          <View key={name} style={s.seg}>
            <View style={[s.bar, i <= step && s.barOn]} />
            <Text style={[s.stepName, i === step && s.stepNameOn]}>{name}</Text>
          </View>
        ))}
      </View>

      <View style={s.foot}>
        <View style={s.footText}>
          <Text style={s.status}>{STAGE_LABEL[l.stage]}</Text>
          {l.stage === 'scheduled' && l.pickupStart ? <Text style={s.meta}>{fmtWindow(l.pickupStart, l.pickupEnd)}</Text> : null}
          {l.inLot && l.lotCode ? <Text style={s.meta}>Lot {l.lotCode}</Text> : null}
        </View>
        <View style={s.money}>
          {l.payoutNet != null ? (
            <>
              <Text style={s.amount}>{ghs(l.payoutNet)}</Text>
              {l.payoutStatus ? <Text style={s.meta}>{PAYOUT_LABEL[l.payoutStatus]}</Text> : null}
            </>
          ) : l.estNet != null ? (
            <>
              <Text style={s.amount}>~{ghs(l.estNet)}</Text>
              <Text style={s.meta}>Expected</Text>
            </>
          ) : null}
        </View>
      </View>

      {!l.inLot && l.stage === 'available' ? (
        <View style={s.actions}>
          <Button label="Edit" variant="tonal" size="sm" icon="edit" onPress={() => setEditing(true)} />
          {onRemove ? <Button label="Remove" variant="ghost" size="sm" onPress={() => onRemove(l.id)} /> : null}
        </View>
      ) : l.stage === 'available' ? (
        <Text style={s.meta}>In a lot, so it can no longer be edited or removed.</Text>
      ) : null}
    </Card>
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
  track: { flexDirection: 'row' as const, gap: 6 },
  seg: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.surfaceSunken },
  barOn: { backgroundColor: c.brand500 },
  stepName: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  stepNameOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  foot: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12, alignItems: 'flex-end' as const },
  footText: { flex: 1, gap: 2 },
  status: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  money: { alignItems: 'flex-end' as const, gap: 2 },
  amount: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  actions: { flexDirection: 'row' as const, gap: 8 },
});
