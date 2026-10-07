import type { ReactNode } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../domain/store';
import { ChromeContext } from '../ui/chrome';
import { Select } from '../ui/host';
import { Logo } from '../ui/kit';
import { colors, fontFamily } from '../ui/theme';

const frameShadow =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as object)
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      };

// Simulates a 360px mobile handset on desktop/web viewports (>=480px) for field app testing,
// while expanding full-screen without bezels when running on physical mobile devices.
export function Phone({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const framed = width >= 480;
  const frame = (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.paper }}>{children}</View>
  );
  if (!framed) return <ChromeContext.Provider value="phone">{frame}</ChromeContext.Provider>;
  return (
    <ChromeContext.Provider value="phone">
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center' }}>
        <View
          style={[
            {
              width: '100%',
              maxWidth: 360,
              flex: 1,
              minHeight: 0,
              marginVertical: 16,
              backgroundColor: colors.paper,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,.1)',
              overflow: 'hidden',
              alignItems: 'stretch',
            },
            frameShadow,
          ]}
        >
          {children}
        </View>
      </View>
    </ChromeContext.Provider>
  );
}

export function Desk({
  nav,
  footer,
  children,
  logoHeight = 24,
}: {
  nav: { to: string; label: string; end?: boolean; group?: string }[];
  footer?: ReactNode;
  children: ReactNode;
  logoHeight?: number;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const { pathname } = useLocation();
  const go = useNavigate();
  const active = (to: string, end?: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(to + '/');
  let lastGroup = '';
  const links = nav.map((n) => {
    const showGroup = wide && n.group && n.group !== lastGroup;
    lastGroup = n.group ?? lastGroup;
    const on = active(n.to, n.end);
    return (
      <View key={n.to}>
        {showGroup ? (
          <Text
            style={{
              fontSize: 11,
              fontFamily: fontFamily('600'),
              color: colors.steelInk,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginTop: 14,
              marginBottom: 4,
              marginHorizontal: 12,
            }}
          >
            {n.group}
          </Text>
        ) : null}
        <Pressable
          onPress={() => go(n.to)}
          style={{
            height: wide ? 40 : 36,
            paddingHorizontal: 12,
            borderRadius: 6,
            justifyContent: 'center',
            backgroundColor: on ? colors.mist : 'transparent',
          }}
        >
          <Text
            style={{
              fontFamily: fontFamily(on ? '600' : '500'),
              color: on ? colors.blueInk : colors.ink,
              fontSize: wide ? 14 : 13,
            }}
          >
            {n.label}
          </Text>
        </Pressable>
      </View>
    );
  });
  if (wide) {
    return (
      <ChromeContext.Provider value="desk">
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.paper, minWidth: 0 }}>
          <View
            style={{
              width: 220,
              backgroundColor: '#fff',
              borderRightWidth: 1,
              borderRightColor: colors.line,
              paddingTop: 20,
              paddingHorizontal: 16,
              paddingBottom: 12,
            }}
          >
            <Logo h={logoHeight} style={{ alignSelf: 'flex-start' }} />
            <ScrollView
              style={{ flex: 1, marginTop: 24 }}
              contentContainerStyle={{ gap: 2, paddingBottom: 12 }}
            >
              {links}
            </ScrollView>
            {footer ? (
              <Text style={{ padding: 12, fontSize: 12, lineHeight: 18, color: colors.steelInk }}>
                {footer}
              </Text>
            ) : null}
          </View>
          <ScrollView
            style={{ flex: 1, minWidth: 0 }}
            contentContainerStyle={{
              paddingVertical: 24,
              paddingHorizontal: 28,
              gap: 16,
              width: '100%',
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </ChromeContext.Provider>
    );
  }
  return (
    <ChromeContext.Provider value="desk">
      <View style={{ flex: 1, backgroundColor: colors.paper, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            padding: 12,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          {links}
        </View>
        <ScrollView
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{ padding: 16, gap: 16, width: '100%' }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </ChromeContext.Provider>
  );
}

const demoShadow =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 8px 24px rgba(26,35,48,.24)' } as object)
    : {
        shadowColor: colors.ink,
        shadowOpacity: 0.24,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      };

export function DemoBar() {
  const { state, act } = useStore();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { width } = useWindowDimensions();
  const role = pathname.split('/')[1] || 'home';
  const roleValue = ['buyer', 'farmer', 'agent', 'driver', 'ops'].includes(role) ? role : 'home';
  const roleOptions = [
    { value: 'home', label: 'Choose role' },
    { value: 'buyer', label: 'Buyer' },
    { value: 'farmer', label: 'Farmer' },
    { value: 'agent', label: 'Field agent' },
    { value: 'driver', label: 'Driver' },
    { value: 'ops', label: 'Node manager' },
  ];
  const actor =
    role === 'buyer' ? (
      <Select
        dark
        value={state.session.buyerUserId}
        onValueChange={act.setBuyerUser}
        options={state.buyerUsers
          .filter((u) => u.status !== 'deactivated')
          .map((u) => ({
            value: u.id,
            label: `${u.name} · ${u.roles.join('/')}${u.orgId !== 'O1' ? ' · ' + (state.orgs.find((o) => o.id === u.orgId)?.name ?? '') : ''}`,
          }))}
        style={{ maxWidth: width < 720 ? 140 : 260, minHeight: 28 }}
      />
    ) : role === 'ops' ? (
      <Select
        dark
        value={state.session.opsUserId}
        onValueChange={act.setOpsUser}
        options={state.opsUsers.map((u) => ({ value: u.id, label: `${u.name} · ${u.title}` }))}
        style={{ maxWidth: width < 720 ? 140 : 220, minHeight: 28 }}
      />
    ) : role === 'farmer' ? (
      <Select
        dark
        value={state.session.farmerId}
        onValueChange={act.setFarmer}
        options={state.farmers.map((f) => ({ value: f.id, label: f.name }))}
        style={{ maxWidth: width < 720 ? 140 : 200, minHeight: 28 }}
      />
    ) : null;
  return (
    <View
      style={[
        {
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
          left: 12,
          bottom: 12,
          zIndex: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.ink,
          borderRadius: 999,
          paddingLeft: 12,
          paddingRight: 8,
          paddingVertical: 6,
          maxWidth: width - 24,
        },
        demoShadow,
      ]}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontFamily: fontFamily('600') }}>Demo</Text>
      <Select
        dark
        value={roleValue}
        onValueChange={(v) => nav(v === 'home' ? '/' : `/${v}`, { replace: true })}
        options={roleOptions}
        style={{ maxWidth: width < 720 ? 120 : 160, minHeight: 28 }}
      />
      {actor}
      <Pressable
        onPress={() =>
          Alert.alert('Reset demo', 'Reset all demo data to the seed?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Reset',
              style: 'destructive',
              onPress: () => {
                act.reset();
                nav('/');
              },
            },
          ])
        }
        style={{
          backgroundColor: colors.slate,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontFamily: fontFamily('600') }}>Reset</Text>
      </Pressable>
    </View>
  );
}
