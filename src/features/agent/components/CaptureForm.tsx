import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { estimateCapture, type AgentFarmer, type CaptureEstimate, type CaptureGrade } from '../../../services/agent.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs, localPhone } from '../../../utils/format';
import { takePhoto, type Photo } from '../../../utils/photo';

const GRADES = ['A', 'B', 'Reject'];
const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Weigh, grade and photograph one farmer's produce. Shows what they listed and what they will be paid for what you enter. */
export function CaptureForm({
  farmer,
  onSave,
  onCancel,
}: {
  farmer: AgentFarmer;
  onSave: (input: { kg: number; grade: CaptureGrade; photo: Photo | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const s = useThemedStyles(styles);
  const [weight, setWeight] = useState(farmer.capture ? String(farmer.capture.recordedKg) : '');
  const [grade, setGrade] = useState<CaptureGrade | ''>(farmer.capture?.grade ?? '');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ key: string; value: CaptureEstimate | null; failed?: boolean } | null>(null);

  const kg = Number(weight);
  const validKg = Number.isFinite(kg) && kg > 0 && kg <= 100000;
  const hasPhoto = Boolean(photo || farmer.capture?.photoPath);
  const ready = validKg && grade !== '' && hasPhoto;
  const preview = photo?.uri ?? farmer.capture?.photoUrl;
  const key = `${farmer.product}|${kg}|${grade}`;

  useEffect(() => {
    if (!validKg || !grade) return;
    let live = true;
    const timer = setTimeout(() => {
      estimateCapture(farmer.product, kg, grade).then(
        (value) => live && setEstimate({ key, value }),
        () => live && setEstimate({ key, value: null, failed: true }),
      );
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [farmer.product, kg, grade, key, validKg]);

  const est = estimate?.key === key ? estimate : null;

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
      <View style={s.head}>
        <Text style={s.title}>{farmer.name}</Text>
        <Text style={s.meta}>{[localPhone(farmer.phone), farmer.product].filter(Boolean).join(' · ')}</Text>
      </View>

      {error ? <Banner text={error} /> : null}

      <Card style={s.card}>
        <View style={s.row}>
          <Text style={s.name}>What the farmer listed</Text>
          <Badge label={`Grade ${farmer.listedGrade}`} tone="neutral" />
        </View>
        <Text style={s.meta}>{farmer.product} · {kgText(farmer.listedKg)}{farmer.estNet != null ? ` · expected ${ghs(farmer.estNet)}` : ''}</Text>
        {farmer.photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
            {farmer.photos.map((uri) => <Image key={uri} source={{ uri }} style={s.thumb} accessibilityLabel={`${farmer.product} listed by ${farmer.name}`} />)}
          </ScrollView>
        ) : <Text style={s.meta}>The farmer added no photos.</Text>}
      </Card>

      <Card style={s.card}>
        <Input label="Weight from the scale, kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
        <ChoiceChips label="Grade" options={GRADES} value={grade} onChange={(g) => setGrade(g as CaptureGrade)} />
      </Card>

      <Card tone="tint" style={s.card}>
        <Text style={s.name}>Tell the farmer what to expect</Text>
        {!validKg || !grade ? (
          <Text style={s.meta}>Enter the weight and pick a grade to see what the farmer will be paid.</Text>
        ) : !est ? (
          <Text style={s.meta}>Working it out…</Text>
        ) : est.failed ? (
          <Text style={s.meta}>Could not work this out. Check your connection.</Text>
        ) : est.value ? (
          <>
            <Text style={s.amount}>{grade === 'Reject' ? 'No payment' : ghs(est.value.net)}</Text>
            <Text style={s.meta}>
              {grade === 'Reject'
                ? 'Rejected produce is not paid.'
                : `${kgText(kg)} at ${ghs(est.value.pricePerKg)}/kg = ${ghs(est.value.gross)}, less the ${ghs(est.value.fee)} collection fee. Paid once the buyer has received the lot.`}
            </Text>
          </>
        ) : <Text style={s.meta}>No published price for grade {grade} yet. Ask operations to set one.</Text>}
      </Card>

      <Card style={s.card}>
        <Text style={s.name}>Photograph required</Text>
        <Text style={s.meta}>Every consignment is photographed, at every grade including rejects. It settles disputes and is what the buyer sees on the lot card.</Text>
        {preview ? <Image source={{ uri: preview }} style={s.preview} accessibilityLabel="Photograph of the produce" /> : null}
        <Button label={hasPhoto ? 'Retake photograph' : 'Take photograph'} variant={hasPhoto ? 'outline' : 'primary'} icon="camera" onPress={() => takePhoto().then((p) => p && setPhoto(p))} />
      </Card>

      <Button label="Save capture" onPress={save} loading={busy} disabled={!ready} />
      <Button label="Cancel" variant="outline" onPress={onCancel} disabled={busy} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12, width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const },
  head: { gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: c.ink },
  card: { gap: 12, alignSelf: 'stretch' as const },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  amount: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 42, letterSpacing: -0.8, color: c.brandInk, fontVariant: ['tabular-nums' as const] },
  photos: { gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceSunken },
  preview: { width: '100%' as const, height: 200, borderRadius: 12, backgroundColor: c.surfaceSunken },
});
