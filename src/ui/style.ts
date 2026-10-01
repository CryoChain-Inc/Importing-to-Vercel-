// Lightweight runtime CSS compiler: parses utility classes and CSS properties into
// React Native ViewStyle and TextStyle objects, enabling web-like styling on mobile.
import { Dimensions, type TextStyle, type ViewStyle } from 'react-native';
import { colors, cssVar, fontFamily } from './theme';

export type RNStyle = ViewStyle & TextStyle;

const TEXT_KEYS = new Set([
  'color',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'lineHeight',
  'textAlign',
  'letterSpacing',
  'textDecorationLine',
  'fontVariant',
  'fontStyle',
]);

function num(value: unknown): number | 'auto' | `${number}%` | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  if (value === 'auto') return 'auto';
  if (value.endsWith('%')) return value as `${number}%`;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function box(value: unknown) {
  if (typeof value === 'number') return [value, value, value, value];
  const parts = String(value).trim().split(/\s+/).map(num);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

function border(value: unknown): RNStyle {
  if (value === 0 || value === '0') return { borderWidth: 0 };
  const m = String(cssVar(value)).match(/([\d.]+)px\s+(solid|dashed)\s+(.+)/);
  if (!m) return {};
  return {
    borderWidth: parseFloat(m[1]),
    borderStyle: m[2] as 'solid' | 'dashed',
    borderColor: m[3],
  };
}

function sideBorder(key: string, value: unknown): RNStyle {
  const b = border(value);
  const cap = key.slice(6); // Bottom / Top / Left / Right
  const out: RNStyle = {};
  if (b.borderWidth != null) (out as Record<string, unknown>)[`border${cap}Width`] = b.borderWidth;
  if (b.borderColor) (out as Record<string, unknown>)[`border${cap}Color`] = b.borderColor;
  return out;
}

export function normalizeStyle(input?: object | null): RNStyle {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = cssVar(raw);
    if (
      value == null ||
      key === 'cursor' ||
      key === 'outline' ||
      key === 'resize' ||
      key === 'appearance' ||
      key === 'transition' ||
      key === 'filter' ||
      key === 'boxSizing' ||
      key === 'whiteSpace' ||
      key === 'gridTemplateColumns' ||
      key === 'gridColumn'
    )
      continue;
    if (key === 'padding' || key === 'margin') {
      const [t, r, b, l] = box(value);
      const cap = key[0].toUpperCase() + key.slice(1);
      out[`${key}Top`] = t;
      out[`${key}Right`] = r;
      out[`${key}Bottom`] = b;
      out[`${key}Left`] = l;
      void cap;
      continue;
    }
    if (key === 'border') Object.assign(out, border(value));
    else if (
      key === 'borderTop' ||
      key === 'borderBottom' ||
      key === 'borderLeft' ||
      key === 'borderRight'
    )
      Object.assign(out, sideBorder(key, value));
    else if (key === 'background' || key === 'backgroundColor') {
      const s = String(value);
      out.backgroundColor = s.includes('gradient')
        ? '#E8ECEF'
        : s === 'transparent'
          ? 'transparent'
          : s;
    } else if (key === 'font') {
      const m = String(value).match(/([\d.]+)px/);
      if (m) out.fontSize = parseFloat(m[1]);
      if (String(value).includes('mono')) out.fontFamily = 'monospace';
    } else if (key === 'fontWeight') out.fontWeight = String(value) as TextStyle['fontWeight'];
    else if (key === 'placeItems' && value === 'center') {
      out.alignItems = 'center';
      out.justifyContent = 'center';
    } else if (key === 'display') {
      if (value === 'none') out.display = 'none';
    } else if (key === 'textDecoration')
      out.textDecorationLine =
        value === 'none' ? 'none' : String(value).includes('underline') ? 'underline' : 'none';
    else if (key === 'letterSpacing' && typeof value === 'string' && value.endsWith('em'))
      out.letterSpacing = parseFloat(value) * 16;
    else if (key === 'lineHeight' && typeof value === 'number' && value > 0 && value < 4)
      out.lineHeight = Math.round(value * (Number(out.fontSize) || 16));
    else if (key === 'flex' && value === 'none') {
      out.flexGrow = 0;
      out.flexShrink = 0;
    } else if (key === 'overflow') out.overflow = value === 'visible' ? 'visible' : 'hidden';
    else if (key === 'position')
      out.position = value === 'fixed' || value === 'sticky' ? 'relative' : value;
    else if (
      key === 'width' ||
      key === 'height' ||
      key === 'minWidth' ||
      key === 'maxWidth' ||
      key === 'minHeight' ||
      key === 'maxHeight' ||
      key === 'top' ||
      key === 'left' ||
      key === 'right' ||
      key === 'bottom'
    ) {
      if (value === 'auto') continue;
      if (typeof value === 'string' && value.includes('dvh')) out.flex = 1;
      else out[key] = typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : value;
    } else if (
      key === 'gap' ||
      key === 'borderRadius' ||
      key === 'borderWidth' ||
      key === 'opacity' ||
      key === 'zIndex' ||
      key === 'flex' ||
      key === 'aspectRatio'
    ) {
      out[key] = typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : value;
    } else out[key] = typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : value;
  }
  return out as RNStyle;
}

