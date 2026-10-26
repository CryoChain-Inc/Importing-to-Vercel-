import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { colors, fonts } from '../../theme';

export interface LoadingScreenProps {
  message?: string;
  detail?: string;
}

export function LoadingScreen({
  message = 'Loading CryoChain...',
  detail,
}: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandGroup}>
        <AppIcon size={72} />
        <Text style={styles.brandTitle}>CryoChain</Text>
        <Text style={styles.brandSubtitle}>Cold from the farm gate to your door.</Text>
      </View>

      <View style={styles.loadingGroup}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.message}>{message}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 40,
  },
  brandGroup: {
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.brand,
    marginTop: 6,
  },
  brandSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  loadingGroup: {
    alignItems: 'center',
    gap: 12,
  },
  message: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
});

export default LoadingScreen;
