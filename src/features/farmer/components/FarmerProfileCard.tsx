import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { hasWallet, saveDetails, saveWallet, type Farmer, type FarmerDetails, type Wallet } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { detailsReady, walletReady } from '../validation';
import { DetailsForm } from './DetailsForm';
import { WalletForm } from './WalletForm';

type Section = 'details' | 'wallet';

/** Profile tab: farm details and payout wallet, each editable on its own. */
export function FarmerProfileCard({
  name,
  farmer,
  editing,
  onEdit,
  onSaved,
}: {
  name: string;
  farmer: Farmer;
  editing: Section | null;
  onEdit: (s: Section | null) => void;
  onSaved: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const [details, setDetails] = useState<FarmerDetails>({
    name,
    address: farmer.address ?? '',
    locality: farmer.locality ?? '',
    language: farmer.language ?? '',
  });
  const [wallet, setWallet] = useState<Wallet>({
    network: farmer.momoNetwork ?? '',
    number: farmer.momoNumber ?? '',
    name: farmer.momoName ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onSaved();
      onEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const saved = hasWallet(farmer);
  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      <Card>
        <View style={s.head}>
          <Text style={s.title}>Farm details</Text>
          <Button label={editing === 'details' ? 'Cancel' : 'Edit'} variant="ghost" size="sm" onPress={() => onEdit(editing === 'details' ? null : 'details')} />
        </View>
        {editing === 'details' ? (
          <View style={s.form}>
            <DetailsForm value={details} onChange={(p) => setDetails({ ...details, ...p })} />
            <Button label="Save details" onPress={() => save(() => saveDetails(details))} loading={busy} disabled={!detailsReady(details)} />
          </View>
        ) : (
          <View style={s.rows}>
            <Row label="Name" value={name} />
            <Row label="Address" value={farmer.address} />
            <Row label="Nearest town" value={farmer.locality} />
            <Row label="Language" value={farmer.language} />
          </View>
        )}
      </Card>
      <Card>
        <View style={s.head}>
          <Text style={s.title}>MoMo wallet</Text>
          <Badge label={farmer.walletVerified ? 'Verified' : saved ? 'Saved' : 'Needed'} tone={farmer.walletVerified ? 'success' : saved ? 'info' : 'warning'} />
        </View>
        {editing === 'wallet' ? (
          <View style={s.form}>
            <WalletForm value={wallet} onChange={(p) => setWallet({ ...wallet, ...p })} />
            <Button label="Save wallet" onPress={() => save(() => saveWallet(wallet))} loading={busy} disabled={!walletReady(wallet)} />
            <Button label="Cancel" variant="ghost" onPress={() => onEdit(null)} />
          </View>
        ) : (
          <View style={s.rows}>
            <Row label="Network" value={farmer.momoNetwork} />
            <Row label="Number" value={farmer.momoNumber ? formatPhone(farmer.momoNumber) : null} />
            <Row label="Name on wallet" value={farmer.momoName} />
            <Button label={saved ? 'Change wallet' : 'Add wallet'} variant={saved ? 'outline' : 'primary'} icon="wallet" onPress={() => onEdit('wallet')} />
          </View>
        )}
      </Card>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  form: { gap: 14 },
  rows: { gap: 12 },
  row: { gap: 2 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.inkMuted },
  value: { fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
});
