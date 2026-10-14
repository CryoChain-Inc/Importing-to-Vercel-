import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveFarmerProfile, type FarmerDetails, type FarmerProfile } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, isPhone } from '../../../utils/format';

const ACCOUNT_NUMBER = /^\d{6,20}$/;

export function FarmerProfileCard({
  profile,
  onSaved,
}: {
  profile: FarmerProfile;
  onSaved: (profile: FarmerProfile) => void;
}) {
  const s = useThemedStyles(styles);
  const [editing, setEditing] = useState(!profile.address || !profile.accountNumber);
  const [draft, setDraft] = useState<FarmerDetails>({
    name: profile.displayName,
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    bankName: profile.bankName ?? '',
    accountHolder: profile.accountHolder ?? '',
    accountNumber: profile.accountNumber ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountNumber = draft.accountNumber.replace(/\s/g, '');
  const ready =
    draft.name.trim().length > 1 &&
    isPhone(draft.phone) &&
    draft.address.trim().length > 2 &&
    draft.bankName.trim().length > 1 &&
    draft.accountHolder.trim().length > 1 &&
    ACCOUNT_NUMBER.test(accountNumber);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await saveFarmerProfile({ ...draft, accountNumber });
      onSaved(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={s.head}>
        <Text style={s.title}>Your profile</Text>
        <Button label={editing ? 'Cancel' : 'Edit'} variant="ghost" size="sm" onPress={() => setEditing((v) => !v)} />
      </View>
      {error ? <Banner text={error} /> : null}
      {editing ? (
        <View style={s.form}>
          <Input label="Full name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
          <Input label="Mobile number" prefix="+233" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} keyboardType="phone-pad" />
          <Input label="Address" value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} />
          <Input label="Bank name" value={draft.bankName} onChangeText={(bankName) => setDraft({ ...draft, bankName })} />
          <Input label="Account name" value={draft.accountHolder} onChangeText={(accountHolder) => setDraft({ ...draft, accountHolder })} />
          <Input label="Account number" value={draft.accountNumber} onChangeText={(accountNumber) => setDraft({ ...draft, accountNumber })} keyboardType="number-pad" />
          <Button label="Save profile" onPress={save} loading={busy} disabled={!ready} />
        </View>
      ) : (
        <View style={s.rows}>
          <Row label="Name" value={profile.displayName} />
          <Row label="Phone" value={formatPhone(profile.phone)} />
          <Row label="Address" value={profile.address ?? ''} />
          <Row label="Bank" value={profile.bankName ?? ''} />
          <Row label="Account name" value={profile.accountHolder ?? ''} />
          <Row label="Account number" value={profile.accountNumber ?? ''} />
        </View>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  form: { gap: 14 },
  rows: { gap: 12 },
  row: { gap: 2 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.inkMuted },
  value: { fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
});
