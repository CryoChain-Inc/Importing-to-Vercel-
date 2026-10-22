import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { ADDRESS_MAX, deleteAddress, saveAddress, setDefaultAddress, type BuyerAddress } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { useAction } from '../../ops/components/useAction';

/** Delivery address book: add, edit, pick the default, remove. `adding` is lifted so the checklist can open the form. */
export function BuyerAddresses({ addresses, adding, onAdding, onRefresh }: {
  addresses: BuyerAddress[];
  adding: boolean;
  onAdding: (v: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onRefresh);
  const [editId, setEditId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const full = addresses.length >= ADDRESS_MAX;
  const valid = label.trim().length >= 2 && address.trim().length >= 2;

  const open = (a: BuyerAddress | null) => {
    setRemoveId(null);
    setEditId(a?.id ?? null);
    setLabel(a?.label ?? '');
    setAddress(a?.address ?? '');
    onAdding(a === null);
  };
  const close = () => {
    setEditId(null);
    onAdding(false);
  };
  const form = (
    <View style={s.form}>
      <Input label="Name this place" value={label} onChangeText={setLabel} maxLength={30} placeholder="e.g. Kumasi warehouse" />
      <Input label="Address" value={address} onChangeText={setAddress} maxLength={80} placeholder="Street, area, town" autoComplete="street-address" hint="Where our driver should deliver." />
      <View style={s.actions}>
        <Button label="Cancel" variant="outline" onPress={close} style={s.action} />
        <Button label="Save address" loading={busy} disabled={!valid} style={s.action}
          onPress={() => run(async () => { await saveAddress(editId, label, address); close(); })} />
      </View>
    </View>
  );

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={s.title}>Delivery addresses</Text>
          <Text style={s.sub}>{addresses.length ? `${addresses.length} of ${ADDRESS_MAX} saved` : 'Where we deliver your orders'}</Text>
        </View>
        {!adding && !editId && addresses.length > 0 && !full ? <Button label="Add" icon="edit" variant="tonal" size="sm" onPress={() => open(null)} /> : null}
      </View>
      {error ? <Banner text={error} /> : null}

      {addresses.map((a) =>
        editId === a.id ? (
          <View key={a.id} style={s.tile}>{form}</View>
        ) : (
          <View key={a.id} style={[s.tile, a.isDefault && s.tileDefault]}>
            <View style={s.tileTop}>
              <View style={[s.pin, a.isDefault && s.pinDefault]}>
                <Icon name="pin" size={20} color={a.isDefault ? colors.onBrand : colors.brandInk} />
              </View>
              <View style={s.tileText}>
                <View style={s.labelRow}>
                  <Text style={s.label} numberOfLines={1}>{a.label}</Text>
                  {a.isDefault ? <Badge label="Default" tone="success" /> : null}
                </View>
                <Text style={s.address}>{a.address}</Text>
              </View>
            </View>
            {removeId === a.id ? (
              <View style={s.confirm}>
                <Text style={s.confirmText}>
                  {a.isDefault && addresses.length > 1 ? 'Remove this address? Your next one becomes the default.' : 'Remove this address?'}
                </Text>
                <View style={s.actions}>
                  <Button label="Keep" variant="outline" size="sm" onPress={() => setRemoveId(null)} style={s.action} />
                  <Button label="Remove" variant="danger" size="sm" loading={busy} style={s.action}
                    onPress={() => run(async () => { await deleteAddress(a.id); setRemoveId(null); })} />
                </View>
              </View>
            ) : (
              <View style={s.tileActions}>
                <Button label="Edit" variant="ghost" size="sm" onPress={() => open(a)} />
                {a.isDefault ? null : <Button label="Make default" variant="ghost" size="sm" onPress={() => run(() => setDefaultAddress(a.id))} />}
                <Button label="Remove" variant="ghost" size="sm" onPress={() => setRemoveId(a.id)} />
              </View>
            )}
          </View>
        ),
      )}

      {adding ? <View style={s.tile}>{form}</View> : null}

      {addresses.length === 0 && !adding ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}><Icon name="pin" size={28} color={colors.brandInk} /></View>
          <Text style={s.emptyTitle}>No delivery address yet</Text>
          <Text style={s.emptyCopy}>Add where you receive produce. You can keep a few, like a shop and a warehouse.</Text>
          <Button label="Add an address" icon="arrowRight" onPress={() => open(null)} />
        </View>
      ) : null}
      {full && !adding && !editId ? <Text style={s.sub}>You&apos;ve reached {ADDRESS_MAX} addresses. Remove one to add another.</Text> : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  tile: { gap: 8, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: c.cardEdge, backgroundColor: c.surfaceSunken },
  tileDefault: { borderColor: c.brand600, backgroundColor: c.brandTint },
  tileTop: { flexDirection: 'row' as const, gap: 12 },
  pin: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  pinDefault: { backgroundColor: c.brand600 },
  tileText: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  label: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  address: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  tileActions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginLeft: 40 },
  confirm: { gap: 10, marginLeft: 52 },
  confirmText: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: c.ink },
  form: { gap: 16 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  empty: { alignItems: 'flex-start' as const, gap: 8, paddingVertical: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint, marginBottom: 4 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  emptyCopy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, marginBottom: 8 },
});
