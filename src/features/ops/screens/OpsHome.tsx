import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ChoiceChips, ThemeToggle } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as ops from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { ConfigPanel } from '../components/ConfigPanel';
import { FarmersPanel } from '../components/FarmersPanel';
import { PointsPanel } from '../components/PointsPanel';
import { PricesPanel } from '../components/PricesPanel';
import { SupplyPanel } from '../components/SupplyPanel';

const TABS = ['Farmers', 'Supply', 'Prices', 'Collection points', 'Settings'];

interface Data {
  farmers: ops.FarmerRow[];
  supply: ops.SupplyRow[];
  products: ops.Product[];
  prices: ops.PriceRow[];
  points: ops.PointRow[];
  config: ops.OpsConfig;
}

export function OpsHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [farmers, supply, cat, points, config] = await Promise.all([
        ops.fetchFarmers(), ops.fetchSupply(), ops.fetchCatalogue(), ops.fetchPoints(), ops.fetchConfig(),
      ]);
      setData({ farmers, supply, products: cat.products, prices: cat.prices, points, config });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content}>
        <View style={s.header}>
          <Text style={s.title}>Operations · {account.name || 'Ops'}</Text>
          <ThemeToggle />
        </View>
        <ChoiceChips label="Section" options={TABS} value={tab} onChange={setTab} />
        {error ? <Banner text={error} /> : null}
        {data ? (
          <>
            {tab === 'Farmers' ? <FarmersPanel farmers={data.farmers} /> : null}
            {tab === 'Supply' ? <SupplyPanel supply={data.supply} /> : null}
            {tab === 'Prices' ? <PricesPanel products={data.products} prices={data.prices} onChange={load} /> : null}
            {tab === 'Collection points' ? <PointsPanel points={data.points} products={data.products} onChange={load} /> : null}
            {tab === 'Settings' ? <ConfigPanel config={data.config} onChange={load} /> : null}
          </>
        ) : null}
        <Button label="Sign out" variant="ghost" size="sm" onPress={() => authService.signOut().finally(() => reset({ name: 'landing' }))} />
      </View>
    </ScrollView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { padding: 16, paddingBottom: 32 },
  content: { width: '100%' as const, maxWidth: 840, alignSelf: 'center' as const, gap: 16 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink, flexShrink: 1 },
});
