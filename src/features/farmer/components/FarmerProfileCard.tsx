import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, HeroCard } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { detailsDone, hasWallet, saveDetails, saveWallet, type Farmer, type FarmerDetails, type Wallet } from '../../../services/farmer.service';
import { composeAddress } from '../../../services/maps.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { detailsReady, walletReady } from '../validation';
import { DetailsForm } from './DetailsForm';
import { WalletForm } from './WalletForm';

type Section = 'details' | 'wallet';

/** Profile tab: farm details and payout wallet, each editable on its own. */
export function FarmerProfileCard({
  name,
  phone,
  farmer,
  editing,
  onEdit,
  onSaved,
  onSignOut,
}: {
  name: string;
  phone?: string;
  farmer: Farmer;
  editing: Section | null;
  onEdit: (s: Section | null) => void;
  onSaved: () => Promise<void>;
  onSignOut: () => void;
}) {
  const s = useThemedStyles(styles);
  const [details, setDetails] = useState<FarmerDetails>({
    name,
    address: farmer.address ?? '',
    line1: farmer.line1 ?? '',
    landmark: farmer.landmark ?? '',
    city: farmer.city ?? '',
    postcode: farmer.postcode ?? '',
    locality: farmer.locality ?? '',
    latitude: farmer.latitude,
    longitude: farmer.longitude,
  });
  const [wallet, setWallet] = useState<Wallet>({
    network: farmer.momoNetwork ?? '',
    number: farmer.momoNumber ?? '',
    name: farmer.momoName ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    setDetails({
      name,
      address: farmer.address ?? '',
      line1: farmer.line1 ?? '',
      landmark: farmer.landmark ?? '',
      city: farmer.city ?? '',
      postcode: farmer.postcode ?? '',
      locality: farmer.locality ?? '',
      latitude: farmer.latitude,
      longitude: farmer.longitude,
    });
    setWallet({
      network: farmer.momoNetwork ?? '',
      number: farmer.momoNumber ?? '',
      name: farmer.momoName ?? '',
    });
  }, [editing, name, farmer]);

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
  const hasDetails = name.trim().length > 1 && detailsDone(farmer);
  const complete = hasDetails && saved;
  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      <HeroCard style={s.hero}>
        <View style={s.avatar}><Text style={s.initials}>{initials(name)}</Text></View>
        <View style={s.heroText}>
          <Text style={s.heroName} numberOfLines={1} adjustsFontSizeToFit>{name || 'Farmer'}</Text>
          <Text style={s.heroMeta} numberOfLines={1}>{[phone ? formatPhone(phone) : null].filter(Boolean).join(' · ') || 'Add your farm details'}</Text>
        </View>
      </HeroCard>
      <Badge label={complete ? 'Profile complete' : 'Profile incomplete'} tone={complete ? 'success' : 'warning'} />
      <Card>
        <View style={s.head}>
          <Text style={s.title}>Farm details</Text>
          {editing === 'details' ? null : <Button label={hasDetails ? 'Edit' : 'Add'} variant="ghost" size="sm" onPress={() => onEdit('details')} />}
        </View>
        {editing === 'details' ? (
          <View style={s.form}>
            <DetailsForm value={details} onChange={(p) => setDetails({ ...details, ...p })} />
            <View style={s.actions}>
              <Button label="Cancel" variant="outline" onPress={() => onEdit(null)} style={s.action} />
              <Button label="Save details" onPress={() => save(() => saveDetails(details))} loading={busy} disabled={!detailsReady(details)} style={s.action} />
            </View>
          </View>
        ) : (
          <View style={s.rows}>
            <Row label="Name" value={name} />
            <Row label="Address" value={farmer.address ? composeAddress({ line1: farmer.line1 ?? '', address: farmer.address }) : null} />
            <Row label="Landmark" value={farmer.landmark} />
            <Row label="Location" value={farmer.latitude != null ? `${farmer.latitude.toFixed(5)}, ${farmer.longitude?.toFixed(5)}` : null} />
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
            <View style={s.actions}>
              <Button label="Cancel" variant="outline" onPress={() => onEdit(null)} style={s.action} />
              <Button label="Save wallet" onPress={() => save(() => saveWallet(wallet))} loading={busy} disabled={!walletReady(wallet)} style={s.action} />
            </View>
          </View>
        ) : (
          <View style={s.rows}>
            {saved ? (
              <HeroCard style={s.momo}>
                <Text style={s.momoNet}>{farmer.momoNetwork}</Text>
                <Text style={s.momoNum} numberOfLines={1} adjustsFontSizeToFit>{formatPhone(farmer.momoNumber)}</Text>
                <Text style={s.momoName}>{farmer.momoName}</Text>
              </HeroCard>
            ) : (
              <Text style={s.empty}>No wallet saved. Add one to list produce and get paid.</Text>
            )}
            <Button style={{ marginTop: 8 }} label={saved ? 'Change wallet' : 'Add wallet'} variant={saved ? 'outline' : 'primary'} icon="wallet" onPress={() => onEdit('wallet')} />
          </View>
        )}
      </Card>
      <Button label="Sign out" variant="ghost" icon="logOut" onPress={onSignOut} style={s.signOut} />
    </View>
  );
}

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'F';

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
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.18)' },
  initials: { fontFamily: fonts.heading, fontSize: 24, color: '#ffffff' },
  heroText: { flex: 1, gap: 2 },
  heroName: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, letterSpacing: -0.3, color: '#ffffff' },
  heroMeta: { fontFamily: fonts.sansMedium, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  form: { gap: 20 },
  signOut: { alignSelf: 'center' as const, marginTop: 8 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  momo: { gap: 4, borderRadius: 20 },
  momoNet: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  momoNum: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, letterSpacing: 0.5, color: '#ffffff', fontVariant: ['tabular-nums' as const], marginTop: 12 },
  momoName: { fontFamily: fonts.sansMedium, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  rows: { gap: 0 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.surfaceSunken },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  value: { flex: 1, textAlign: 'right' as const, fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
});
