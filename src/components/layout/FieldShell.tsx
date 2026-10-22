import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Badge, Button, ThemeToggle } from '../common';
import { Skeleton, SkeletonCard } from '../feedback';
import { useNav } from '../../navigation';
import { authService } from '../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';

/** Page frame for the agent and driver apps: greeting, theme toggle, centred column that widens on desktop, sign out. */
export function FieldShell({ name, role, children }: { name: string; role: string; children: React.ReactNode }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  return (
    <KeyboardAvoidingView behavior="padding" style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.content}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.hello} numberOfLines={1}>Hello, {name || role.toLowerCase()}</Text>
              <Badge label={role} tone="info" />
            </View>
            <ThemeToggle />
          </View>
          {children}
          <Button label="Sign out" variant="ghost" size="sm" onPress={() => authService.signOut().finally(() => reset({ name: 'landing' }))} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Skeleton shaped like the route screens: hero, then stop cards. */
export function FieldSkeleton() {
  const s = useThemedStyles(styles);
  return (
    <View style={s.skel}>
      <Skeleton height={150} radius={24} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { padding: 16, paddingBottom: 40 },
  content: { width: '100%' as const, maxWidth: 960, alignSelf: 'center' as const, gap: 16 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headerText: { gap: 8, alignItems: 'flex-start' as const, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.ink },
  skel: { gap: 12 },
});
