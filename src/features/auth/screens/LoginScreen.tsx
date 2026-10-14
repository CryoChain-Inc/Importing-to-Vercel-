import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon, Button, Card, Input } from '../../../components/common';
import { authService } from '../../../services/auth.service';
import { colors, fonts, textStyles } from '../../../theme';

export interface LoginScreenProps {
  onSuccess?: () => void;
  onNavigateToRegister?: () => void;
}

export function LoginScreen({ onSuccess, onNavigateToRegister }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Please provide both email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { error: authError } = await authService.signInWithEmail(
        email.trim().toLowerCase(),
        password,
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.brandHeader}>
            <AppIcon size={64} style={{ marginBottom: 12 }} />
            <Text style={styles.brandTitle}>CryoChain</Text>
            <Text style={styles.brandSubtitle}>
              Cold from the farm gate to your door.
            </Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSubtitle}>
              Access your operational portal with your credentials.
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <Input
                label="Email Address"
                placeholder="you@organization.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Button
                label="Sign In"
                onPress={handleSignIn}
                loading={loading}
                style={styles.submitBtn}
              />

              {onNavigateToRegister ? (
                <Button
                  label="Create an Account"
                  variant="outline"
                  onPress={onNavigateToRegister}
                />
              ) : null}
            </View>
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    gap: 24,
  },
  brandHeader: {
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: colors.brand,
  },
  brandSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  card: {
    padding: 24,
    gap: 16,
  },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.ink,
  },
  cardSubtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.inkMuted,
  },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.danger,
  },
  form: {
    gap: 14,
  },
  submitBtn: {
    marginTop: 6,
  },
});
