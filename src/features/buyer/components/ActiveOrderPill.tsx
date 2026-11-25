import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../../../components/common';
import { orderStage, stillCollecting, type Order } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { etaIn, time, useOrderTracking } from './OrderLiveMap';

/** Floating strip on the shop for the order that is closest to the buyer; tap to open its tracking. */
export function ActiveOrderPill({
  orders,
  onOpen,
}: {
  orders: Order[];
  onOpen: (orderId: string) => void;
}) {
  const s = useThemedStyles(styles);
  const live = orders.filter((o) => ['preparing', 'on_the_way'].includes(orderStage(o)));
  // The one furthest along is the one the buyer is waiting on.
  const lead = live.find((o) => orderStage(o) === 'on_the_way') ?? live[0];
  const t = useOrderTracking(lead?.id ?? null);
  if (!lead) return null;

  const title =
    t?.state === 'next'
      ? 'Truck is heading to you'
      : orderStage(lead) === 'preparing'
        ? 'Preparing your order'
        : stillCollecting(lead)
          ? 'Your produce is on a truck'
          : 'On the way to you';
  const eta = t?.eta ? `Arriving ${etaIn(t.eta)} · ~${time(t.eta)}` : 'Working out arrival time';
  const more = live.length - 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${eta}. Track order ${lead.code}`}
      onPress={() => onOpen(lead.id)}
      style={({ pressed }) => [s.pill, pressed && s.pressed]}
    >
      <View style={s.icon}>
        <Icon name="truck" size={20} color="#ffffff" />
        <View style={s.dot} />
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>
          {title}
          {more > 0 ? ` · +${more} more` : ''}
        </Text>
        <Text style={s.eta} numberOfLines={1}>
          {eta}
        </Text>
      </View>
      <Text style={s.cta}>Track</Text>
      <Icon name="chevronRight" size={16} color="#ffffff" />
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: c.brand900,
    shadowColor: c.brand900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand700,
  },
  dot: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.harvestFill,
    borderWidth: 2,
    borderColor: c.brand900,
  },
  body: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.sansBold, fontSize: 14, color: '#ffffff' },
  eta: { fontFamily: fonts.sansMedium, fontSize: 13, color: '#bfe9cf' },
  cta: { fontFamily: fonts.sansBold, fontSize: 13, color: '#ffffff' },
});
