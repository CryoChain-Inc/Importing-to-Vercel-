import { ActivityIndicator, Text, View } from 'react-native';
import { Logo } from './kit';
import { colors, fontFamily } from './theme';

export function LoadingScreen({
  message = 'Loading',
  detail,
  busy = true,
}: {
  message?: string;
  detail?: string;
  busy?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 48,
      }}
    >
      <Logo h={44} style={{ alignSelf: 'center' }} />
      {busy ? (
        <ActivityIndicator
          color={colors.blue}
          size="large"
          style={{ marginTop: 36 }}
          accessibilityLabel={message}
        />
      ) : null}
      <Text
        style={{
          marginTop: busy ? 20 : 28,
          fontSize: 16,
          lineHeight: 22,
          color: colors.ink,
          fontFamily: fontFamily('500'),
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
      {detail ? (
        <Text
          style={{
            marginTop: 8,
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 20,
            color: colors.steelInk,
            fontFamily: fontFamily('400'),
            textAlign: 'center',
          }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
