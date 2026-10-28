import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useScrollTo } from '../../../components/layout';
import { Badge, Button, Card, HeroCard, Icon, Input, ProfileChecklist } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveBuyerDetails, type BuyerDetails } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { BUYER_NAME_MAX, NAME_MAX, formatPhone } from '../../../utils/format';
import { ChangeContact } from '../../auth/components/ChangeContact';
import { PhoneChange } from '../../auth/components/PhoneChange';
import { useAction } from '../../ops/components/useAction';
import { BuyerAddresses } from './BuyerAddresses';

/** Required for the profile to count as complete; email is optional. */
export const buyerProfileComplete = (d: BuyerDetails) =>
  d.organization.trim().length >= 2 && d.name.trim().length >= 2 && d.addresses.length > 0;

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'B';

/** Account tab: completion checklist, business details, address book and sign-in contacts. */
export function BuyerAccount({ details, onRefresh }: { details: BuyerDetails; onRefresh: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onRefresh);
  const [editing, setEditing] = useState<'business' | 'email' | 'phone' | null>(null);
  const [adding, setAdding] = useState(false);
  const scrollTo = useScrollTo();
  const businessRef = useRef<View>(null);
  const addressRef = useRef<View>(null);
  const [d, setD] = useState({ organization: details.organization.slice(0, NAME_MAX), name: details.name.slice(0, BUYER_NAME_MAX) });
  const hasBusiness = details.organization.trim().length >= 2 && details.name.trim().length >= 2;
  const complete = buyerProfileComplete(details);
  const valid = d.organization.trim().length >= 2 && d.organization.trim().length <= NAME_MAX && d.name.trim().length >= 2 && d.name.trim().length <= BUYER_NAME_MAX;

  useEffect(() => {
    if (editing === 'business') return;
    setD({ organization: details.organization.slice(0, NAME_MAX), name: details.name.slice(0, BUYER_NAME_MAX) });
  }, [details.organization, details.name, editing]);

  const editBusiness = () => {
    setD({ organization: details.organization.slice(0, NAME_MAX), name: details.name.slice(0, BUYER_NAME_MAX) });
    setEditing('business');
    scrollTo(businessRef.current);
  };
  const addAddress = () => {
    setAdding(true);
    scrollTo(addressRef.current);
  };

  return (
    <View style={s.wrap}>
      <HeroCard style={s.hero}>
        <View style={s.avatar}><Text style={s.initials}>{initials(details.organization || details.name)}</Text></View>
        <View style={s.heroText}>
          <Text style={s.heroName} numberOfLines={1} adjustsFontSizeToFit>{details.organization || 'Your business'}</Text>
          <Text style={s.heroMeta} numberOfLines={1}>{[details.name, details.phone ? formatPhone(details.phone) : null].filter(Boolean).join(' · ') || 'Add your details below'}</Text>
        </View>
      </HeroCard>
      <Badge label={complete ? 'Profile complete' : 'Profile incomplete'} tone={complete ? 'success' : 'warning'} />

      {complete ? null : (
        <ProfileChecklist steps={[
          { key: 'business', label: 'Business details', hint: 'Your organization and your name', done: hasBusiness, onPress: editBusiness },
          { key: 'address', label: 'Delivery address', hint: 'Where we should deliver your orders', done: details.addresses.length > 0, onPress: addAddress },
        ]} />
      )}

      <View ref={businessRef}>
      <Card style={s.card}>
        <View style={s.head}>
          <Text style={s.title}>Business</Text>
          {editing === 'business' ? null : <Button label={hasBusiness ? 'Edit' : 'Add'} variant="ghost" size="sm" onPress={editBusiness} />}
        </View>
        {editing === 'business' ? (
          <View style={s.form}>
            <Input label="Organization name" value={d.organization} onChangeText={(organization) => setD({ ...d, organization })} autoComplete="organization" maxLength={NAME_MAX} />
            <Input label="Your name" value={d.name} onChangeText={(name) => setD({ ...d, name })} maxLength={BUYER_NAME_MAX} autoComplete="name" />
            {error ? <Banner text={error} /> : null}
            <View style={s.actions}>
              <Button label="Cancel" variant="outline" onPress={() => setEditing(null)} style={s.action} />
              <Button label="Save" loading={busy} disabled={!valid} style={s.action}
                onPress={() => run(async () => { await saveBuyerDetails(d); setEditing(null); })} />
            </View>
          </View>
        ) : (
          <View>
            <Row label="Organization" value={details.organization} />
            <Row label="Your name" value={details.name} />
          </View>
        )}
      </Card>
      </View>

      <View ref={addressRef}>
        <BuyerAddresses addresses={details.addresses} adding={adding} onAdding={setAdding} onRefresh={onRefresh} />
      </View>

      <Card style={s.card}>
        <Text style={s.title}>Sign-in</Text>
        <Text style={s.contactHint}>Your phone number is what you sign in with.</Text>
        <View style={s.contact}>
          <View style={s.contactIcon}><Icon name="phone" size={18} color={colors.brandInk} /></View>
          <View style={s.contactText}>
            <Text style={s.contactValue} numberOfLines={1}>{details.phone ? formatPhone(details.phone) : 'No phone number'}</Text>
            {details.phone ? <View style={s.badge}><Badge label="Verified" tone="success" /></View> : null}
          </View>
          {editing === 'phone' ? null : <Button label={details.phone ? 'Change' : 'Add'} variant="ghost" size="sm" onPress={() => setEditing('phone')} />}
        </View>
        {editing === 'phone' ? (
          <PhoneChange current={details.phone} onDone={async () => { setEditing(null); await onRefresh(); }} onCancel={() => setEditing(null)} />
        ) : null}
        <View style={s.contact}>
          <View style={s.contactIcon}><Icon name="mail" size={18} color={colors.brandInk} /></View>
          <View style={s.contactText}>
            <Text style={s.contactValue} numberOfLines={1} ellipsizeMode="middle">{details.email || 'No email yet'}</Text>
            {details.email ? <View style={s.badge}><Badge label="Verified" tone="success" /></View> : null}
          </View>
          {editing === 'email' ? null : <Button label={details.email ? 'Change' : 'Add'} variant="ghost" size="sm" onPress={() => setEditing('email')} />}
        </View>
        {editing === 'email' ? (
          <ChangeContact current={details.email}
            onDone={async () => { setEditing(null); await onRefresh(); }} onCancel={() => setEditing(null)} />
        ) : null}
      </Card>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, !value && s.valueEmpty]}>{value || 'Not added'}</Text>
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
  card: { gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  form: { gap: 16 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.surfaceSunken },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  value: { flex: 1, textAlign: 'right' as const, fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  valueEmpty: { color: c.inkMuted },
  contact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  contactIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  contactText: { flex: 1, minWidth: 0, gap: 4 },
  badge: { alignSelf: 'flex-start' as const },
  contactValue: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  contactHint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
