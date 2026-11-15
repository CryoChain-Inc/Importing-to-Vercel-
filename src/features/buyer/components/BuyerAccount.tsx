import React, { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, Text, View } from 'react-native';
import { useScrollTo } from '../../../components/layout';
import {
  Badge,
  Button,
  Card,
  HeroCard,
  Icon,
  Input,
  ProfileChecklist,
} from '../../../components/common';
import { Banner, Dialog } from '../../../components/feedback';
import {
  saveBuyerDetails,
  saveBuyerPhoto,
  type BuyerDetails,
} from '../../../services/buyer.service';
import { produceImageUrl } from '../../../services/farmer.service';
import { imageFingerprint, type PickedImage } from '../../../services/catalogueImage';
import { CropModal } from '../../ops/components/CropModal';
import { PhotoDialog } from '../../farmer/components/PhotoDialog';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { BUYER_NAME_MAX, NAME_MAX, formatPhone } from '../../../utils/format';
import { SignInCard } from '../../auth/components/SignInCard';
import { useAction } from '../../ops/components/useAction';
import { BuyerAddresses } from './BuyerAddresses';

/** Required for the profile to count as complete; email is optional. */
export const buyerProfileComplete = (d: BuyerDetails) =>
  d.organization.trim().length >= 2 && d.name.trim().length >= 2 && d.addresses.length > 0;

const initials = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'B';

/** Account tab: profile photo, completion checklist, business details, address book and sign-in contacts. */
export function BuyerAccount({
  details,
  onRefresh,
  onSignOut,
}: {
  details: BuyerDetails;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onRefresh);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [crop, setCrop] = useState<PickedImage | null>(null);
  const scrollTo = useScrollTo();
  const addressRef = useRef<View>(null);
  const [d, setD] = useState({
    organization: details.organization.slice(0, NAME_MAX),
    name: details.name.slice(0, BUYER_NAME_MAX),
  });
  const hasBusiness = details.organization.trim().length >= 2 && details.name.trim().length >= 2;
  const complete = buyerProfileComplete(details);
  const valid =
    d.organization.trim().length >= 2 &&
    d.organization.trim().length <= NAME_MAX &&
    d.name.trim().length >= 2 &&
    d.name.trim().length <= BUYER_NAME_MAX;
  const photo = details.photoPath ? produceImageUrl(details.photoPath) : null;
  const mark = initials(details.organization || details.name);

  const openEdit = () => {
    setD({
      organization: details.organization.slice(0, NAME_MAX),
      name: details.name.slice(0, BUYER_NAME_MAX),
    });
    setEditing(true);
  };
  const addAddress = () => {
    setAdding(true);
    scrollTo(addressRef.current);
  };
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const a = r.canceled ? null : r.assets[0];
    if (a)
      setCrop({
        uri: a.uri,
        mimeType: a.mimeType,
        assetId: a.assetId,
        fingerprint: await imageFingerprint(a.uri),
      });
  };
  const setPhoto = (img: PickedImage | null) => run(() => saveBuyerPhoto(img, details.photoPath));

  return (
    <View style={s.wrap}>
      {error && !editing ? <Banner text={error} /> : null}
      <HeroCard style={s.hero}>
        <View>
          <Pressable
            onPress={() => setViewing(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Profile photo options"
            style={s.avatar}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={s.photo} />
            ) : (
              <Text style={s.initials}>{mark}</Text>
            )}
          </Pressable>
          <View style={s.cam} pointerEvents="none">
            <Icon name="edit" size={12} color="#ffffff" />
          </View>
        </View>
        <View style={s.heroText}>
          <Text style={s.heroName} numberOfLines={1} adjustsFontSizeToFit>
            {details.organization || 'Your business'}
          </Text>
          <Text style={s.heroMeta} numberOfLines={1}>
            {[details.name, details.phone ? formatPhone(details.phone) : null]
              .filter(Boolean)
              .join(' · ') || 'Add your details below'}
          </Text>
        </View>
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={8}
          style={s.out}
        >
          <Icon name="logOut" size={20} color="#ffffff" />
        </Pressable>
      </HeroCard>
      <PhotoDialog
        visible={viewing}
        uri={photo}
        initials={mark}
        busy={busy}
        onClose={() => setViewing(false)}
        onPick={pick}
        onRemove={() => setPhoto(null)}
      />
      {crop ? (
        <CropModal
          uri={crop.uri}
          onCancel={() => setCrop(null)}
          onDone={(c) => {
            setCrop(null);
            setPhoto({ ...c, assetId: crop.assetId, fingerprint: crop.fingerprint });
          }}
        />
      ) : null}

      {complete ? null : (
        <ProfileChecklist
          steps={[
            {
              key: 'business',
              label: 'Business details',
              hint: 'Your organization and your name',
              done: hasBusiness,
              onPress: openEdit,
            },
            {
              key: 'address',
              label: 'Delivery address',
              hint: 'Where we should deliver your orders',
              done: details.addresses.length > 0,
              onPress: addAddress,
            },
          ]}
        />
      )}

      <Card style={s.card}>
        <View style={s.head}>
          <View style={s.tile}>
            <Icon name="user" size={18} color={colors.brandInk} />
          </View>
          <Text style={s.title}>Business</Text>
          <Badge
            label={hasBusiness ? 'Complete' : 'Needed'}
            tone={hasBusiness ? 'success' : 'warning'}
          />
        </View>
        <View>
          <Row label="Organization" value={details.organization} />
          <Row label="Your name" value={details.name} />
        </View>
        <Button
          label={hasBusiness ? 'Edit details' : 'Add details'}
          variant={hasBusiness ? 'tonal' : 'primary'}
          icon="edit"
          onPress={openEdit}
        />
      </Card>
      {editing ? (
        <Dialog
          title="Business details"
          subtitle="Shown on your orders and deliveries."
          onClose={() => setEditing(false)}
          footer={
            <View style={s.actions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setEditing(false)}
                style={s.action}
              />
              <Button
                label="Save"
                loading={busy}
                disabled={!valid}
                style={s.action}
                onPress={() =>
                  run(async () => {
                    await saveBuyerDetails(d);
                    setEditing(false);
                  })
                }
              />
            </View>
          }
        >
          <View style={s.form}>
            <Input
              label="Organization name"
              value={d.organization}
              onChangeText={(organization) => setD({ ...d, organization })}
              autoComplete="organization"
              maxLength={NAME_MAX}
            />
            <Input
              label="Your name"
              value={d.name}
              onChangeText={(name) => setD({ ...d, name })}
              maxLength={BUYER_NAME_MAX}
              autoComplete="name"
            />
            {error ? <Banner text={error} /> : null}
          </View>
        </Dialog>
      ) : null}

      <View ref={addressRef}>
        <BuyerAddresses
          addresses={details.addresses}
          adding={adding}
          onAdding={setAdding}
          onRefresh={onRefresh}
        />
      </View>

      <SignInCard phone={details.phone} email={details.email} onRefresh={onRefresh} />
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
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  photo: { width: 72, height: 72, borderRadius: 24 },
  cam: {
    position: 'absolute' as const,
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  out: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  initials: { fontFamily: fonts.heading, fontSize: 24, color: '#ffffff' },
  heroText: { flex: 1, gap: 2 },
  heroName: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: '#ffffff',
  },
  heroMeta: { fontFamily: fonts.sansMedium, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  card: { gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 4 },
  title: { flex: 1, fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  form: { gap: 16 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: c.surfaceSunken,
  },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  value: {
    flex: 1,
    textAlign: 'right' as const,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.ink,
  },
  valueEmpty: { color: c.inkMuted },
});