function tokensOf(className?: string) {
  return (className ?? '').split(/\s+/).filter(Boolean);
}

export function classStyle(className?: string): RNStyle {
  const tokens = tokensOf(className);
  const view: RNStyle = {};
  const width = Dimensions.get('window').width;
  for (const token of tokens) {
    if (token === 'row')
      Object.assign(view, {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      });
    else if (token === 'col') view.flexDirection = 'column';
    else if (/^gap\d+$/.test(token)) view.gap = Number(token.slice(3));
    else if (token === 'card')
      Object.assign(view, {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
      });
    else if (token === 'card-pad')
      Object.assign(view, { paddingHorizontal: 14, paddingVertical: 12 });
    else if (token === 'muted') view.color = colors.steelInk;
    else if (token === 'cap')
      Object.assign(view, { fontSize: 12, lineHeight: 17, color: colors.steelInk });
    else if (token === 'lbl')
      Object.assign(view, { fontSize: 12, fontWeight: '600', color: colors.steelInk });
    else if (token === 'h16')
      Object.assign(view, { fontSize: 16, fontWeight: '600', lineHeight: 22, color: colors.ink });
    else if (token === 'h20')
      Object.assign(view, { fontSize: 20, fontWeight: '600', lineHeight: 25, color: colors.ink });
    else if (token === 'h24')
      Object.assign(view, { fontSize: 24, fontWeight: '600', color: colors.ink });
    else if (token === 'hero')
      Object.assign(view, {
        fontSize: 32,
        lineHeight: 40,
        color: colors.ink,
        fontFamily: fontFamily('400', true),
      });
    else if (token === 'hero-sm')
      Object.assign(view, {
        fontSize: 22,
        lineHeight: 28,
        color: colors.ink,
        fontFamily: fontFamily('400', true),
      });
    else if (token === 'tabular') view.fontVariant = ['tabular-nums'];
    else if (token === 'tint-green')
      Object.assign(view, {
        backgroundColor: colors.greenTint,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.green,
      });
    else if (token === 'tint-amber')
      Object.assign(view, {
        backgroundColor: colors.amberTint,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.amber,
      });
    else if (token === 'tint-red')
      Object.assign(view, {
        backgroundColor: colors.redTint,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.red,
      });
    else if (token === 'tint-blue')
      Object.assign(view, {
        backgroundColor: colors.mist,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.blueInk,
      });
    else if (token === 'body') Object.assign(view, { padding: 16, gap: 12, flexGrow: 1 });
    else if (token === 'footer')
      Object.assign(view, {
        marginTop: 'auto',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        gap: 8,
      });
    else if (token === 'item')
      Object.assign(view, {
        padding: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        gap: 6,
      });
    else if (token === 'tile')
      Object.assign(view, {
        height: 104,
        padding: 12,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        justifyContent: 'flex-end',
      });
    else if (token === 'wide') view.backgroundColor = colors.lineSoft;
    else if (token === 'pill')
      Object.assign(view, {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.steel,
        backgroundColor: '#fff',
      });
    else if (token === 'input')
      Object.assign(view, {
        borderWidth: 1,
        borderColor: colors.steel,
        borderRadius: 6,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        minHeight: 48,
        fontSize: 16,
        color: colors.ink,
        flexDirection: 'row',
        alignItems: 'center',
      });
    else if (token === 'btn')
      Object.assign(view, {
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
      });
    else if (token === 'btn-primary')
      Object.assign(view, { backgroundColor: colors.blue, color: '#fff' });
    else if (token === 'btn-secondary')
      Object.assign(view, {
        borderWidth: 1,
        borderColor: colors.steel,
        backgroundColor: '#fff',
        color: colors.ink,
      });
    else if (token === 'btn-danger')
      Object.assign(view, {
        borderWidth: 1,
        borderColor: colors.red,
        backgroundColor: '#fff',
        color: colors.red,
      });
    else if (token === 'btn-field')
      Object.assign(view, {
        minHeight: 56,
        backgroundColor: colors.green,
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
      });
    else if (token === 'btn-link-danger')
      Object.assign(view, { backgroundColor: 'transparent', color: colors.red });
    else if (token === 'btn-sm')
      Object.assign(view, {
        minHeight: 36,
        height: 36,
        paddingHorizontal: 12,
        width: undefined,
        alignSelf: 'flex-start',
        fontSize: 13,
      });
    else if (token === 'btn-md')
      Object.assign(view, {
        minHeight: 40,
        height: 40,
        paddingHorizontal: 12,
        width: undefined,
        alignSelf: 'flex-start',
        fontSize: 13,
      });
    else if (token === 'btn-disabled')
      Object.assign(view, { backgroundColor: colors.steel, color: '#fff' });
    else if (token === 'chip')
      Object.assign(view, {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: '600',
        overflow: 'hidden',
      });
    else if (token === 'chip-lg')
      Object.assign(view, { paddingHorizontal: 10, paddingVertical: 4 });
    else if (token === 'chip-field')
      Object.assign(view, { fontSize: 14, paddingHorizontal: 10, paddingVertical: 5 });
    else if (token === 'chip-neutral')
      Object.assign(view, { backgroundColor: colors.neutral, color: colors.slate });
    else if (token === 'chip-info')
      Object.assign(view, { backgroundColor: colors.mist, color: colors.blueInk });
    else if (token === 'chip-ok')
      Object.assign(view, { backgroundColor: colors.greenTint, color: colors.green });
    else if (token === 'chip-warn')
      Object.assign(view, { backgroundColor: colors.amberTint, color: colors.amber });
    else if (token === 'chip-alert')
      Object.assign(view, { backgroundColor: colors.redTint, color: colors.red });
    else if (token === 'chip-outline')
      Object.assign(view, {
        borderWidth: 1,
        borderColor: colors.steel,
        backgroundColor: '#fff',
        color: colors.steelInk,
        paddingHorizontal: 6,
        paddingVertical: 1,
      });
    else if (token === 'f')
      Object.assign(view, {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.steel,
        borderRadius: 6,
        backgroundColor: '#fff',
      });
    else if (token === 'tbl')
      Object.assign(view, {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        width: '100%',
        overflow: 'hidden',
      });
    else if (token === 'toolbar')
      Object.assign(view, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 });
    else if (token === 'two')
      Object.assign(view, {
        flexDirection: width < 1024 ? 'column' : 'row',
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: '#fff',
        overflow: 'hidden',
      });
    else if (token === 'side')
      Object.assign(
        view,
        width < 1024
          ? { borderTopWidth: 1, borderTopColor: colors.line, padding: 20, gap: 14 }
          : { borderLeftWidth: 1, borderLeftColor: colors.line, padding: 20, gap: 14, width: 380 },
      );
    else if (token === 'sel') view.backgroundColor = colors.mist;
    else if (token === 'num') Object.assign(view, { textAlign: 'right', alignItems: 'flex-end' });
    else if (token === 'list') view.gap = 10;
    else if (token === 'sep') Object.assign(view, { height: 1, backgroundColor: colors.line });
    else if (token === 'empty')
      Object.assign(view, { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8 });
    else if (token === 'ph')
      Object.assign(view, { backgroundColor: '#E8ECEF', borderRadius: 6, overflow: 'hidden' });
    else if (token === 'photo-grid')
      Object.assign(view, { flexDirection: 'row', flexWrap: 'wrap', gap: 10 });
    else if (token === 'field') Object.assign(view, { flexDirection: 'column', gap: 6 });
    else if (token === 'progress') Object.assign(view, { flexDirection: 'row', gap: 3 });
  }
  if (tokens.includes('on') && tokens.includes('f'))
    Object.assign(view, {
      borderColor: colors.blue,
      backgroundColor: colors.mist,
      color: colors.blueInk,
      fontWeight: '600',
    });
  else if (tokens.includes('on') && tokens.includes('pill'))
    Object.assign(view, { backgroundColor: colors.ink, borderColor: colors.ink, color: '#fff' });
  if (tokens.includes('btn-sm') || tokens.includes('btn-md') || tokens.includes('btn-link-danger'))
    delete view.width;
  if (!view.fontFamily)
    view.fontFamily = fontFamily(
      view.fontWeight as string | undefined,
      tokens.includes('hero') || tokens.includes('hero-sm'),
    );
  if (
    view.color == null &&
    (tokens.includes('h16') ||
      tokens.includes('h20') ||
      tokens.includes('h24') ||
      tokens.includes('hero'))
  )
    view.color = colors.ink;
  return view;
}

