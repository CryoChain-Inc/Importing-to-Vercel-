import React from 'react';
import { Text, View } from 'react-native';
import { fonts, useTheme } from '../../theme';
import { AppIcon } from './AppIcon';

export function Brand({ size = 36, light = false }: { size?: number; light?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <AppIcon size={size} />
      <Text style={{ fontFamily: fonts.heading, fontSize: size * 0.58, color: light ? '#ffffff' : colors.ink, letterSpacing: -0.4 }}>
        CryoChain
      </Text>
    </View>
  );
}
