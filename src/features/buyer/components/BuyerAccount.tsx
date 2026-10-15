import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveBuyerDetails, type BuyerDetails } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ChangeContact } from '../../auth/components/ChangeContact';
import { useAction } from '../../ops/components/useAction';

/** Organization details used on orders and deliveries. Phone and email change only through a verified code. */
export function BuyerAccount({ details, onRefresh }: { details: BuyerDetails; onRefresh: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);
  const [d, setD] = useState(details);
  const [saved, setSaved] = useState(false);
  const [changing, setChanging] = useState<'email' | 'phone' | null>(null);
  const set = (k: 'organization' | 'name' | 'location') => (v: string) => { setSaved(false); setD({ ...d, [k]: v }); };
  const valid = d.organization.trim().length >= 2 && d.name.trim().length >= 2 && d.location.trim().length >= 2;

  return (
    <Card style={s.form}>
      <Text style={s.title}>Account details</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="Organization name" value={d.organization} onChangeText={set('organization')} />
      <Input label="Your name" value={d.name} onChangeText={set('name')} />
      <Input label="Delivery location" value={d.location} onChangeText={set('location')} />
      <Button label={saved ? 'Saved' : 'Save details'} loading={busy} disabled={!valid}
        onPress={() => run(async () => { await saveBuyerDetails(d); setSaved(true); })} />

      <Text style={s.title}>Sign-in contacts</Text>
      {changing ? (
        <ChangeContact kind={changing} current={changing === 'email' ? details.email : details.phone}
          onDone={async () => { setChanging(null); await onRefresh(); }} onCancel={() => setChanging(null)} />
      ) : (
        <>
          <Text style={s.value}>Phone: {details.phone || 'not added'}</Text>
          <Button label={details.phone ? 'Change phone' : 'Add phone'} variant="ghost" onPress={() => setChanging('phone')} />
          <Text style={s.value}>Email: {details.email || 'not added'}</Text>
          <Button label={details.email ? 'Change email' : 'Add email'} variant="ghost" onPress={() => setChanging('email')} />
        </>
      )}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
});
