import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Multi-select chips; selected ones are filled. */
export function MultiChips<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: { key: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <Button key={String(o.key)} size="sm" label={o.label} variant={on ? 'primary' : 'outline'}
              onPress={() => onChange(on ? value.filter((k) => k !== o.key) : [...value, o.key])} />
          );
        })}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.ink },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
});
