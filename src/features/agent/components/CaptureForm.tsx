import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import type { AgentFarmer, CaptureGrade } from '../../../services/agent.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { localPhone } from '../../../utils/format';

const GRADES = ['A', 'B', 'Reject'];

const kgText = (n: number) => n.toLocaleString('en-GH', { maximumFractionDigits: 2 });

async function takePhoto(): Promise<{ uri: string; mime: string } | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 });
      if (shot.canceled || !shot.assets[0]) return null;
      return { uri: shot.assets[0].uri, mime: shot.assets[0].mimeType ?? 'image/jpeg' };
    }
  } catch {
    // A desktop browser has no camera. The photo library covers that case.
  }
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
  if (picked.canceled || !picked.assets[0]) return null;
  return { uri: picked.assets[0].uri, mime: picked.assets[0].mimeType ?? 'image/jpeg' };
}

export function CaptureForm({
  farmer,
  onSave,
  onCancel,
}: {
  farmer: AgentFarmer;
  onSave: (input: { kg: number; grade: CaptureGrade; photo: { uri: string; mime: string } | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const s = useThemedStyles(styles);
  const [weight, setWeight] = useState(farmer.capture ? String(farmer.capture.recordedKg) : '');
  const [grade, setGrade] = useState<CaptureGrade | ''>(farmer.capture?.grade ?? '');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = Number(weight);
  const hasPhoto = Boolean(photo || farmer.capture?.photoPath);
  const ready = Number.isFinite(kg) && kg > 0 && kg <= 100000 && grade !== '' && hasPhoto;
  const preview = photo?.uri ?? farmer.capture?.photoUrl;

  const save = async () => {
    if (!ready || !grade) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ kg, grade, photo });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this capture.');
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{farmer.name}</Text>
      <Text style={s.meta}>{[localPhone(farmer.phone), farmer.product, `listed ${kgText(farmer.listedKg)} kg`].filter(Boolean).join(' · ')}</Text>

      {error ? <Banner text={error} /> : null}

      <Card style={s.card}>
        <Input label="Weight from the scale, kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
        <ChoiceChips label="Grade" options={GRADES} value={grade} onChange={(g) => setGrade(g as CaptureGrade)} />
      </Card>

      <Card tone="tint" style={s.card}>
        <Text style={s.name}>Photograph required</Text>
        <Text style={s.meta}>
          Every consignment is photographed, at every grade including A and including rejects. It settles a dispute, it is what the buyer sees on the lot card, and it is how a recall traces back to one farm and one day.
        </Text>
        {preview ? <Image source={{ uri: preview }} style={s.preview} accessibilityLabel="Photograph of the produce" /> : null}
        <Button label={hasPhoto ? 'Retake photograph' : 'Take photograph'} onPress={() => takePhoto().then((p) => p && setPhoto(p))} />
      </Card>

      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>Weight, grade, photograph, save. The collection fee splits across everyone at this stop, so every farmer's amount moves as you type this one.</Text>
      </Card>

      <Button label="Save capture" onPress={save} loading={busy} disabled={!ready} />
      <Button label="Cancel" variant="outline" onPress={onCancel} disabled={busy} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: c.ink },
  card: { gap: 12, alignSelf: 'stretch' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  preview: { width: '100%' as const, height: 180, borderRadius: 12, backgroundColor: c.surfaceSunken },
});
