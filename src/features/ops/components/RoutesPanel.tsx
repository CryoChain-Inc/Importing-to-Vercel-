import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { assignRoute, fetchRoutes, type AssignedRoute, type PointRow, type Product, type SupplyRow, type TeamMember } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { MultiChips } from './MultiChips';
import { useAction } from './useAction';

export function RoutesPanel({
  team,
  points,
  products,
  supply,
  onChange,
}: {
  team: TeamMember[];
  points: PointRow[];
  products: Product[];
  supply: SupplyRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const [routes, setRoutes] = useState<AssignedRoute[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    await onChange();
    try {
      setRoutes(await fetchRoutes());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load routes.');
    }
  }, [onChange]);
  const { busy, error, run } = useAction(refresh);
  const agents = team.filter((member) => member.role === 'agent');
  const drivers = team.filter((member) => member.role === 'driver');
  const agentLabels = agents.map((agent) => agent.name || 'Unnamed agent');
  const driverLabels = drivers.map((driver) => driver.name || 'Unnamed driver');
  const [agentLabel, setAgentLabel] = useState(agentLabels[0] ?? '');
  const [driverLabel, setDriverLabel] = useState(driverLabels[0] ?? '');
  const [destination, setDestination] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const agent = agents.find((item) => (item.name || 'Unnamed agent') === agentLabel) ?? agents[0];
  const driver = drivers.find((item) => (item.name || 'Unnamed driver') === driverLabel) ?? drivers[0];
  const byProduct = new Map(products.map((product) => [product.id, product.name]));

  useEffect(() => {
    fetchRoutes().then(setRoutes, (e) => setLoadError(e instanceof Error ? e.message : 'Could not load routes.'));
  }, []);

  const options = points
    .filter((point) => point.active)
    .flatMap((point) =>
      point.productIds
        .map((id) => byProduct.get(id))
        .filter((name): name is string => Boolean(name))
        .map((product) => {
          const listed = supply.filter((row) => row.pointId === point.id && row.product === product);
          const kg = listed.reduce((sum, row) => sum + row.weightKg, 0);
          return {
            key: `${point.id}|${product}`,
            label: `${point.name} · ${product} · ${listed.length} listed${listed.length ? `, ${kg.toLocaleString('en-GH', { maximumFractionDigits: 0 })} kg` : ''}`,
          };
        }),
    );

  return (
    <View style={s.list}>
      {error || loadError ? <Banner text={error || loadError || ''} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Assign today's route</Text>
        <Text style={s.meta}>The agent captures each farmer. The driver collects the same stops and delivers them to the destination.</Text>
        {agents.length && drivers.length && options.length ? (
          <>
            <ChoiceChips label="Field agent" options={agentLabels} value={agent?.name || agentLabel} onChange={setAgentLabel} />
            <ChoiceChips label="Driver" options={driverLabels} value={driver?.name || driverLabel} onChange={setDriverLabel} />
            <Input label="Delivery destination" value={destination} onChangeText={setDestination} placeholder="Accra" />
            <MultiChips label="Stops" options={options} value={picked} onChange={setPicked} />
            <Button
              label="Assign route"
              loading={busy}
              disabled={!agent || !driver || destination.trim().length < 2 || picked.length === 0}
              onPress={() =>
                run(async () => {
                  await assignRoute(
                    agent!.id,
                    picked.map((key) => {
                      const sep = key.indexOf('|');
                      return { pointId: key.slice(0, sep), product: key.slice(sep + 1) };
                    }),
                    driver!.id,
                    destination,
                  );
                  setPicked([]);
                })
              }
            />
          </>
        ) : (
          <Text style={s.meta}>
            {!agents.length || !drivers.length
              ? 'Invite a field agent and a driver from Team before assigning a route.'
              : 'Add an active collection point with products before assigning a route.'}
          </Text>
        )}
      </Card>

      {routes.length === 0 ? (
        <Text style={s.meta}>No routes assigned for today.</Text>
      ) : (
        routes.map((route) => (
          <Card key={route.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{route.agentName}{route.driverName ? ` · ${route.driverName}` : ''}</Text>
              <Badge label={`${route.stops.length} stop${route.stops.length === 1 ? '' : 's'}`} tone="info" />
            </View>
            {route.destination ? <Text style={s.meta}>Deliver to {route.destination}</Text> : null}
            {route.stops.map((stop) => (
              <Text key={`${stop.pointName}-${stop.product}`} style={s.meta}>
                {stop.pointName}{stop.locality ? ` · ${stop.locality}` : ''} · {stop.product}
              </Text>
            ))}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
