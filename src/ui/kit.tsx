import { createElement, useRef, useState, type ReactNode } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Tone } from '../domain/logic';
import { countdown, fmtStamp } from '../domain/logic';
import { colors, fontFamily } from './theme';

export const LOGO = 'https://cryochain.co/assets/logo-horizontal-DkoP_Knb.png';
export function Logo({ h = 24, style }: { h?: number; style?: { filter?: string; alignSelf?: 'flex-start' | 'center' } }) {
  const alignSelf = style?.alignSelf ?? 'flex-start';
  if (Platform.OS === 'web') {
    return createElement('img', {
      src: LOGO,
      alt: 'CryoChain',
      style: { height: h, width: 'auto', alignSelf, display: 'block', filter: style?.filter ? 'invert(1)' : undefined },
    });
  }
  return <Image source={{ uri: LOGO }} style={{ height: h, width: h * (907 / 293), alignSelf }} resizeMode="contain" accessibilityLabel="CryoChain" />;
}

const stroke = { fill: 'none' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const I = {
  lock: (c = '#5B6672', s = 16) => <Svg width={s} height={s} viewBox="0 0 24 24"><Rect x="5" y="11" width="14" height="10" rx="2" stroke={c} {...stroke} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={c} {...stroke} /></Svg>,
  check: (c = '#fff', s = 14) => <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M5 12l5 5L20 7" stroke={c} fill="none" strokeWidth={3} strokeLinecap="round" /></Svg>,
  camera: (c = colors.blue, s = 28) => <Svg width={s} height={s} viewBox="0 0 24 24"><Rect x="3" y="6" width="18" height="14" rx="2" stroke={c} {...stroke} /><Circle cx="12" cy="13" r="4" stroke={c} {...stroke} /><Path d="M9 6l1-2h4l1 2" stroke={c} {...stroke} /></Svg>,
  warn: (c = colors.red, s = 20) => <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 3l9 17H3z" stroke={c} {...stroke} /><Path d="M12 10v4M12 17v.5" stroke={c} {...stroke} /></Svg>,
  download: (c = colors.ink, s = 20) => <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 3v14M6 11l6 6 6-6M4 21h16" stroke={c} {...stroke} /></Svg>,
  thermo: (c = colors.steelInk, s = 20) => <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M12 14v7M8 21h8M6 6h12v4a6 6 0 0 1-12 0z" stroke={c} {...stroke} /></Svg>,
  sync: (c = '#fff', s = 18) => <Svg width={s} height={s} viewBox="0 0 24 24"><Path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" stroke={c} {...stroke} /><Path d="M18 3v4h-4M6 21v-4h4" stroke={c} {...stroke} /></Svg>,
};

const toneBg: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutral, fg: colors.slate },
  info: { bg: colors.mist, fg: colors.blueInk },
  ok: { bg: colors.greenTint, fg: colors.green },
  warn: { bg: colors.amberTint, fg: colors.amber },
  alert: { bg: colors.redTint, fg: colors.red },
};
export function Chip({ tone = 'neutral', children, lg, field, outline }: { tone?: Tone; children: ReactNode; lg?: boolean; field?: boolean; outline?: boolean }) {
  const t = toneBg[tone];
  return <Text style={{ alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: lg || field ? 10 : outline ? 6 : 8, paddingVertical: field ? 5 : lg ? 4 : 3, borderRadius: 4, fontSize: field ? 14 : 12, fontFamily: fontFamily('600'), color: outline ? colors.steelInk : t.fg, backgroundColor: outline ? '#fff' : t.bg, borderWidth: outline ? 1 : 0, borderColor: colors.steel }}>{children}</Text>;
}
Chip.displayName = 'Inline';

