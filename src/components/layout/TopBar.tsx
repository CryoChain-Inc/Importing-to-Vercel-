import React from 'react';
import { Pressable, View } from 'react-native';
import { useThemedStyles, type ColorToken } from '../../theme';
import { Brand } from '../common/Brand';
import { Icon } from '../common/Icon';
import { ThemeToggle } from '../common/ThemeToggle';
import { useNav } from '../../navigation';
import { useTheme } from '../../theme';

/** Back (when there is somewhere to go), brand, and the light/dark toggle. */
export function TopBar({ right }: { right?: React.ReactNode }) {
  const { canGoBack, back } = useNav();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  return (
    <View style={s.bar}>
      <View style={s.left}>
        {canGoBack ? (
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
            <Icon name="arrowLeft" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
        <Brand />
      </View>
      <View style={s.right}>
        {right}
        <ThemeToggle />
      </View>
    </View>
  );
}

const styles = (_c: Record<ColorToken, string>) => ({
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 56 },
  left: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  right: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  back: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
});
