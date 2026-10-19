import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { createPoint, setPointActive, updatePoint, type PointRow } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty, Segmented, usePaged } from './OpsBits';
import { useAction } from './useAction';

type Filter = 'all' | 'active' | 'inactive';

/** Name, locality and address. Used for a new point and, in place of the card, for editing one. */
function PointForm({ point, onSaved, onCancel }: { point?: PointRow; onSaved: () => Promise<void>; onCancel: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(point?.name ?? '');
  const [locality, setLocality] = useState(point?.locality ?? '');
  const [address, setAddress] = useState(point?.address ?? '');
  return (
    <Card tone="tint" style={s.form}>
      <Text style={s.title}>{point ? `Edit ${point.name}` : 'New collection point'}</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="Name" value={name} onChangeText={setName} placeholder="Techiman Market Hub" />
      <Input label="Locality" value={locality} onChangeText={setLocality} placeholder="Techiman" />
      <Input label="Address" value={address} onChangeText={setAddress} placeholder="Near the main market gate" />
      <View style={s.actions}>
        <Button label={point ? 'Save changes' : 'Create point'} loading={busy} disabled={name.trim().length < 2}
          onPress={() => run(async () => {
            const p = { name, locality, address };
            if (point) await updatePoint(point.id, p); else await createPoint(p);
            onCancel();
          })} />
        <Button variant="ghost" label="Cancel" onPress={onCancel} />
      </View>
    </Card>
  );
}

/** Where agents collect produce. Search and filter, edit in place, switch a point off without deleting it. */
export function PointsPanel({ points, onChange }: { points: PointRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = points.filter((p) => (filter === 'all' || (filter === 'active') === p.active) && (!needle || `${p.name} ${p.locality} ${p.address}`.toLowerCase().includes(needle)));
  const { rows, more } = usePaged(filtered, `${filter}|${needle}`, 6);
  const n = (a: boolean) => points.filter((p) => p.active === a).length;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      {adding ? <PointForm onSaved={onChange} onCancel={() => setAdding(false)} /> : <Button label="Add collection point" icon="pin" onPress={() => { setAdding(true); setEditId(null); }} />}

      {points.length === 0 ? <Empty icon="pin" title="No collection points yet" hint="Add the places where agents pick produce up. Farmers choose from these when they list." /> : (
        <>
          <Input label="Search points" value={q} onChangeText={setQ} placeholder="Name, town or address" />
          <Segmented value={filter} onChange={setFilter} options={[
            { key: 'all', label: 'All', count: points.length },
            { key: 'active', label: 'Active', count: n(true) },
            { key: 'inactive', label: 'Inactive', count: n(false) },
          ]} />
          {filtered.length === 0 ? <Text style={s.meta}>No points match.</Text> : null}
          {rows.map((p) => editId === p.id ? (
            <PointForm key={p.id} point={p} onSaved={onChange} onCancel={() => setEditId(null)} />
          ) : (
            <Card key={p.id} style={[s.item, !p.active && s.dim]}>
              <View style={s.icon}><Icon name="pin" size={20} color={colors.brandInk} /></View>
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                <Text style={s.meta} numberOfLines={2}>{[p.locality, p.address].filter(Boolean).join(' · ') || 'No address saved'}</Text>
                <View style={s.actions}>
                  <Button size="sm" variant="outline" label="Edit" onPress={() => { setEditId(p.id); setAdding(false); }} />
                  <Button size="sm" variant="ghost" label={p.active ? 'Deactivate' : 'Activate'} disabled={busy} onPress={() => run(() => setPointActive(p.id, !p.active))} />
                </View>
              </View>
              <Badge label={p.active ? 'Active' : 'Inactive'} tone={p.active ? 'success' : 'neutral'} />
            </Card>
          ))}
          {more}
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  form: { gap: 12 },
  item: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 16 },
  dim: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  grow: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 4 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
