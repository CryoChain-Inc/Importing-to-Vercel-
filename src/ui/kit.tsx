import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Tone } from '../domain/logic';
import { countdown, fmtStamp } from '../domain/logic';

export const LOGO = 'https://cryochain.co/assets/logo-horizontal-DkoP_Knb.png';
export const Logo = ({ h = 24, style }: { h?: number; style?: CSSProperties }) => <img src={LOGO} alt="CryoChain" style={{ height: h, width: 'auto', ...style }} />;
export const I = {
  lock: (c = '#5B6672', s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  check: (c = 'currentColor', s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>,
  camera: (c = 'currentColor', s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M9 6l1-2h4l1 2" /></svg>,
  warn: (c = 'currentColor', s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" style={{ flex: 'none' }}><path d="M12 3l9 17H3z" /><path d="M12 10v4M12 17v.5" /></svg>,
  download: (c = '#1A2330', s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 3v14M6 11l6 6 6-6M4 21h16" /></svg>,
  thermo: (c = 'currentColor', s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 14v7M8 21h8M6 6h12v4a6 6 0 0 1-12 0z" /></svg>,
  sync: (c = 'currentColor', s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>,
};
export function Chip({ tone = 'neutral', children, lg, field, outline }: { tone?: Tone; children: ReactNode; lg?: boolean; field?: boolean; outline?: boolean }) {
  return <span className={`chip chip-${outline ? 'outline' : tone}${lg ? ' chip-lg' : ''}${field ? ' chip-field' : ''}`}>{children}</span>;
}
export const Money = ({ v, sign, color, size }: { v: number; sign?: boolean; color?: string; size?: number }) => <span className="tabular" style={{ fontWeight: 600, color: color ?? (sign && v < 0 ? 'var(--green)' : undefined), fontSize: size }}>{sign && v < 0 ? '− ' : ''}GHS {Math.abs(v).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
export const Stamped = ({ t }: { t: number }) => <span className="tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>{I.lock()}{fmtStamp(t)}</span>;
export function Countdown({ deadline, now }: { deadline: number; now: number }) { const c = countdown(deadline, now); const color = c.tone === 'alert' ? 'var(--red)' : c.tone === 'warn' ? 'var(--amber)' : undefined; return <span className="tabular" style={{ fontWeight: 600, color }}>{c.text}</span>; }
export function Btn({ to, onClick, kind = 'primary', children, disabled, sm, md, style, type = 'button' }: { to?: string; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'field' | 'link-danger'; children: ReactNode; disabled?: boolean; sm?: boolean; md?: boolean; style?: CSSProperties; type?: 'button' | 'submit' }) {
  const cls = `btn btn-${kind}${sm ? ' btn-sm' : ''}${md ? ' btn-md' : ''}${disabled ? ' btn-disabled' : ''}`;
  if (to && !disabled) return <Link className={cls} to={to} style={style}>{children}</Link>;
  return <button type={type} className={cls} onClick={disabled ? undefined : onClick} disabled={disabled} style={style}>{children}</button>;
}
export function TopBar({ back, title, right, children }: { back?: string; title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return <div className="topbar">{back && <Link className="back" to={back} aria-label="Back">←</Link>}<span className="title">{title}</span>{children}{right && <div className="right">{right}</div>}</div>;
}
export function BottomNav({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  return <nav className="bottomnav">{items.map(i => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>{i.label}</NavLink>)}</nav>;
}
export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string; hint?: string }) {
  return <label className="field"><span className="lbl" style={error ? { color: 'var(--red)' } : undefined}>{label}</span>{children}{error ? <span className="cap" style={{ color: 'var(--red)' }}>{error}</span> : hint ? <span className="cap">{hint}</span> : null}</label>;
}
export function Progress({ step }: { step: number }) { return <div className="progress">{[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>; }
export function SyncBar({ online, pending, photos, lastSyncAt, onToggle, onSync, syncing }: { online: boolean; pending: number; photos: number; lastSyncAt?: number; onToggle: () => void; onSync: () => void; syncing?: boolean }) {
  const dot = !online ? (pending ? '#F2B540' : '#BAC2CC') : syncing ? '#7CB9E8' : '#5BB35F';
  const label = !online ? (pending ? `Offline · ${pending} pending` : 'Offline') : syncing ? 'Syncing' : pending ? `Syncing ${pending}` : 'Synced';
  const right = !online ? (pending ? `${photos} photos, ${pending - photos} events` : 'Work continues') : lastSyncAt ? new Date(lastSyncAt).toTimeString().slice(0, 5) : '';
  return <div className="syncbar"><span className="dot" style={{ background: dot }} />{label}<span className="r">{right}<button onClick={onToggle}>{online ? 'Go offline' : 'Go online'}</button>{online && pending > 0 && <button onClick={onSync}>Sync now</button>}</span></div>;
}
export function Keypad({ value, onChange, unit = 'kg', max = 6 }: { value: string; onChange: (v: string) => void; unit?: string; max?: number }) {
  const latest = useRef(value); latest.current = value;
  const press = (k: string) => { const v = latest.current; let next = v; if (k === '⌫') next = v.slice(0, -1); else if (k === '.' && (v.includes('.') || !v)) return; else if (v.includes('.') && v.split('.')[1].length >= 1 && k !== '.') return; else if (v.replace('.', '').length >= max) return; else next = v + k; latest.current = next; onChange(next); };
  return <div className="col gap10"><div className="bignum">{value || <span style={{ color: 'var(--steel)' }}>0</span>}<span style={{ fontSize: 20, color: 'var(--steel-ink)' }}>{unit}</span></div><div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => <button key={k} className={k === '⌫' ? 'alt' : ''} onClick={() => press(k)} type="button">{k}</button>)}</div></div>;
}
export function PhotoSlot({ label, done, required, onTake }: { label: string; done: boolean; required?: boolean; onTake: () => void }) {
  if (done) return <button type="button" className="photo-slot done" onClick={onTake}><span className="lab">photo: {label.toLowerCase()}</span><span className="tick">{I.check('#fff', 14)}</span></button>;
  return <button type="button" className="photo-slot" onClick={onTake}>{I.camera()}<span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>{required && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Required</span>}</button>;
}
export function SignaturePad({ onChange, label = 'Sign here · Receiver' }: { onChange: (signed: boolean) => void; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [signed, setSigned] = useState(false);
  useEffect(() => { const c = ref.current!; const r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2; const ctx = c.getContext('2d')!; ctx.scale(2, 2); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1A2330'; }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic events have no capture */ } };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); if (!signed) { setSigned(true); onChange(true); } };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setSigned(false); onChange(false); };
  return <div className="sig"><canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} /><span className="base"><span>{label}</span><button type="button" onClick={clear}>Clear</button></span></div>;
}
export function Stepper({ steps }: { steps: { title: string; sub: string; done: boolean }[] }) {
  return <div className="stepper">{steps.map((s, i) => <div className="st" key={i}><div className="knob"><span className={`k ${s.done ? 'done' : 'wait'}`}>{s.done && I.check('#fff')}</span>{i < steps.length - 1 && <span className={`ln ${s.done ? 'done' : ''}`} />}</div><div style={{ paddingBottom: 8 }}><div style={{ fontWeight: 600 }}>{s.title}</div><div className="cap">{s.sub}</div></div></div>)}</div>;
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}><div className="row"><span className="h16">{title}</span><button onClick={onClose} className="muted" aria-label="Close">✕</button></div>{children}</div></div>;
}
export const Empty = ({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) => <div className="empty"><div className="hero-sm" style={{ marginBottom: 6 }}>{title}</div><div className="muted" style={{ marginBottom: 14 }}>{sub}</div>{action}</div>;
export const ErrBanner = ({ title, sub }: { title: string; sub?: string }) => <div className="err-banner">{I.warn()}<div><div style={{ fontWeight: 600 }}>{title}</div>{sub && <div style={{ fontSize: 13 }}>{sub}</div>}</div></div>;
export const OkBanner = ({ title, sub }: { title: string; sub?: string }) => <div className="ok-banner">{I.check('currentColor', 18)}<div><div style={{ fontWeight: 600 }}>{title}</div>{sub && <div style={{ fontSize: 13 }}>{sub}</div>}</div></div>;
export const Ph = ({ label, w = 72, h = 72, style }: { label: string; w?: number | string; h?: number; style?: CSSProperties }) => <div className="ph" style={{ width: w, height: h, flex: 'none', ...style }}><span>{label}</span></div>;
export const KV = ({ k, v }: { k: ReactNode; v: ReactNode }) => <div className="row"><span className="muted">{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>;
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) { return <div style={{ display: 'flex', gap: 8, padding: '0 16px', fontSize: 14, fontWeight: 600 }}>{tabs.map(t => <button key={t} onClick={() => onChange(t)} style={{ padding: '10px 14px', borderBottom: value === t ? '2px solid var(--blue)' : '2px solid transparent', color: value === t ? 'var(--blue)' : 'var(--steel-ink)' }}>{t}</button>)}</div>; }
export function useMedia(q: string) { const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]); return m; }
export function copy(text: string) { try { navigator.clipboard?.writeText(text); } catch { /* ignore */ } }
