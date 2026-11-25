import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input, ProfileChecklist } from '../../../components/common';
import { discardQueued, retryQueued, useOutbox } from '../../../services/listingOutbox';
import {
  fetchProductCategories,
  searchListings,
  type ProduceListing,
  type Sale,
} from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ProductGroup, type Group } from './ProductGroup';
import { inStock } from './qty';
import { useDebounced } from '../../../hooks/useDebounced';
import { NewListing } from './NewListing';

const PAGE = 6;
/** Listing form is locked until the farm address and a wallet are saved (the database enforces this too). */
export function ProduceListings({
  listings,
  sales,
  pickup,
  addressReady,
  walletReady,
  onSetup,
  onChange,
  onOpen,
}: {
  listings: ProduceListing[];
  sales: Sale[];
  /** Farm address shown as the pickup location. Empty until saved. */
  pickup: string;
  addressReady: boolean;
  walletReady: boolean;
  onSetup: (section: 'details' | 'wallet') => void;
  onChange: () => Promise<void>;
  onOpen: (product: string) => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [shown, setShown] = useState(PAGE);
  const queued = useOutbox();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const dq = useDebounced(q.trim());
  // Search runs on the server; `listings` stays the full list.
  const [found, setFound] = useState<ProduceListing[] | null>(null);
  useEffect(() => {
    if (!dq) return;
    let stale = false;
    searchListings(dq)
      .then((r) => stale || setFound(r))
      .catch(() => stale || setFound(null));
    return () => {
      stale = true;
    };
  }, [dq, listings]);
  const [cats, setCats] = useState<Record<string, string>>({});
  useEffect(() => {
    fetchProductCategories()
      .then(setCats)
      .catch(() => {});
  }, []);
  // One card per crop; crops with stock come first, sold-out ones sink below.
  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, ProduceListing[]>();
    for (const l of dq && found ? found : listings)
      m.set(l.product, [...(m.get(l.product) ?? []), l]);
    const g = [...m].map(([product, ls]) => ({
      product,
      category: cats[product],
      listings: ls,
    }));
    return g.sort(
      (a, b) =>
        Number(b.listings.some(inStock)) - Number(a.listings.some(inStock)) ||
        a.product.localeCompare(b.product),
    );
  }, [listings, found, dq, cats]);
  const catNames = [
    ...new Set(groups.map((g) => g.category).filter((x): x is string => !!x)),
  ].sort();
  const rows = groups.filter((g) => !cat || g.category === cat);
  const inStockCount = groups.filter((g) => g.listings.some(inStock)).length;

  return (
    <View style={s.wrap}>
      {addressReady && walletReady ? (
        <NewListing pickup={pickup} onCreated={onChange} />
      ) : (
        <ProfileChecklist
          title="Set up your farm to start listing"
          lead="We need to know where to collect and where to send your payment. This takes about two minutes, once."
          steps={[
            {
              key: 'address',
              label: 'Farm address',
              hint: 'Pin your farm on the map so the truck can find you.',
              done: addressReady,
              onPress: () => onSetup('details'),
            },
            {
              key: 'wallet',
              label: 'MoMo wallet',
              hint: 'Where we send your payment after delivery.',
              done: walletReady,
              onPress: () => onSetup('wallet'),
            },
          ]}
        />
      )}

      {queued.map((q) => (
        <Card key={q.id} style={s.queued}>
          <View style={s.head}>
            <Text style={s.title}>{q.product}</Text>
            <Badge label={q.error ? 'Needs attention' : 'Waiting for internet'} tone="warning" />
          </View>
          <Text style={s.copy}>
            {q.weightKg.toLocaleString('en-GH')} {q.unit} · saved on this phone
          </Text>
          <Text style={s.copy}>
            {q.error ?? 'It uploads by itself as soon as you have signal. You can close the app.'}
          </Text>
          <View style={s.actions}>
            {q.error ? (
              <Button
                label="Try again"
                size="sm"
                variant="outline"
                onPress={() => retryQueued(q.id).then(onChange)}
              />
            ) : null}
            <Button label="Discard" size="sm" variant="ghost" onPress={() => discardQueued(q.id)} />
          </View>
        </Card>
      ))}

      <View style={s.head}>
        <Text style={s.title}>Your listings</Text>
        <Text style={s.copy}>
          {groups.length} {groups.length === 1 ? 'crop' : 'crops'}
          {groups.length > 0 ? ` · ${inStockCount} in stock` : ''}
        </Text>
      </View>
      {listings.length > 0 ? (
        <>
          <Input
            label="Search produce"
            value={q}
            onChangeText={(v) => {
              setQ(v);
              setShown(PAGE);
            }}
            placeholder="e.g. Tomato"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {catNames.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
              keyboardShouldPersistTaps="handled"
            >
              {[null, ...catNames].map((c) => (
                <Pressable
                  key={c ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cat === c }}
                  onPress={() => {
                    setCat(c);
                    setShown(PAGE);
                  }}
                  style={[s.chip, cat === c && s.chipOn]}
                >
                  <Text style={[s.chipText, cat === c && s.chipTextOn]}>{c ?? 'All'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      {rows.length === 0 ? (
        <Card style={s.emptyCard}>
          <Icon name="package" size={26} color={colors.inkMuted} />
          <Text style={s.copy}>
            {listings.length === 0 ? 'No produce listed yet.' : 'No produce matches your search.'}
          </Text>
        </Card>
      ) : (
        <>
          {rows.slice(0, shown).map((g) => (
            <ProductGroup key={g.product} group={g} onOpen={() => onOpen(g.product)} />
          ))}
          {rows.length > shown ? (
            <Button
              label={`Show ${Math.min(PAGE, rows.length - shown)} more of ${rows.length - shown} crops`}
              variant="outline"
              onPress={() => setShown(shown + PAGE)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    marginTop: 6,
  },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  chips: { gap: 8, paddingRight: 4 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceSunken,
  },
  chipOn: { backgroundColor: c.brandTint },
  chipText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.inkMuted },
  chipTextOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  queued: { gap: 8 },
  actions: { flexDirection: 'row' as const, gap: 8 },
  emptyCard: { alignItems: 'center' as const, gap: 8, paddingVertical: 28 },
});
