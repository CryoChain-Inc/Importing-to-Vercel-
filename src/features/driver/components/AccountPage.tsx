import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveDriverPhoto, type DriverProfile } from '../../../services/driver.profile.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { formatPhone } from '../../../utils/format';
import { SignOutDialog } from '../../auth/components/SignOutDialog';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'D';

/** The driver's details. Only the photo can be changed here; everything else is set by operations. */
export function AccountPage({
  account,
  profile,
  stats,
  onChanged,
  onSignOut,
}: {
  account: Account;
  profile: DriverProfile | null;
  stats: { stopsLeft: number; completed: number };
  onChanged: () => Promise<void>;
  onSignOut: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  const change = async (from: 'camera' | 'library' | 'remove') => {
    setError(null);
    try {
      let img = null;
      if (from !== 'remove') {
        if (from === 'camera') {
          const { granted } = await ImagePicker.requestCameraPermissionsAsync();
          if (!granted) return setError('Allow camera access to take a photo.');
        }
        const opts = {
          mediaTypes: ['images'] as ImagePicker.MediaType[],
          allowsEditing: true,
          aspect: [1, 1] as [number, number],
          quality: 0.7,
        };
        const r =
          from === 'camera'
            ? await ImagePicker.launchCameraAsync(opts)
            : await ImagePicker.launchImageLibraryAsync(opts);
        if (r.canceled || !r.assets[0]) return;
        img = {
          uri: r.assets[0].uri,
          mimeType: r.assets[0].mimeType,
          assetId: r.assets[0].assetId,
        };
      }
      setBusy(true);
      await saveDriverPhoto(img, profile?.photoPath ?? null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your photo.');
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    ['Phone', account.phone ? formatPhone(account.phone) : ''],
    ['Email', account.email ?? ''],
    ['Vehicle', profile?.vehicleType ?? ''],
    ['Plate number', profile?.plate || profile?.truckPlate || ''],
    ['Licence number', profile?.licence ?? ''],
    ['Assigned truck', profile?.truckName ?? ''],
    ['Truck capacity', profile?.capacityKg ? `${profile.capacityKg} kg` : ''],
  ];

  return (
    <View style={s.list}>
      <Card style={s.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => change('library')}
          style={({ pressed }) => [s.avatarWrap, pressed ? s.pressed : null]}
        >
          {profile?.photoUrl ? (
            <Image
              source={{ uri: profile.photoUrl }}
              style={s.avatar}
              accessibilityLabel="Your profile photo"
            />
          ) : (
            <View style={[s.avatar, s.avatarEmpty]}>
              <Text style={s.initials}>{initials(account.name)}</Text>
            </View>
          )}
          <View style={s.cam}>
            <Icon name="camera" size={16} color={colors.onBrand} />
          </View>
        </Pressable>
        <Text style={s.name}>{account.name || 'Driver'}</Text>
        <Text style={s.meta}>CryoChain driver</Text>
        <View style={s.photoActions}>
          <Button
            size="sm"
            variant="outline"
            icon="camera"
            label="Take photo"
            loading={busy}
            onPress={() => change('camera')}
          />
          <Button
            size="sm"
            variant="outline"
            label="Choose photo"
            disabled={busy}
            onPress={() => change('library')}
          />
          {profile?.photoPath ? (
            <Button
              size="sm"
              variant="ghost"
              label="Remove"
              disabled={busy}
              onPress={() => change('remove')}
            />
          ) : null}
        </View>
        {error ? <Banner text={error} /> : null}
      </Card>

      <View style={s.stats}>
        <Card tone="tint" style={s.stat}>
          <Text style={s.statN}>{stats.stopsLeft}</Text>
          <Text style={s.meta}>Stops left</Text>
        </Card>
        <Card tone="tint" style={s.stat}>
          <Text style={s.statN}>{stats.completed}</Text>
          <Text style={s.meta}>Stops completed</Text>
        </Card>
      </View>

      <Card style={s.details}>
        <Text style={s.section}>Your details</Text>
        {rows.map(([label, value]) => (
          <View key={label} style={s.detail}>
            <Text style={s.meta}>{label}</Text>
            <Text style={[s.value, value ? null : s.muted]}>{value || 'Not set'}</Text>
          </View>
        ))}
        <Text style={s.meta}>To change these details, contact CryoChain operations.</Text>
      </Card>

      <Button
        label="Sign out"
        icon="logOut"
        variant="outline"
        onPress={() => setConfirmOut(true)}
      />
      {confirmOut ? (
        <SignOutDialog onClose={() => setConfirmOut(false)} onConfirm={onSignOut} />
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 14 },
  pressed: { opacity: 0.85 },
  hero: { alignItems: 'center' as const, gap: 8, padding: 24 },
  avatarWrap: { width: 112, height: 112 },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: c.surfaceSunken },
  avatarEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  initials: { fontFamily: fonts.heading, fontSize: 40, color: c.brandInk },
  cam: {
    position: 'absolute' as const,
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
    borderWidth: 3,
    borderColor: c.surfaceCard,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: c.ink,
    marginTop: 6,
  },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  photoActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 6,
  },
  stats: { flexDirection: 'row' as const, gap: 12 },
  stat: { flex: 1, gap: 2, padding: 16 },
  statN: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: c.brandInk },
  details: { gap: 12, padding: 20 },
  section: { fontFamily: fonts.heading, fontSize: 20, color: c.ink },
  detail: { gap: 2, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  value: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  muted: { color: c.inkMuted, fontFamily: fonts.sansRegular },
});
