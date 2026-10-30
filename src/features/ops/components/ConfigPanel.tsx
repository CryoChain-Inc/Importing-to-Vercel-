import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Icon, Input, type IconName } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useIsWide } from '../../../components/layout';
import { saveConfig, type OpsConfig } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { COUNTRIES, DEFAULT_COUNTRY, isNationalNumber, toE164, type Country } from '../../../data/countries';
import { PhoneField } from '../../auth/components/PhoneField';
import { EMAIL_MAX, isEmail } from '../../../utils/format';
import { useAction } from './useAction';

const blank = (v: string) => v.trim() === '';
const TEMP_MIN = -100;
const TEMP_MAX = 100;
const GAUGE = 30;
const PRESETS = [
  { label: 'Frozen', lo: '-25', hi: '-15' },
  { label: 'Chilled', lo: '0', hi: '4' },
  { label: 'Cool', lo: '2', hi: '8' },
  { label: 'Cool store', lo: '8', hi: '13' },
];
const inRange = (v: string) => Number.isFinite(Number(v)) && Number(v) >= TEMP_MIN && Number(v) <= TEMP_MAX;
const tempError = (v: string) => (blank(v) || inRange(v) ? undefined : `Between ${TEMP_MIN} and ${TEMP_MAX}`);
const pct = (v: number) => `${((Math.max(-GAUGE, Math.min(GAUGE, v)) + GAUGE) / (GAUGE * 2)) * 100}%` as `${number}%`;

/** Stored digits (e.g. 233241234567) back into a country plus national number; longest dial code wins. */
function splitPhone(digits: string): { country: Country; national: string } {
  const hit = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
  return hit ? { country: hit, national: digits.slice(hit.dial.length) } : { country: DEFAULT_COUNTRY, national: digits };
}