export function present(className?: string, style?: object | null) {
  const merged = { ...classStyle(className), ...normalizeStyle(style) } as RNStyle;
  if (merged.fontWeight && !String(merged.fontFamily || '').includes('Fraunces'))
    merged.fontFamily = fontFamily(merged.fontWeight as string);
  const view: ViewStyle = {};
  const text: TextStyle = {};
  for (const [key, value] of Object.entries(merged)) {
    if (TEXT_KEYS.has(key)) (text as Record<string, unknown>)[key] = value;
    else (view as Record<string, unknown>)[key] = value;
  }
  if (text.color == null) text.color = colors.ink;
  return { view, text, merged };
}

export function isLayoutClass(className?: string) {
  return /\b(row|col|card|body|footer|toolbar|item|tile|list|tbl|two|side|field|photo-grid|phone|landing|desk|progress|empty|sep)\b/.test(
    className ?? '',
  );
}

export function gridTemplate(className?: string, style?: { gridTemplateColumns?: string } | null) {
  if (style?.gridTemplateColumns) return style.gridTemplateColumns;
  if (/\bphoto-grid\b/.test(className ?? '')) return '1fr 1fr';
  return undefined;
}

export type Col = { kind: 'fr'; n: number } | { kind: 'px'; n: number };

export function parseGrid(template: string): Col[] {
  const repeat = template.match(/^repeat\((\d+),\s*(.+)\)$/);
  if (repeat) {
    const inner = parseGrid(repeat[2]);
    return Array.from({ length: Number(repeat[1]) }, () => inner).flat();
  }
  return template
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.endsWith('px')) return { kind: 'px', n: parseFloat(part) };
      if (part.endsWith('fr')) return { kind: 'fr', n: parseFloat(part) };
      return { kind: 'fr', n: 1 };
    });
}
