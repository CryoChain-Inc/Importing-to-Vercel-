import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_CENTER, placeDetails, reverseGeocode, searchPlaces, type PlaceInfo, type Suggestion } from '../../services/maps.service';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Button, Icon } from '../common';
import { MapCanvas, type MapTarget } from './MapCanvas';

type Coords = { latitude: number; longitude: number };

/** Full-screen "move the pin to your exact spot" picker. Resolves to the pin's coordinates plus Google's address for it. */
export function LocationPicker({ visible, initial, onClose, onPick }: {
  visible: boolean;
  initial?: Coords | null;
  onClose: () => void;
  onPick: (p: PlaceInfo) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? <Picker initial={initial ?? null} onClose={onClose} onPick={onPick} /> : null}
    </Modal>
  );
}

function Picker({ initial, onClose, onPick }: { initial: Coords | null; onClose: () => void; onPick: (p: PlaceInfo) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [target, setTarget] = useState<MapTarget>({ ...(initial ?? DEFAULT_CENTER), n: 0 });
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const pin = useRef<Coords>(initial ?? DEFAULT_CENTER);
  const latest = useRef(0);

  const moveTo = useCallback((c: Coords) => setTarget((t) => ({ ...c, n: t.n + 1 })), []);

  const locate = useCallback(async (quiet = false) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Allow location access to use this.');
      // High accuracy often fails on desktop browsers (no GPS); fall back to the network fix.
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() =>
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      );
      moveTo(coords);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }, [moveTo]);

  // Nothing saved yet: start where the person is.
  useEffect(() => {
    if (initial) return;
    const t = setTimeout(() => locate(true), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = useCallback(async (latitude: number, longitude: number) => {
    pin.current = { latitude, longitude };
    const id = ++latest.current;
    setResolving(true);
    setError(null);
    try {
      const info = await reverseGeocode(latitude, longitude);
      if (id === latest.current) setPlace(info);
    } catch (e) {
      if (id === latest.current) {
        setPlace(null);
        setError(e instanceof Error ? e.message : 'Could not read the address here.');
      }
    } finally {
      if (id === latest.current) setResolving(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      searchPlaces(q, pin.current).then(setSuggestions).catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const shown = query.trim().length >= 3 ? suggestions : [];

  const choose = async (sg: Suggestion) => {
    setSuggestions([]);
    setQuery('');
    try {
      moveTo(await placeDetails(sg.placeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that place.');
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.top}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close map" style={s.back}>
          <Icon name="arrowLeft" size={22} color={colors.ink} />
        </Pressable>
        <Text style={s.title}>Select location</Text>
      </View>
      <View style={s.searchBox}>
        <Icon name="search" size={20} color={colors.brandInk} />
        <TextInput
          style={[s.search, { outlineStyle: 'none' } as object]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search for area, street name…"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Search for a place"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={s.mapWrap}>
        <MapCanvas target={target} onSettle={settle} />
        <View style={s.pinWrap}>
          <View style={s.hint}><Text style={s.hintText}>Move the map to place the pin on your exact spot</Text></View>
          <View style={s.pinShadow} />
          <Icon name="pin" size={44} color={colors.dangerFill} strokeWidth={2.4} />
        </View>
        <Pressable onPress={() => locate()} disabled={locating} accessibilityRole="button" style={s.locate}>
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Icon name="locate" size={20} color={colors.brandInk} />}
          <Text style={s.locateText}>Use current location</Text>
        </Pressable>
        {shown.length ? (
          <ScrollView style={s.suggestions} keyboardShouldPersistTaps="handled">
            {shown.map((sg) => (
              <Pressable key={sg.placeId} onPress={() => choose(sg)} style={s.suggestion} accessibilityRole="button">
                <Icon name="pin" size={18} color={colors.inkMuted} />
                <View style={s.suggestionText}>
                  <Text style={s.suggestionTitle} numberOfLines={1}>{sg.title}</Text>
                  <Text style={s.suggestionSub} numberOfLines={1}>{sg.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={s.sheet}>
        <Text style={s.sheetLabel}>Selected location</Text>
        <View style={s.addressCard}>
          <Icon name="pin" size={22} color={colors.dangerFill} />
          {resolving ? (
            <Text style={s.addressMuted}>Finding the address…</Text>
          ) : place ? (
            <Text style={s.address}>{place.address}</Text>
          ) : (
            <Text style={s.addressMuted}>{error ?? 'Move the pin to a spot on the map.'}</Text>
          )}
        </View>
        {place && error ? <Text style={s.addressMuted}>{error}</Text> : null}
        <Button
          label="Confirm location"
          disabled={!place || resolving}
          onPress={() => place && onPick({ ...place, ...pin.current })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  screen: { flex: 1, backgroundColor: c.bgApp },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  back: { width: TOUCH, height: TOUCH, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 20, color: c.ink },
  searchBox: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginHorizontal: 16, marginVertical: 8,
    paddingHorizontal: 14, minHeight: TOUCH, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard,
  },
  search: { flex: 1, minHeight: TOUCH, fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
  mapWrap: { flex: 1, overflow: 'hidden' as const },
  // The wrapper ends at the map centre, so the pin's tip lands on it.
  pinWrap: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: '50%' as const, alignItems: 'center' as const, justifyContent: 'flex-end' as const, pointerEvents: 'none' as const },
  pinShadow: { position: 'absolute' as const, bottom: -3, width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.3)' },
  hint: { position: 'absolute' as const, bottom: 56, maxWidth: 240, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.ink },
  hintText: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, textAlign: 'center' as const, color: c.bgApp },
  locate: {
    position: 'absolute' as const, bottom: 16, alignSelf: 'center' as const, flexDirection: 'row' as const, alignItems: 'center' as const,
    gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: c.surfaceCard,
    boxShadow: '0 3px 10px rgba(10,61,36,0.18)',
  },
  locateText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.brandInk },
  suggestions: { position: 'absolute' as const, top: 0, left: 16, right: 16, maxHeight: 280, borderRadius: 14, backgroundColor: c.surfaceCard, elevation: 6 },
  suggestion: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.surfaceSunken },
  suggestionText: { flex: 1 },
  suggestionTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  suggestionSub: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  sheet: { gap: 12, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.surfaceCard },
  sheetLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  addressCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56, padding: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  address: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 21, color: c.ink },
  addressMuted: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
