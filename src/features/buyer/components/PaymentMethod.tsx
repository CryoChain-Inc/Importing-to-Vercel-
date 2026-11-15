import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Icon, Input, type IconName } from '../../../components/common';
import type { PayMethod } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';

const NETWORKS = { MTN: 'mtn', Telecel: 'vod', AirtelTigo: 'atl' } as const;
type Network = keyof typeof NETWORKS;

/** Ghana mobile number: 0XXXXXXXXX, or 233XXXXXXXXX / +233XXXXXXXXX. Mirrors the check in paystack-init. */
const validGh = (v: string) => /^(0|233)\d{9}$/.test(v.replace(/[\s+-]/g, ''));

/** Step before paying: choose Mobile Money (prompt on the phone) or Card/Bank (Paystack's secure page). */
export function PaymentMethod({
  amount,
  phone: knownPhone,
  busy,
  onPay,
}: {
  amount: number;
  /** The buyer's profile number, offered as the MoMo number. */
  phone?: string;
  busy: boolean;
  onPay: (m: PayMethod) => void;
}) {
  const s = useThemedStyles(styles);
  const [kind, setKind] = useState<'mobile_money' | 'card'>('mobile_money');
  const [network, setNetwork] = useState<Network>('MTN');
  const [typed, setTyped] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Until the buyer types, offer their profile number.
  const phone = typed ?? (knownPhone ?? '').replace(/^\+233/, '0');
  const setPhone = setTyped;

  const bad = kind === 'mobile_money' && !validGh(phone);
  const pay = () => {
    if (bad) return setTouched(true);
    onPay(
      kind === 'card'
        ? { channel: 'card' }
        : {
            channel: 'mobile_money',
            phone: phone.replace(/[\s+-]/g, ''),
            provider: NETWORKS[network],
          },
    );
  };

  return (
    <View style={s.wrap}>
      <Option
        icon="phone"
        title="Mobile Money"
        note="Approve the payment on your phone"
        on={kind === 'mobile_money'}
        onPress={() => setKind('mobile_money')}
      />
      {kind === 'mobile_money' ? (
        <Card style={s.detail}>
          <ChoiceChips
            label="Network"
            options={Object.keys(NETWORKS)}
            value={network}
            onChange={(v) => setNetwork(v as Network)}
          />
          <Input
            label="Mobile Money number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            error={touched && bad ? 'Enter a Ghana number, e.g. 024 123 4567' : undefined}
            hint="We send a payment prompt to this number."
          />
        </Card>
      ) : null}

      <Option
        icon="wallet"
        title="Card or bank"
        note="Visa, Mastercard or bank, on Paystack's secure page"
        on={kind === 'card'}
        onPress={() => setKind('card')}
      />

      <Button
        size="lg"
        icon="lock"
        label={`Pay ${ghs(amount)}`}
        loading={busy}
        disabled={busy}
        onPress={pay}
      />
    </View>
  );
}

function Option({
  icon,
  title,
  note,
  on,
  onPress,
}: {
  icon: IconName;
  title: string;
  note: string;
  on: boolean;
  onPress: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.option, on && s.optionOn]}
    >
      <View style={[s.optIcon, on && s.optIconOn]}>
        <Icon name={icon} size={22} color={on ? '#ffffff' : colors.brandInk} />
      </View>
      <View style={s.optText}>
        <Text style={s.optTitle}>{title}</Text>
        <Text style={s.optNote}>{note}</Text>
      </View>
      <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  detail: { gap: 14 },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    padding: 16,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceCard,
  },
  optionOn: { borderColor: c.brand500, backgroundColor: c.brandTint },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  optIconOn: { backgroundColor: c.brand600 },
  optText: { flex: 1, gap: 2 },
  optTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  optNote: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.borderSubtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOn: { borderColor: c.brand600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand600 },
});
