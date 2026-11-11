import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, HeroCard, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { detailsDone, hasWallet, saveDetails, saveWallet, type Farmer, type FarmerDetails, type Wallet } from '../../../services/farmer.service';
import { composeAddress } from '../../../services/maps.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { SignInCard } from '../../auth/components/SignInCard';
import { detailsReady, walletReady } from '../validation';
import { EditSheet } from './EditSheet';
import { DetailsForm } from './DetailsForm';
import { WalletForm } from './WalletForm';

type Section = 'details' | 'wallet';

/** Profile tab: farm details and payout wallet, each editable on its own. */
export function FarmerProfileCard({
  name,
  phone,
  email,
  farmer,
  editing,
  onEdit,
  onSaved,
  onSignOut,
}: {
  name: string;
  phone?: string;
  email?: string;
  farmer: Farmer;
  editing: Section | null;
  onEdit: (s: Section | null) => void;
  onSaved: () => Promise<void>;
  onSignOut: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
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
  const left = (hasDetails ? 0 : 1) + (saved ? 0 : 1);
  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      <HeroCard style={s.hero}>
        <View style={s.avatar}><Text style={s.initials}>{initials(name)}</Text></View>
        <View style={s.heroText}>
          <Text style={s.heroName} numberOfLines={1} adjustsFontSizeToFit>{name || 'Farmer'}</Text>
          <Text style={s.heroMeta} numberOfLines={1}>{phone ? formatPhone(phone) : 'Add your farm details'}</Text>
        </View>
        <Pressable onPress={onSignOut} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={8} style={s.out}>
          <Icon name="logOut" size={20} color="#ffffff" />
        </Pressable>
      </HeroCard>
      {left > 0 ? (
        <Banner tone="info" text={`${left} step${left > 1 ? 's' : ''} left before you can list produce and get paid.`} />
      ) : null}
      <Card>
        <View style={s.head}>
          <View style={s.tile}><Icon name="pin" size={18} color={colors.brandInk} /></View>
          <Text style={s.title}>Farm details</Text>
          <Badge label={hasDetails ? 'Complete' : 'Needed'} tone={hasDetails ? 'success' : 'warning'} />
        </View>
        {farmer.address ? null : <Text style={s.empty}>Add your farm address so our truck knows where to collect.</Text>}
        <View style={s.rows}>
          <Row label="Name" value={name} />
          <Row label="Address" value={farmer.address ? composeAddress({ line1: farmer.line1 ?? '', address: farmer.address }) : null} />
          <Row label="Landmark" value={farmer.landmark} />
        </View>
        <Button label={hasDetails ? 'Edit details' : 'Add details'} variant={hasDetails ? 'outline' : 'primary'} icon="edit" onPress={() => onEdit('details')} />
      </Card>
      <Card>
        <View style={s.head}>
          <View style={s.tile}><Icon name="wallet" size={18} color={colors.brandInk} /></View>
          <Text style={s.title}>MoMo wallet</Text>
          <Badge label={farmer.walletVerified ? 'Verified' : saved ? 'Saved' : 'Needed'} tone={farmer.walletVerified ? 'success' : saved ? 'info' : 'warning'} />
        </View>
        {saved ? (
          <HeroCard style={s.momo}>
            <Text style={s.momoNet}>{farmer.momoNetwork}</Text>
            <Text style={s.momoNum} numberOfLines={1} adjustsFontSizeToFit>{formatPhone(farmer.momoNumber)}</Text>
            <Text style={s.momoName}>{farmer.momoName}</Text>
          </HeroCard>
        ) : (
          <Text style={s.empty}>Add the mobile money wallet we pay you into.</Text>
        )}
        <Button label={saved ? 'Change wallet' : 'Add wallet'} variant={saved ? 'outline' : 'primary'} icon="wallet" onPress={() => onEdit('wallet')} />
      </Card>
      <SignInCard phone={phone ?? ''} email={email ?? ''} onRefresh={onSaved} />

      <EditSheet visible={editing === 'details'} title="Farm details" saveLabel="Save details" busy={busy} canSave={detailsReady(details)} onClose={() => onEdit(null)} onSave={() => save(() => saveDetails(details))}>
        <DetailsForm value={details} onChange={(p) => setDetails({ ...details, ...p })} />
      </EditSheet>
      <EditSheet visible={editing === 'wallet'} title="MoMo wallet" saveLabel="Save wallet" busy={busy} canSave={walletReady(wallet)} onClose={() => onEdit(null)} onSave={() => save(() => saveWallet(wallet))}>
        <WalletForm value={wallet} onChange={(p) => setWallet({ ...wallet, ...p })} />
      </EditSheet>
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
  out: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.18)' },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 4 },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  title: { flex: 1, fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  momo: { gap: 4, borderRadius: 20, marginBottom: 12 },
  momoNet: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  momoNum: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, letterSpacing: 0.5, color: '#ffffff', fontVariant: ['tabular-nums' as const], marginTop: 12 },
  momoName: { fontFamily: fonts.sansMedium, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, marginBottom: 12 },
  rows: { gap: 0, marginBottom: 12 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.surfaceSunken },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  value: { flex: 1, textAlign: 'right' as const, fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
});
