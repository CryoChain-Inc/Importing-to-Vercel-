import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { AddressFields } from '../../../components/location/AddressFields';
import {
  ADDRESS_MAX,
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  type BuyerAddress,
} from '../../../services/buyer.service';
import {
  addressReady,
  composeAddress,
  emptyAddress,
  type AddressValue,
} from '../../../services/maps.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { useAction } from '../../ops/components/useAction';
import { Sheet } from '../../ops/components/Sheet';

/** Delivery address book: tap a card to deliver there, add/edit in a sheet, remove. `adding` is lifted so the checklist can open the sheet. */
export function BuyerAddresses({
  addresses: fetched,
  adding,
  onAdding,
  onRefresh,
}: {
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
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  // Optimistic view: taps show instantly; the server call and refresh run behind it. A new `fetched` drops it.
  const [view, setView] = useState<{ base: BuyerAddress[]; list: BuyerAddress[] } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const addresses = view && view.base === fetched ? view.list : fetched;
  const full = addresses.length >= ADDRESS_MAX;

  const quick = (list: BuyerAddress[], call: () => Promise<void>) => {
    setQuickError(null);
    setView({ base: fetched, list });
    queue.current = queue.current
      .then(call)
      .then(onRefresh)
      .catch((e) => {
        setQuickError(e instanceof Error ? e.message : 'Something went wrong.');
        setView(null);
        return onRefresh().catch(() => undefined);
      });
  };
  const makeDefault = (id: string) =>
    quick(
      addresses
        .map((a) => ({ ...a, isDefault: a.id === id }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
      () => setDefaultAddress(id),
    );
  const remove = (a: BuyerAddress) => {
    setRemoveId(null);
    const rest = addresses.filter((x) => x.id !== a.id);
    quick(
      a.isDefault && rest.length ? rest.map((x, i) => ({ ...x, isDefault: i === 0 })) : rest,
      () => deleteAddress(a.id),
    );
  };
  const valid = label.trim().length >= 2 && addressReady(address);

  const open = (a: BuyerAddress | null) => {
    setRemoveId(null);
    setEditId(a?.id ?? null);
    setLabel(a?.label ?? '');
    setAddress(a ?? emptyAddress);
    onAdding(a === null);
  };
  const close = () => {
    setEditId(null);
    onAdding(false);
  };
  const sheet =
    adding || editId ? (
      <Sheet
        title={editId ? 'Edit address' : 'New address'}
        subtitle="Pin it on the map so we can find the nearest farms."
        onClose={close}
        footer={
          <View style={s.actions}>
            <Button label="Cancel" variant="outline" onPress={close} style={s.action} />
            <Button
              label="Save address"
              loading={busy}
              disabled={!valid}
              style={s.action}
              onPress={() =>
                run(async () => {
                  await saveAddress(editId, label, address);
                  close();
                })
              }
            />
          </View>
        }
      >
        <View style={s.form}>
          {error ? <Banner text={error} /> : null}
          <Input
            label="Name this place"
            value={label}
            onChangeText={setLabel}
            maxLength={30}
            placeholder="e.g. Kumasi warehouse"
          />
          <AddressFields value={address} onChange={(p) => setAddress({ ...address, ...p })} />
        </View>
      </Sheet>
    ) : null;

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={s.title}>Delivery addresses</Text>
          <Text style={s.sub}>
            {addresses.length
              ? `${addresses.length} of ${ADDRESS_MAX} saved`
              : 'Where we deliver your orders'}
          </Text>
        </View>
        {!adding && !editId && addresses.length > 0 && !full ? (
          <Button label="Add" icon="edit" variant="tonal" size="sm" onPress={() => open(null)} />
        ) : null}
      </View>
      {quickError ? <Banner text={quickError} /> : null}
      {error && !adding && !editId ? <Banner text={error} /> : null}

      {addresses.map((a) => (
        <View key={a.id} style={[s.tile, a.isDefault && s.tileDefault]}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: a.isDefault }}
            accessibilityLabel={`Deliver to ${a.label}`}
            disabled={a.isDefault}
            onPress={() => makeDefault(a.id)}
            style={s.tileTop}
          >
            <View style={[s.pin, a.isDefault && s.pinDefault]}>
              <Icon name="pin" size={20} color={a.isDefault ? colors.onBrand : colors.brandInk} />
            </View>
            <View style={s.tileText}>
              <Text style={s.label} numberOfLines={1}>
                {a.label}
              </Text>
              <Text style={s.address}>{composeAddress(a)}</Text>
              {a.landmark ? <Text style={s.address}>Near {a.landmark}</Text> : null}
            </View>
            <View style={[s.radio, a.isDefault && s.radioOn]}>
              {a.isDefault ? <Icon name="check" size={14} color={colors.onBrand} /> : null}
            </View>
          </Pressable>
          {removeId === a.id ? (
            <View style={s.confirm}>
              <Text style={s.confirmText}>
                {a.isDefault && addresses.length > 1
                  ? 'Remove this address? Your next one becomes the default.'
                  : 'Remove this address?'}
              </Text>
              <View style={s.actions}>
                <Button
                  label="Keep"
                  variant="outline"
                  size="sm"
                  onPress={() => setRemoveId(null)}
                  style={s.action}
                />
                <Button
                  label="Remove"
                  variant="danger"
                  size="sm"
                  style={s.action}
                  onPress={() => remove(a)}
                />
              </View>
            </View>
          ) : (
            <View style={s.foot}>
              <Text style={[s.hint, a.isDefault && s.hintOn]}>
                {a.isDefault ? 'Orders deliver here' : 'Tap to deliver here'}
              </Text>
              <Pressable
                onPress={() => open(a)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${a.label}`}
                style={s.icon}
              >
                <Icon name="edit" size={18} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setRemoveId(a.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${a.label}`}
                style={s.icon}
              >
                <Icon name="trash" size={18} color={colors.ink} />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {addresses.length === 0 && !adding ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Icon name="pin" size={28} color={colors.brandInk} />
          </View>
          <Text style={s.emptyTitle}>No delivery address yet</Text>
          <Text style={s.emptyCopy}>
            Add where you receive produce. You can keep a few, like a shop and a warehouse.
          </Text>
          <Button label="Add an address" icon="arrowRight" onPress={() => open(null)} />
        </View>
      ) : null}
      {full && !adding && !editId ? (
        <Text style={s.sub}>
          You&apos;ve reached {ADDRESS_MAX} addresses. Remove one to add another.
        </Text>
      ) : null}
      {sheet}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 12 },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  headText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  tile: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.cardEdge,
    backgroundColor: c.surfaceSunken,
  },
  tileDefault: { borderColor: c.brand600, backgroundColor: c.brandTint },
  tileTop: { flexDirection: 'row' as const, gap: 12 },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  pinDefault: { backgroundColor: c.brand600 },
  tileText: { flex: 1, gap: 2 },
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  label: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  address: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.cardEdge,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOn: { borderColor: c.brand600, backgroundColor: c.brand600 },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginLeft: 52 },
  hint: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  hintOn: { color: c.brandInk },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  confirm: { gap: 10, marginLeft: 52 },
  confirmText: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: c.ink },
  form: { gap: 16 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  empty: { alignItems: 'flex-start' as const, gap: 8, paddingVertical: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  emptyCopy: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.inkMuted,
    marginBottom: 8,
  },
});
