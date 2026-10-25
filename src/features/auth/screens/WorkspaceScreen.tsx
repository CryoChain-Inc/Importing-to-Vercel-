import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthLayout } from '../../../components/layout';
import { Icon } from '../../../components/common';
import { useNav } from '../../../navigation';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account, Role } from '../../../types/auth';

const LABEL: Record<Role, string> = { farmer: 'Farmer', buyer: 'Buyer', driver: 'Driver', ops: 'Operations' };

/** Lists only roles the server assigned; picking one never grants anything new. */
export function WorkspaceScreen({ account }: { account: Account }) {
  const { reset } = useNav();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  return (
    <AuthLayout title="Choose a workspace" subtitle={`Hi ${account.name}, your account has access to more than one workspace.`}>
      <View style={s.list}>
        {account.roles.map((role) => (
          <Pressable key={role} accessibilityRole="button" onPress={() => reset({ name: 'home', account, role })} style={s.row}>
            <Text style={s.role}>{LABEL[role]}</Text>
            <Icon name="arrowRight" size={18} color={colors.brandInk} />
          </Pressable>
        ))}
      </View>
    </AuthLayout>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 64, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  role: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
});