export function Money({ v, sign, color, size }: { v: number; sign?: boolean; color?: string; size?: number }) {
  return <Text style={{ fontFamily: fontFamily('600'), fontVariant: ['tabular-nums'], color: color ?? (sign && v < 0 ? colors.green : colors.ink), fontSize: size }}>{sign && v < 0 ? '− ' : ''}GHS {Math.abs(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>;
}
Money.displayName = 'Inline';
export function Stamped({ t }: { t: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{I.lock()}<Text style={{ fontFamily: fontFamily('600'), fontVariant: ['tabular-nums'], color: colors.ink }}>{fmtStamp(t)}</Text></View>;
}
export function Countdown({ deadline, now }: { deadline: number; now: number }) {
  const c = countdown(deadline, now);
  const color = c.tone === 'alert' ? colors.red : c.tone === 'warn' ? colors.amber : colors.ink;
  return <Text style={{ fontFamily: fontFamily('600'), fontVariant: ['tabular-nums'], color }}>{c.text}</Text>;
}
Countdown.displayName = 'Inline';

export function Btn({ to, onClick, kind = 'primary', children, disabled, sm, md, style }: { to?: string; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'field' | 'link-danger'; children: ReactNode; disabled?: boolean; sm?: boolean; md?: boolean; style?: object }) {
  const nav = useNavigate();
  const bg = disabled ? colors.steel : kind === 'primary' ? colors.blue : kind === 'field' ? colors.green : 'transparent';
  const fg = kind === 'danger' || kind === 'link-danger' ? colors.red : kind === 'secondary' ? colors.ink : '#fff';
  const border = kind === 'secondary' ? colors.steel : kind === 'danger' ? colors.red : 'transparent';
  return <Pressable disabled={disabled} onPress={disabled ? undefined : () => { if (to) nav(to); else onClick?.(); }} style={[{ minHeight: kind === 'field' ? 56 : sm ? 36 : md ? 40 : 48, paddingHorizontal: sm || md ? 12 : 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: kind === 'secondary' || kind === 'danger' ? 1 : 0, borderColor: border, width: sm || md || kind === 'link-danger' ? undefined : '100%', alignSelf: sm || md ? 'flex-start' : 'stretch' }, style]}>
    <Text style={{ color: disabled && kind !== 'primary' && kind !== 'field' ? '#fff' : fg, fontFamily: fontFamily(kind === 'field' ? '700' : '600'), fontSize: kind === 'field' ? 18 : sm || md ? 13 : 16, textAlign: 'center' }}>{children}</Text>
  </Pressable>;
}

export function TopBar({ back, title, right, children }: { back?: string; title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line }}>
    {back ? <Pressable onPress={() => nav(back)} accessibilityLabel="Back" style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}><Text style={{ fontSize: 20, color: colors.ink }}>←</Text></Pressable> : null}
    <Text style={{ fontSize: 16, fontFamily: fontFamily('600'), color: colors.ink, flex: 1 }} numberOfLines={1}>{title}</Text>
    {children}{right}
  </View>;
}

export function BottomNav({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  return <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#fff' }}>{items.map(i => {
    const active = i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + '/');
    return <Pressable key={i.to} onPress={() => nav(i.to, { replace: true })} style={{ flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, fontFamily: fontFamily('600'), color: active ? colors.blue : colors.steelInk }}>{i.label}</Text></Pressable>;
  })}</View>;
}

export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string; hint?: string }) {
  return <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontFamily: fontFamily('600'), color: error ? colors.red : colors.steelInk }}>{label}</Text>{children}{error ? <Text style={{ fontSize: 12, color: colors.red }}>{error}</Text> : hint ? <Text style={{ fontSize: 12, color: colors.steelInk }}>{hint}</Text> : null}</View>;
}

export function Progress({ step }: { step: number }) {
  return <View style={{ flexDirection: 'row', gap: 3 }}>{[0, 1, 2, 3, 4, 5, 6].map(i => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.green : colors.steel }} />)}</View>;
}