export function ConfigPanel({ config, onChange }: { config: OpsConfig; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const wide = useIsWide();
  const { busy, error, run } = useAction(onChange);
  const [base, setBase] = useState(config);
  const [c, setC] = useState(config);
  const [saved, setSaved] = useState(false);
  const initial = splitPhone(config.supportPhone.replace(/\D/g, ''));
  const [country, setCountry] = useState(initial.country);
  const [national, setNational] = useState(initial.national);
  const setPhone = (cc: Country, n: string) => {
    setSaved(false);
    setC({ ...c, supportPhone: n.trim() ? toE164(cc, n) : '' });
  };
  const set = (k: keyof OpsConfig) => (v: string) => { setSaved(false); setC({ ...c, [k]: v }); };

  const numeric = [c.minTemp, c.maxTemp].every((v) => blank(v) || inRange(v));
  const ordered = blank(c.minTemp) || blank(c.maxTemp) || Number(c.minTemp) < Number(c.maxTemp);
  const phoneOk = blank(national) || isNationalNumber(country, national);
  const emailOk = blank(c.supportEmail) || isEmail(c.supportEmail);
  const valid = numeric && ordered && phoneOk && emailOk;
  const dirty = (Object.keys(c) as (keyof OpsConfig)[]).some((k) => c[k] !== base[k]);
  const range = !blank(c.minTemp) && !blank(c.maxTemp) && numeric && ordered ? `${Number(c.minTemp)}° to ${Number(c.maxTemp)}°C` : 'Not set';

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      {saved ? <Banner tone="info" text="Settings saved." /> : null}
      <View style={[s.cols, wide && s.colsWide]}>
        <View style={s.main}>
          <Card style={s.form}>
            <Head icon="sliders" title="Cold-chain temperature" help="Readings outside this range are flagged on deliveries." />
            <View style={s.pair}>
              <View style={s.grow}><Input label="Min (°C)" value={c.minTemp} onChangeText={set('minTemp')} keyboardType="numbers-and-punctuation" maxLength={6} error={tempError(c.minTemp)} /></View>
              <View style={s.grow}><Input label="Max (°C)" value={c.maxTemp} onChangeText={set('maxTemp')} keyboardType="numbers-and-punctuation" maxLength={6} error={tempError(c.maxTemp) ?? (ordered ? undefined : 'Must be above min')} /></View>
            </View>
            <View style={s.gauge} accessibilityLabel={`Safe range ${range}`}>
              <View style={s.track}>
                {numeric && ordered && !blank(c.minTemp) && !blank(c.maxTemp)
                  ? <View style={[s.band, { left: pct(Number(c.minTemp)), right: `${100 - parseFloat(pct(Number(c.maxTemp)))}%` as `${number}%` }]} />
                  : null}
              </View>
              <View style={s.ticks}>
                <Text style={s.tick}>{-GAUGE}°</Text><Text style={s.tick}>0°</Text><Text style={s.tick}>{GAUGE}°</Text>
              </View>
            </View>
            <View style={s.presets}>
              <Text style={s.help}>Quick set</Text>
              {PRESETS.map((p) => (
                <Button key={p.label} label={`${p.label} ${p.lo}° to ${p.hi}°`} size="sm" variant={c.minTemp === p.lo && c.maxTemp === p.hi ? 'tonal' : 'outline'}
                  onPress={() => { setSaved(false); setC({ ...c, minTemp: p.lo, maxTemp: p.hi }); }} />
              ))}
            </View>
          </Card>
          <Card style={s.form}>
            <Head icon="phone" title="Support contact" help="Shown to farmers and buyers who need help." />
            <View style={s.pair}>
              <View style={s.grow}><PhoneField label="Support phone" country={country} value={national} error={phoneOk ? undefined : 'Enter a valid phone number'}
                onCountry={(cc) => { setCountry(cc); setPhone(cc, national); }} onChangeText={(v) => { setNational(v); setPhone(country, v); }} /></View>
              <View style={s.grow}><Input label="Support email" value={c.supportEmail} onChangeText={set('supportEmail')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={EMAIL_MAX} hint={`${c.supportEmail.length}/${EMAIL_MAX}`} error={emailOk ? undefined : 'Enter a valid email address'} /></View>
            </View>
          </Card>
        </View>
        <Card style={[s.form, s.side, wide && s.sideWide]}>
          <Text style={s.sideTitle}>Summary</Text>
          <Row label="Safe range" value={range} big />
          <Row label="Support phone" value={blank(national) ? 'Not set' : `+${country.dial} ${national.trim()}`} />
          <Row label="Support email" value={blank(c.supportEmail) ? 'Not set' : c.supportEmail.trim()} />
          {config.updatedAt ? <Text style={s.help}>Last saved {new Date(config.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' })}</Text> : null}
          <Text style={s.help}>{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</Text>
          <View style={s.actions}>
            {dirty ? <Button label="Discard" variant="ghost" onPress={() => { setC(base); setSaved(false); }} /> : null}
            <Button label="Save settings" loading={busy} disabled={!valid || !dirty}
              onPress={() => run(async () => { await saveConfig(c); setBase(c); setSaved(true); })} />
          </View>
        </Card>
      </View>
    </View>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <Text style={s.help}>{label}</Text>
      <Text style={big ? s.readoutValue : s.rowValue} numberOfLines={1}>{value}</Text>
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
  list: { gap: 14 },
  cols: { gap: 14 },
  colsWide: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  main: { flex: 3, gap: 14 },
  side: { backgroundColor: c.brandTint },
  sideWide: { flex: 2 },
  sideTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  row: { gap: 2, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  rowValue: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  form: { gap: 14 },
  pair: { flexDirection: 'row' as const, gap: 12 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  help: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  readoutValue: { fontFamily: fonts.sansBold, fontSize: 24, color: c.brandInk, fontVariant: ['tabular-nums' as const] },
  gauge: { gap: 4 },
  track: { height: 12, borderRadius: 6, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const },
  band: { position: 'absolute' as const, top: 0, bottom: 0, borderRadius: 6, backgroundColor: c.brand500 },
  ticks: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  tick: { fontFamily: fonts.sansRegular, fontSize: 11, color: c.inkMuted },
  presets: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 10 },
});
