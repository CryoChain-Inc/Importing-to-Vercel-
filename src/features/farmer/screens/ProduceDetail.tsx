import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner, SkeletonCard } from '../../../components/feedback';
import { TabShell } from '../../../components/layout';
import { useNav } from '../../../navigation';
import {
  deleteListing,
  fetchListings,
  fetchSales,
  type ProduceListing,
  type Sale,
} from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { useLiveReload } from '../../../services/liveReload';
import type { Account } from '../../../types/auth';
import { ListingCard } from '../components/ListingCard';
import { inStock, qtyByUnit, soldShare } from '../components/qty';
import { fmtQty, ghs } from '../../../utils/format';
import { LIVE_TABLES, TABS, type Tab } from './FarmerHome';

/** One crop: its stock and sales at a glance, every batch, and the full sales history. Opened from its card on the Listings tab. */
export function ProduceDetail({ account, product }: { account: Account; product: string }) {
  const { back, reset } = useNav();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [listings, setListings] = useState<ProduceListing[] | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [salesShown, setSalesShown] = useState(8);

  const load = useCallback(async () => {
    try {
      const [l, sold] = await Promise.all([fetchListings(), fetchSales()]);
      setListings(
        l
          .filter((x) => x.product === product)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      setSales(sold);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this produce.');
    }
  }, [product]);
  useEffect(() => {
    load();
  }, [load]);
  const live = useLiveReload(load, LIVE_TABLES);

  const remove = async (id: string) => {
    try {
      await deleteListing(id);
      if (listings?.length === 1) return back();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that listing.');
    }
  };

  const stocked = useMemo(() => (listings ?? []).filter(inStock), [listings]);
  const out = useMemo(() => (listings ?? []).filter((l) => !inStock(l)), [listings]);
  const history = useMemo(() => {
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));
    return sales
      .filter((x) => byId.has(x.listingId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((x) => ({ sale: x, listing: byId.get(x.listingId)! }));
  }, [listings, sales]);
  const card = (l: ProduceListing) => (
    <ListingCard
      key={l.id}
      listing={l}
      sales={sales.filter((x) => x.listingId === l.id)}
      onRemove={remove}
      onSaved={load}
    />
  );
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });

  return (
    <TabShell
      tabs={TABS}
      tab="listings"
      refresh={live}
      onSelect={(t: Tab) =>
        t === 'listings' ? back() : reset({ name: 'home', account, role: 'farmer', tab: t })
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to listings"
        onPress={back}
        hitSlop={8}
        style={s.back}
      >
        <Icon name="arrowLeft" size={20} color={colors.ink} />
        <Text style={s.backText}>Your listings</Text>
      </Pressable>
      <Text style={s.title} accessibilityRole="header">
        {product}
      </Text>
      {error ? <Banner text={error} /> : null}
      {listings === null ? (
        error ? (
          <Button label="Try again" variant="outline" onPress={load} />
        ) : (
          <>
            <SkeletonCard lines={3} lead />
            <SkeletonCard lines={3} lead />
          </>
        )
      ) : listings.length === 0 ? (
        <Text style={s.copy}>This produce has no listings any more.</Text>
      ) : (
        <View style={s.list}>
          <Card style={s.summary}>
            <View style={s.hero}>
              <Text style={s.heroVal} numberOfLines={1}>
                {stocked.length > 0 ? qtyByUnit(stocked, (l) => l.remainingKg) : 'Sold out'}
              </Text>
              <Text style={s.meta}>
                {stocked.length > 0
                  ? `in stock · ${qtyByUnit(listings, (l) => l.weightKg)} listed in ${listings.length} ${listings.length === 1 ? 'batch' : 'batches'}`
                  : `${qtyByUnit(listings, (l) => l.weightKg)} listed in ${listings.length} ${listings.length === 1 ? 'batch' : 'batches'}`}
              </Text>
            </View>
            <View
              style={s.bar}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[s.fill, { width: `${Math.min(100, soldShare(listings) * 100)}%` }]} />
            </View>
            <View style={s.stats}>
              <View style={s.stat}>
                <Text style={s.meta}>Sold</Text>
                <Text style={s.statVal}>{qtyByUnit(listings, (l) => l.soldKg)}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.meta}>Earned</Text>
                <Text style={s.statVal}>{ghs(listings.reduce((a, l) => a + l.earned, 0))}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.meta}>Paid out</Text>
                <Text style={s.statVal}>{ghs(listings.reduce((a, l) => a + l.paidOut, 0))}</Text>
              </View>
            </View>
          </Card>

          {stocked.length > 0 ? (
            <>
              <Text style={s.section} accessibilityRole="header">
                In stock · {stocked.length}
              </Text>
              {stocked.map(card)}
            </>
          ) : null}
          {out.length > 0 ? (
            <>
              <Text style={s.section} accessibilityRole="header">
                Sold out · {out.length}
              </Text>
              {out.map(card)}
            </>
          ) : null}

          <Text style={s.section} accessibilityRole="header">
            Sales history{history.length > 0 ? ` · ${history.length}` : ''}
          </Text>
          {history.length === 0 ? (
            <Card>
              <Text style={s.copy}>No orders yet. Sales appear here as buyers pay.</Text>
            </Card>
          ) : (
            <Card style={s.sales}>
              {history.slice(0, salesShown).map(({ sale: x, listing: l }, i) => (
                <View key={x.id} style={[s.sale, i > 0 && s.saleRule]}>
                  <View style={s.saleMain}>
                    <Text style={s.saleTitle}>
                      {fmtQty(x.kg, x.unit)} · {ghs(x.amount)}
                    </Text>
                    <Text style={s.meta}>
                      {date(x.createdAt)} · {ghs(x.pricePerKg)}/{x.unit} · batch of{' '}
                      {date(l.createdAt)}
                    </Text>
                  </View>
                  <Badge
                    label={
                      x.status === 'paid'
                        ? 'Paid'
                        : x.status === 'payable'
                          ? 'Delivered'
                          : 'To collect'
                    }
                    tone={x.status === 'paid' ? 'success' : 'warning'}
                  />
                </View>
              ))}
              {history.length > salesShown ? (
                <Button
                  label={`Show ${Math.min(8, history.length - salesShown)} more`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setSalesShown(salesShown + 8)}
                />
              ) : null}
            </Card>
          )}
        </View>
      )}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  back: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start' as const,
  },
  backText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: c.ink,
  },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  list: { gap: 14 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  summary: { gap: 14 },
  hero: { gap: 2 },
  heroVal: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    backgroundColor: c.surfaceSunken,
  },
  fill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, backgroundColor: c.brand500 },
  stats: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  stat: { gap: 2, flexShrink: 1 },
  statVal: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  section: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, marginTop: 8 },
  sales: { gap: 0 },
  sale: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingVertical: 12,
  },
  saleRule: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  saleMain: { flex: 1, gap: 2 },
  saleTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
});