export function SyncBar({ online, pending, photos, lastSyncAt, onToggle, onSync, syncing }: { online: boolean; pending: number; photos: number; lastSyncAt?: number; onToggle: () => void; onSync: () => void; syncing?: boolean }) {
  const dot = !online ? (pending ? '#F2B540' : '#BAC2CC') : syncing ? '#7CB9E8' : '#5BB35F';
  const label = !online ? (pending ? `Offline · ${pending} pending` : 'Offline') : syncing ? 'Syncing' : pending ? `Syncing ${pending}` : 'Synced';
  const right = !online ? (pending ? `${photos} photos, ${pending - photos} events` : 'Work continues') : lastSyncAt ? new Date(lastSyncAt).toTimeString().slice(0, 5) : '';
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 16, backgroundColor: colors.ink }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
    <Text style={{ color: '#fff', fontFamily: fontFamily('600'), fontSize: 14 }}>{label}</Text>
    <Text style={{ marginLeft: 'auto', color: colors.steel, fontSize: 13 }}>{right}</Text>
    <Pressable onPress={onToggle}><Text style={{ color: '#fff', fontFamily: fontFamily('600'), textDecorationLine: 'underline' }}>{online ? 'Go offline' : 'Go online'}</Text></Pressable>
    {online && pending > 0 ? <Pressable onPress={onSync}><Text style={{ color: '#fff', fontFamily: fontFamily('600'), textDecorationLine: 'underline' }}>Sync now</Text></Pressable> : null}
  </View>;
}

export function Keypad({ value, onChange, unit = 'kg', max = 6 }: { value: string; onChange: (v: string) => void; unit?: string; max?: number }) {
  const latest = useRef(value); latest.current = value;
  const press = (k: string) => { const v = latest.current; let next = v; if (k === '⌫') next = v.slice(0, -1); else if (k === '.' && (v.includes('.') || !v)) return; else if (v.includes('.') && v.split('.')[1].length >= 1 && k !== '.') return; else if (v.replace('.', '').length >= max) return; else next = v + k; latest.current = next; onChange(next); };
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6, height: 64, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.steel, borderRadius: 8 }}><Text style={{ fontSize: 40, fontFamily: fontFamily('600'), color: value ? colors.ink : colors.steel }}>{value || '0'}</Text><Text style={{ fontSize: 20, color: colors.steelInk }}>{unit}</Text></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -4 }}>{['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => <View key={k} style={{ width: '33.333%', padding: 4 }}><Pressable onPress={() => press(k)} style={{ height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: k === '⌫' ? colors.lineSoft : '#fff', borderWidth: 1, borderColor: colors.steel, borderRadius: 8 }}><Text style={{ fontSize: k === '⌫' ? 16 : 24, fontFamily: fontFamily('600'), color: colors.ink }}>{k}</Text></Pressable></View>)}</View>
  </View>;
}

export function PhotoSlot({ label, done, required, onTake }: { label: string; done: boolean; required?: boolean; onTake: () => void }) {
  if (done) return <Pressable onPress={onTake} style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#E8ECEF', overflow: 'hidden' }}><Text style={{ position: 'absolute', left: 8, top: 8, fontSize: 11, fontFamily: 'monospace', color: colors.slate }}>photo: {label.toLowerCase()}</Text><View style={{ position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>{I.check('#fff', 14)}</View></Pressable>;
  return <Pressable onPress={onTake} style={{ width: '100%', aspectRatio: 1, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.blue, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff' }}>{I.camera()}<Text style={{ fontSize: 14, fontFamily: fontFamily('600'), color: colors.blue }}>{label}</Text>{required ? <Text style={{ fontSize: 12, color: colors.red, fontFamily: fontFamily('600') }}>Required</Text> : null}</Pressable>;
}

export function SignaturePad({ onChange, label = 'Sign here · Receiver' }: { onChange: (signed: boolean) => void; label?: string }) {
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const current = useRef<{ x: number; y: number }[]>([]);
  const signed = strokes.some(s => s.length > 1);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: e => { current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]; setStrokes(s => [...s, current.current]); },
    onPanResponderMove: e => { current.current = [...current.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]; setStrokes(s => [...s.slice(0, -1), current.current]); if (!signed) onChange(true); },
    onPanResponderRelease: () => { current.current = []; },
  })).current;
  const clear = () => { setStrokes([]); onChange(false); };
  return <View style={{ height: 140, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.steel, borderRadius: 8, overflow: 'hidden' }} {...responder.panHandlers}>
    <Svg width="100%" height="100%">{strokes.map((s, i) => <Polyline key={i} points={s.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}</Svg>
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 8, borderTopWidth: 1, borderTopColor: colors.steel, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: colors.steelInk }}>{label}</Text><Pressable onPress={clear}><Text style={{ color: colors.blue, fontFamily: fontFamily('600'), fontSize: 12 }}>Clear</Text></Pressable></View>
  </View>;
}

