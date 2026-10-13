import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, fonts } from '../../theme';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, style, ...rest }: InputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={colors.steel}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    width: '100%',
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.steelLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    fontSize: 15,
    fontFamily: fonts.sansRegular,
    color: colors.ink,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.danger,
  },
  hint: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.inkMuted,
  },
});
