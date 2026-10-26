import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Icon, Input, type IconName } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { saveConfig, type OpsConfig } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { useAction } from './useAction';

export function ConfigPanel({ config, onChange }: { config: OpsConfig; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [c, setC] = useState(config);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof OpsConfig) => (v: string) => { setSaved(false); setC({ ...c, [k]: v }); };
  const nums = [c.minTemp, c.maxTemp, c.payoutThreshold].every((v) => v.trim() === '' || Number.isFinite(Number(v)));
  const ordered = c.minTemp.trim() === '' || c.maxTemp.trim() === '' || Number(c.minTemp) < Number(c.maxTemp);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Head icon="sliders" title="Cold-chain temperature" help="Readings outside this range are flagged on deliveries." />
        <Input label="Min temperature (°C)" value={c.minTemp} onChangeText={set('minTemp')} keyboardType="numbers-and-punctuation" />
        <Input label="Max temperature (°C)" value={c.maxTemp} onChangeText={set('maxTemp')} keyboardType="numbers-and-punctuation" error={ordered ? undefined : 'Must be above min'} />
      </Card>
      <Card style={s.form}>
        <Head icon="wallet" title="Payouts" help="When a payout run needs a second approver, and where buyers send money." />
        <Input label="Payout transfer threshold (GH₵)" value={c.payoutThreshold} onChangeText={set('payoutThreshold')} keyboardType="decimal-pad" />
        <Input label="Transfer bank" value={c.bankName} onChangeText={set('bankName')} />
        <Input label="Account name" value={c.accountName} onChangeText={set('accountName')} />
        <Input label="Account number" value={c.accountNumber} onChangeText={set('accountNumber')} keyboardType="number-pad" hint="Digits only, 6–20." />
      </Card>
      <Card style={s.form}>
        <Head icon="phone" title="Operations" help="Shown to farmers and buyers who need help." />
        <Input label="Support phone" value={c.supportPhone} onChangeText={set('supportPhone')} keyboardType="phone-pad" />
      </Card>
      <Button label={saved ? 'Saved' : 'Save settings'} loading={busy} disabled={!nums || !ordered}
        onPress={() => run(async () => { await saveConfig(c); setSaved(true); })} />
    </View>
  );
}

function Head({ icon, title, help }: { icon: IconName; title: string; help: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={s.head}>
      <View style={s.icon}><Icon name={icon} size={18} color={colors.brandInk} /></View>
      <View style={s.grow}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.help}>{help}</Text>
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  help: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
});
