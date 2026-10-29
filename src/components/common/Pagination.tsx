import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { type PressState, focusRing, fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Icon } from './Icon';

/** Page numbers to show: first, last, and a window around the current page, with '…' where pages are skipped. */
export function pageWindow(page: number, pages: number, around = 1): (number | '…')[] {
  const keep = new Set([1, pages]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= pages) keep.add(p);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev === 2) out.push(prev + 1); // a single skipped page is cheaper to show than "…"
    else if (p - prev > 2) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Numbered pagination with a "Showing 11–20 of 47" summary. Controlled: the parent owns `page` (1-based).
 * Renders nothing when everything fits on one page. On narrow screens the numbers collapse to "Page 2 of 5".
 */
export function Pagination({ page, total, pageSize, onPage, noun = 'results' }: { page: number; total: number; pageSize: number; onPage: (p: number) => void; noun?: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const compact = useWindowDimensions().width < 560;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages < 2) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const step = (label: string, target: number, off: boolean, icon: 'arrowLeft' | 'arrowRight') => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} onPress={() => onPage(target)}
      style={({ pressed, hovered, focused }: PressState) => [s.btn, off && s.off, hovered && !off && s.hover, pressed && !off && s.press, focused ? focusRing(colors.focusRing) : null]}>
      <Icon name={icon} size={18} color={off ? colors.inkMuted : colors.ink} />
    </Pressable>
  );

  return (
    <View style={s.wrap} accessibilityRole="toolbar" accessibilityLabel="Pagination">
      <Text style={s.summary}>Showing <Text style={s.strong}>{from}–{to}</Text> of <Text style={s.strong}>{total}</Text> {noun}</Text>
      <View style={s.controls}>
        {step('Previous page', page - 1, page <= 1, 'arrowLeft')}
        {compact ? <Text style={s.compact}>Page {page} of {pages}</Text> : pageWindow(page, pages).map((p, i) => p === '…' ? (
          <Text key={`gap${i}`} style={s.gap}>…</Text>
        ) : (
          <Pressable key={p} accessibilityRole="button" accessibilityLabel={`Page ${p}`} accessibilityState={{ selected: p === page }} onPress={() => onPage(p)}
            style={({ pressed, hovered, focused }: PressState) => [s.btn, p === page && s.on, hovered && p !== page && s.hover, pressed && s.press, focused ? focusRing(colors.focusRing) : null]}>
            <Text style={[s.num, p === page && s.numOn]}>{p}</Text>
          </Pressable>
        ))}
        {step('Next page', page + 1, page >= pages, 'arrowRight')}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, flexWrap: 'wrap' as const, gap: 12, paddingTop: 4 },
  summary: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  strong: { fontFamily: fonts.sansBold, color: c.ink, fontVariant: ['tabular-nums' as const] },
  controls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  btn: { minWidth: 40, height: 40, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle },
  on: { backgroundColor: c.brand600, borderColor: c.brand600 },
  off: { opacity: 0.45 },
  hover: { backgroundColor: c.brandTint, borderColor: c.brand500 },
  press: { transform: [{ scale: 0.96 }] },
  num: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  numOn: { fontFamily: fonts.sansBold, color: '#ffffff' },
  gap: { width: 24, textAlign: 'center' as const, fontFamily: fonts.sansBold, color: c.inkMuted },
  compact: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, minWidth: 96, textAlign: 'center' as const },
});
