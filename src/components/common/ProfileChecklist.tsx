import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { type PressState, focusRing, fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Card } from './Card';
import { Icon } from './Icon';

export interface ChecklistStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** Optional steps are listed but do not count toward completion. */
  optional?: boolean;
  onPress: () => void;
}

/** "Finish your profile" card: progress bar plus one tappable row per step. Render it only while required steps remain. */
export function ProfileChecklist({ steps, title = 'Finish your profile', lead }: { steps: ChecklistStep[]; title?: string; lead?: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const required = steps.filter((x) => !x.optional);
  const done = required.filter((x) => x.done).length;

  return (
    <Card tone="tint" style={s.card}>
      <View style={s.top}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.count}>{done} of {required.length}</Text>
      </View>
      {lead ? <Text style={s.hint}>{lead}</Text> : null}
      <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: required.length, now: done }}>
        <View style={[s.fill, { width: `${(done / required.length) * 100}%` }]} />
      </View>
      <View style={s.rows}>
        {steps.map((x) => (
          <Pressable key={x.key} accessibilityRole="button" accessibilityLabel={`${x.label}${x.done ? ', done' : ''}`} onPress={x.onPress}
            style={({ pressed, focused }: PressState) => [s.row, pressed && s.pressed, focused ? focusRing(colors.focusRing) : null]}>
            <View style={[s.dot, x.done && s.dotDone]}>
              {x.done ? <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} /> : null}
            </View>
            <View style={s.text}>
              <Text style={[s.label, x.done && s.labelDone]}>{x.label}{x.optional ? '  ·  optional' : ''}</Text>
              {x.done ? null : <Text style={s.hint}>{x.hint}</Text>}
            </View>
            {x.done ? null : <Icon name="chevronRight" size={18} color={colors.inkMuted} />}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 12 },
  top: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  count: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk, fontVariant: ['tabular-nums' as const] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.brand600 },
  rows: { gap: 2, marginTop: 4 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12 },
  pressed: { opacity: 0.7 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  dotDone: { borderColor: c.brand600, backgroundColor: c.brand600 },
  text: { flex: 1, gap: 1 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  labelDone: { color: c.inkMuted },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
