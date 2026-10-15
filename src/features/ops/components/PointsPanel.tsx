import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { createPoint, setPointActive, updatePoint, type PointRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { DAY_NAMES, windowLabel } from '../../../utils/format';
import { MultiChips } from './MultiChips';
import { useAction } from './useAction';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = DAY_NAMES.map((label, key) => ({ key, label }));

export function PointsPanel({ points, onChange }: { points: PointRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [name, setName] = useState('');
  const [locality, setLocality] = useState('');
  const [address, setAddress] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3]);
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('10:00');

  const [editId, setEditId] = useState<string | null>(null);

  const reset = () => { setEditId(null); setName(''); setLocality(''); setAddress(''); };
  const edit = (p: PointRow) => {
    setEditId(p.id); setName(p.name); setLocality(p.locality); setAddress(p.address);
    setDays(p.days); setStart(p.start.slice(0, 5)); setEnd(p.end.slice(0, 5));
  };

  const valid = name.trim().length >= 2 && days.length > 0 && TIME.test(start) && TIME.test(end) && end > start;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>{editId ? 'Edit collection point' : 'New collection point'}</Text>
        <Input label="Name" value={name} onChangeText={setName} placeholder="Techiman Market Hub" />
        <Input label="Locality" value={locality} onChangeText={setLocality} />
        <Input label="Address" value={address} onChangeText={setAddress} />
        <MultiChips label="Collection days" options={DAYS} value={days} onChange={setDays} />
        <Input label="Opens (24h)" value={start} onChangeText={setStart} placeholder="06:00" />
        <Input label="Closes (24h)" value={end} onChangeText={setEnd} placeholder="10:00" error={TIME.test(start) && TIME.test(end) && end <= start ? 'Must be after opening time' : undefined} />
        <Button label={editId ? 'Save changes' : 'Create collection point'} loading={busy} disabled={!valid}
          onPress={() => run(async () => {
            const p = { name, locality, address, days, start, end };
            if (editId) await updatePoint(editId, p); else await createPoint(p);
            reset();
          })} />
        {editId ? <Button variant="outline" label="Cancel" onPress={reset} /> : null}
      </Card>

      {points.map((p) => (
        <Card key={p.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{p.name}</Text>
            <Badge label={p.active ? 'Active' : 'Inactive'} tone={p.active ? 'success' : 'neutral'} />
          </View>
          <Text style={s.meta}>{[p.locality, p.address].filter(Boolean).join(' · ')}</Text>
          <Text style={s.meta}>{windowLabel(p.days, p.start, p.end)}</Text>
          <View style={s.actions}>
            <Button size="sm" variant="outline" label="Edit" onPress={() => edit(p)} />
            <Button size="sm" variant="outline" label={p.active ? 'Deactivate' : 'Activate'} onPress={() => run(() => setPointActive(p.id, !p.active))} />
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { flexDirection: 'row' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