export function Stepper({ steps }: { steps: { title: string; sub: string; done: boolean }[] }) {
  return <View>{steps.map((s, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}><View style={{ alignItems: 'center' }}><View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? colors.green : '#fff', borderWidth: s.done ? 0 : 2, borderColor: colors.steel }}>{s.done ? I.check('#fff', 14) : null}</View>{i < steps.length - 1 ? <View style={{ width: 2, height: 24, backgroundColor: s.done ? colors.green : colors.steel }} /> : null}</View><View style={{ paddingBottom: 8, flex: 1 }}><Text style={{ fontFamily: fontFamily('600'), color: colors.ink }}>{s.title}</Text><Text style={{ fontSize: 12, color: colors.steelInk }}>{s.sub}</Text></View></View>)}</View>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}><Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(26,35,48,.45)', justifyContent: 'flex-end' }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 16, gap: 12, maxHeight: '90%' }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontSize: 16, fontFamily: fontFamily('600'), color: colors.ink }}>{title}</Text><Pressable onPress={onClose} accessibilityLabel="Close"><Text style={{ color: colors.steelInk, fontSize: 18 }}>✕</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView></Pressable></Pressable></Modal>;
}

export function Empty({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8, gap: 6 }}><Text style={{ fontFamily: fontFamily('400', true), fontSize: 22, color: colors.ink, textAlign: 'center' }}>{title}</Text>{sub ? <Text style={{ color: colors.steelInk, textAlign: 'center', marginBottom: 8 }}>{sub}</Text> : null}{action}</View>;
}
export function ErrBanner({ title, sub }: { title: string; sub?: string }) {
  return <View style={{ padding: 12, borderRadius: 6, backgroundColor: colors.redTint, flexDirection: 'row', gap: 10 }}>{I.warn()}<View style={{ flex: 1 }}><Text style={{ fontFamily: fontFamily('600'), color: colors.red }}>{title}</Text>{sub ? <Text style={{ fontSize: 13, color: colors.red }}>{sub}</Text> : null}</View></View>;
}
export function OkBanner({ title, sub }: { title: string; sub?: string }) {
  return <View style={{ padding: 12, borderRadius: 6, backgroundColor: colors.greenTint, flexDirection: 'row', gap: 10 }}>{I.check(colors.green, 18)}<View style={{ flex: 1 }}><Text style={{ fontFamily: fontFamily('600'), color: colors.green }}>{title}</Text>{sub ? <Text style={{ fontSize: 13, color: colors.green }}>{sub}</Text> : null}</View></View>;
}
export function Ph({ label, w = 72, h = 72 }: { label: string; w?: number; h?: number }) {
  return <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: '#E8ECEF' }}><Text style={{ position: 'absolute', left: 4, top: 4, fontSize: 10, fontFamily: 'monospace', color: colors.slate }}>{label}</Text></View>;
}
export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.steelInk, flex: 1 }}>{k}</Text><View style={{ alignItems: 'flex-end', flexShrink: 1 }}>{typeof v === 'string' || typeof v === 'number' ? <Text style={{ fontFamily: fontFamily('600'), color: colors.ink, textAlign: 'right' }}>{v}</Text> : v}</View></View>;
}
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>{tabs.map(t => <Pressable key={t} onPress={() => onChange(t)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: value === t ? colors.blue : 'transparent' }}><Text style={{ fontFamily: fontFamily('600'), fontSize: 14, color: value === t ? colors.blue : colors.steelInk }}>{t}</Text></Pressable>)}</View>;
}
export function useMedia(q: string) {
  const { width } = useWindowDimensions();
  const min = q.match(/min-width:\s*(\d+)px/);
  const max = q.match(/max-width:\s*(\d+)px/);
  if (min) return width >= Number(min[1]);
  if (max) return width <= Number(max[1]);
  return false;
}
export function copy(text: string) { Clipboard.setStringAsync(text).catch(() => {}); }
