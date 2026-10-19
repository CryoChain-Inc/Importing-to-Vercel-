import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Icon } from '../../../components/common';
import { Skeleton } from '../../../components/feedback';
import { fetchLotTrail, type LotTrail as Trail } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { kg, Photo, when } from './OpsBits';

/** Lot stages in order; a lot's state is the furthest one it has reached. */
export const LOT_STAGES = [
  { key: 'listed', label: 'Listed' },
  { key: 'escrow_funded', label: 'Paid' },
  { key: 'collecting', label: 'Collecting' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
] as const;

export const stageIndex = (state: string) => {
  const i = LOT_STAGES.findIndex((x) => x.key === state);
  if (i >= 0) return i;
  return state === 'escrow_pending' ? 0 : state === 'accepted' ? LOT_STAGES.length - 1 : -1;
};

/** Steps with ticks: finished steps are filled, the current one is ringed, and a delivered lot is ticked all the way. */
export function StageBar({ state }: { state: string }) {
  const s = useThemedStyles(styles);
  const at = stageIndex(state);
  if (at < 0) return <Text style={s.meta}>{state.replace('_', ' ')}</Text>;
  const last = LOT_STAGES.length - 1;
  return (
    <View style={s.bar}>
      {LOT_STAGES.map((st, i) => {
        const done = i < at || at === last;
        return (
          <View key={st.key} style={s.step}>
            <View style={s.track}>
              <View style={[s.seg, i > 0 && i <= at && s.segDone, i === 0 && s.segHidden]} />
              <View style={[s.dot, (done || i === at) && s.dotDone, i === at && !done && s.dotNow]}>
                {done ? <Icon name="check" size={12} color="#ffffff" /> : null}
              </View>
              <View style={[s.seg, i < at && s.segDone, i === last && s.segHidden]} />
            </View>
            <Text style={[s.stepLabel, i <= at && s.stepOn]} numberOfLines={1}>{st.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** One titled block of the trail. */
function Block({ icon, title, children }: { icon: 'truck' | 'camera' | 'package'; title: string; children: React.ReactNode }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={s.block}>
      <View style={s.blockHead}>
        <View style={s.blockIcon}><Icon name={icon} size={16} color={colors.brandInk} /></View>
        <Text style={s.h}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Loaded on demand: what the agent captured at each farm and what the driver proved at delivery. */
export function LotTrailView({ lotId }: { lotId: string }) {
  const s = useThemedStyles(styles);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchLotTrail(lotId).then(setTrail, (e) => setErr(e instanceof Error ? e.message : 'Could not load the trail.'));
  }, [lotId]);

  if (err) return <Text style={s.bad}>{err}</Text>;
  if (!trail) return <View style={s.gap}><Skeleton height={14} width="60%" /><Skeleton height={96} /></View>;
  const { captures, route, delivery } = trail;
  return (
    <View style={s.gap}>
      {trail.buyer ? <Text style={s.meta}>Buyer <Text style={s.strong}>{trail.buyer}</Text>{trail.paidAt ? ` · paid ${when(trail.paidAt)}` : ''}</Text> : null}

      <Block icon="truck" title="Route">
        {route ? (
          <>
            <Text style={s.meta}>{route.date} · agent {route.agent}{route.driver ? ` · driver ${route.driver}` : ''}</Text>
            {route.stops.map((st, i) => (
              <Text key={i} style={s.meta}>
                {i + 1}. {st.point} · {st.departedAt ? `loaded ${when(st.departedAt)}` : st.arrivedAt ? `agent arrived ${when(st.arrivedAt)}` : 'not reached yet'}
              </Text>
            ))}
          </>
        ) : <Text style={s.meta}>Not on a route yet.</Text>}
      </Block>

      <Block icon="camera" title={`Agent captures${captures.length ? ` · ${captures.length}` : ''}`}>
        {captures.length === 0 ? <Text style={s.meta}>The agent has not captured this lot yet.</Text> : (
          <View style={s.photos}>
            {captures.map((c, i) => <Photo key={i} size={148} uri={c.photoUrl} caption={`${c.farmer}: ${kg(c.kg)}, grade ${c.grade} (listed ${kg(c.listedKg)})`} />)}
          </View>
        )}
      </Block>

      <Block icon="package" title="Driver delivery">
        {delivery ? (
          <>
            <Text style={s.meta}>Delivered {when(delivery.at)}{delivery.receivedBy ? ` · received by ${delivery.receivedBy}` : ''}</Text>
            <Photo size={148} uri={delivery.photoUrl} caption="Driver’s proof of delivery" />
          </>
        ) : <Text style={s.meta}>Not delivered yet.</Text>}
      </Block>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  gap: { gap: 8, alignSelf: 'stretch' as const },
  photos: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  block: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.surfaceSunken },
  blockHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  blockIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  bar: { flexDirection: 'row' as const, alignSelf: 'stretch' as const },
  step: { flex: 1, alignItems: 'center' as const, gap: 4 },
  track: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'stretch' as const },
  seg: { flex: 1, height: 3, backgroundColor: c.borderSubtle },
  segDone: { backgroundColor: c.brand600 },
  segHidden: { backgroundColor: 'transparent' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.borderSubtle },
  dotDone: { backgroundColor: c.brand600 },
  dotNow: { borderWidth: 4, borderColor: c.brandTint },
  stepLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  stepOn: { color: c.ink, fontFamily: fonts.sansBold },
  h: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  strong: { fontFamily: fonts.sansBold, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  bad: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.dangerInk },
});
