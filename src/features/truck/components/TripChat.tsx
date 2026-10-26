import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { supabase } from '../../../services/supabase';
import {
  callPhone, dialable, fetchTruckMessages, sendTruckMessage, type TruckMessage,
} from '../../../services/truck.chat.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Messages and a phone call between the buyer and the driver assigned to one trip. */
export function TripChat({ bookingId, peerName, peerPhone, peerRole }: {
  bookingId: string;
  peerName: string;
  peerPhone: string;
  peerRole: 'driver' | 'buyer';
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [mine, setMine] = useState('');
  const [messages, setMessages] = useState<TruckMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const number = dialable(peerPhone);

  const load = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id) setMine(session.session.user.id);
    setMessages(await fetchTruckMessages(bookingId));
  };

  useEffect(() => {
    let live = true;
    load().catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load messages.'); });
    const timer = setInterval(() => {
      fetchTruckMessages(bookingId).then((rows) => { if (live) setMessages(rows); }, () => undefined);
    }, 4000);
    const channel = supabase
      .channel(`truck-messages-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'truck_messages', filter: `booking_id=eq.${bookingId}` }, () => {
        fetchTruckMessages(bookingId).then((rows) => { if (live) setMessages(rows); }, () => undefined);
      })
      .subscribe();
    return () => {
      live = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendTruckMessage(bookingId, text);
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  const call = async () => {
    setCalling(true);
    setError(null);
    try {
      await callPhone(peerPhone);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the call.');
    } finally {
      setCalling(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Button
        label={peerRole === 'driver' ? 'Call driver' : 'Call buyer'}
        icon="phone"
        variant="outline"
        size="sm"
        loading={calling}
        disabled={!number}
        onPress={call}
      />
      {!number ? <Text style={s.meta}>No phone number is saved for {peerName} yet.</Text> : null}
      <Text style={s.k}>Messages with {peerName}</Text>
      {error ? <Banner text={error} /> : null}
      <ScrollView ref={scroller} style={s.thread} contentContainerStyle={s.threadContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? <Text style={s.meta}>No messages yet. Say where you are, or ask about the pickup.</Text> : null}
        {messages.map((m) => {
          const own = m.senderId === mine;
          return (
            <View key={m.id} style={[s.bubble, own ? s.mine : s.theirs]}>
              <Text style={[s.body, own && s.bodyMine]}>{m.body}</Text>
              <Text style={[s.time, own && s.timeMine]}>{new Date(m.createdAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={s.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={colors.inkMuted}
          maxLength={500}
          onSubmitEditing={send}
          style={[s.input, { outlineStyle: 'none' } as object]}
        />
        <Button label="Send" size="sm" loading={sending} disabled={!draft.trim()} onPress={send} />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8, alignSelf: 'stretch' as const },
  k: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  thread: { maxHeight: 240, borderRadius: 14, backgroundColor: c.surfaceSunken },
  threadContent: { gap: 8, padding: 10 },
  bubble: { maxWidth: '85%' as const, gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  mine: { alignSelf: 'flex-end' as const, backgroundColor: c.brand600 },
  theirs: { alignSelf: 'flex-start' as const, backgroundColor: c.surfaceCard },
  body: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.ink },
  bodyMine: { color: '#ffffff' },
  time: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  composer: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  input: {
    flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong,
    backgroundColor: c.surfaceCard, paddingHorizontal: 12, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink,
  },
});
