import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveBuyerDetails, type BuyerDetails } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { isEmail, isPhone } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

/** Business details used on orders and deliveries. */
export function BuyerAccount({ details, onRefresh }: { details: BuyerDetails; onRefresh: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);
  const [d, setD] = useState(details);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof BuyerDetails) => (v: string) => { setSaved(false); setD({ ...d, [k]: v }); };

  const phoneBad = d.phone.trim() !== '' && !isPhone(d.phone);
  const emailBad = d.email.trim() !== '' && !isEmail(d.email);
  const valid = d.business.trim().length >= 2 && d.contact.trim().length >= 2 && d.location.trim().length >= 2 && !phoneBad && !emailBad;

  return (
    <Card style={s.form}>
      <Text style={s.title}>Account details</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="Business name" value={d.business} onChangeText={set('business')} />
      <Input label="Contact person" value={d.contact} onChangeText={set('contact')} />
      <Input label="Phone" value={d.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={phoneBad ? 'Enter a valid Ghana number' : undefined} />
      <Input label="Email" value={d.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={emailBad ? 'Enter a valid email' : undefined} />
      <Input label="Delivery location" value={d.location} onChangeText={set('location')} />
      <Button label={saved ? 'Saved' : 'Save details'} loading={busy} disabled={!valid}
        onPress={() => run(async () => { await saveBuyerDetails(d); setSaved(true); })} />
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
});
