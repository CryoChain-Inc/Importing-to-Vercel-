import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { AddressFields } from '../../../components/location/AddressFields';
import {
  ADDRESS_MAX,
  fetchBuyerDetails,
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

/** Pick where this order goes, or add a new place, without leaving the shop. The pick becomes the default. */
export function AddressSheet({
  addresses,
  onRefresh,
  onPick,
  onClose,
}: {
  addresses: BuyerAddress[];
  onRefresh: () => Promise<void>;
  /** Fires on tap; the parent closes the sheet and saves in the background so the pick feels instant. */
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(async () => {});
  const [adding, setAdding] = useState(addresses.length === 0);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const valid = label.trim().length >= 2 && addressReady(address);

  const add = () =>
    run(async () => {
      const known = new Set(addresses.map((a) => a.id));
      await saveAddress(null, label, address);
      const created = (await fetchBuyerDetails()).addresses.find((a) => !known.has(a.id));
      if (created && !created.isDefault) await setDefaultAddress(created.id);
      await onRefresh();
      onClose();
    });

  return (
    <Sheet
      title={adding ? 'New address' : 'Deliver to'}
      subtitle={adding ? 'Pin it on the map so we can find the nearest farms.' : undefined}
      onClose={onClose}
      footer={
        adding ? (
          <View style={s.actions}>
            {addresses.length > 0 ? (
              <Button
                label="Back"
                variant="outline"
                onPress={() => setAdding(false)}
                style={s.action}
              />
            ) : null}
            <Button
              label="Save and deliver here"
              loading={busy}
              disabled={!valid}
              onPress={add}
              style={s.action}
            />
          </View>
        ) : addresses.length < ADDRESS_MAX ? (
          <Button
            label="Add new address"
            icon="edit"
            variant="tonal"
            onPress={() => setAdding(true)}
          />
        ) : undefined
      }
    >
      {error ? <Banner text={error} /> : null}
      {adding ? (
        <View style={s.form}>
          <Input
            label="Name this place"
            value={label}
            onChangeText={setLabel}
            maxLength={30}
            placeholder="e.g. Kumasi warehouse"
          />
          <AddressFields value={address} onChange={(p) => setAddress({ ...address, ...p })} />
        </View>
      ) : (
        <View style={s.list}>
          {addresses.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: a.isDefault }}
              disabled={busy}
              onPress={() => (a.isDefault ? onClose() : onPick(a.id))}
              style={[s.row, a.isDefault && s.rowOn]}
            >
              <Icon name="pin" size={20} color={a.isDefault ? colors.brandInk : colors.inkMuted} />
              <View style={s.text}>
                <Text style={s.label} numberOfLines={1}>
                  {a.label}
                </Text>
                <Text style={s.line}>{composeAddress(a)}</Text>
              </View>
              {a.isDefault ? <Icon name="check" size={18} color={colors.brandInk} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 56,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.cardEdge,
    backgroundColor: c.surfaceSunken,
  },
  rowOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  line: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  form: { gap: 16 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
});
