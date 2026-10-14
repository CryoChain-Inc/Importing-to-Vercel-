import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ASSETS } from '../../assets';

export interface AppIconProps {
  size?: number;
  rounded?: boolean;
  variant?: 'full' | 'transparent';
  style?: StyleProp<ViewStyle>;
}

/**
 * CryoChain Brand Icon recolored to match the Agri-Market UI Design System.
 * - 'full': The complete icon with blueprint geometry and soft off-white canvas.
 * - 'transparent': The isolated chevron glyph with transparent background.
 * Works seamlessly across Mobile (iOS/Android) and Web.
 */
export function AppIcon({
  size = 48,
  rounded = true,
  variant = 'full',
  style,
}: AppIconProps) {
  const borderRadius = rounded && variant === 'full' ? Math.round(size * 0.22) : 0;
  const source = variant === 'transparent' ? ASSETS.iconForeground : ASSETS.appIcon;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
        style,
      ]}
    >
      <Image
        source={source}
        style={{
          width: size,
          height: size,
          borderRadius,
        }}
        resizeMode="contain"
        accessibilityLabel="CryoChain Agri Market App Icon"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
