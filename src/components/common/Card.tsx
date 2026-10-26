import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useThemedStyles, type ColorToken } from '../../theme';

export interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  tone?: 'default' | 'tint';
}

export function Card({ style, children, tone = 'default', ...rest }: CardProps) {
  const s = useThemedStyles(styles);
  return (
    <View style={[s.card, tone === 'tint' && s.tint, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: {
    backgroundColor: c.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.cardEdge,
    padding: 20,
    shadowColor: c.brand900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 2,
  },
  tint: { backgroundColor: c.brandTint },
});
