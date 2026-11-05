import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, PanResponder, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '../../../components/common';
import type { PickedImage } from '../../../services/catalogueImage';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Sheet } from './Sheet';

const MAX_ZOOM = 4;
const OUT = 1200;

type Size = { w: number; h: number };

/** Keeps the image covering the whole frame at the given zoom. */
function place(x: number, y: number, zoom: number, size: Size, frame: number) {
  const k = (frame / Math.min(size.w, size.h)) * zoom;
  return { zoom, x: Math.min(0, Math.max(frame - size.w * k, x)), y: Math.min(0, Math.max(frame - size.h * k, y)) };
}

/** Square crop: drag to position, +/- to zoom. Works with mouse and touch. Saves a JPEG, so uploads stay small. */
export function CropModal({ uri, onCancel, onDone }: { uri: string; onCancel: () => void; onDone: (img: PickedImage) => void }) {
  const s = useThemedStyles(styles);
  const frame = Math.min(useWindowDimensions().width - 80, 360);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gesture handlers read the latest values from here instead of closing over stale state.
  const [live] = useState({ view, size, frame });
  useEffect(() => { Object.assign(live, { view, size, frame }); });
  // New photo in the same dialog (so the sheet doesn't re-open): drop the old photo's size and last save state.
  const [seen, setSeen] = useState(uri);
  if (seen !== uri) { setSeen(uri); setSize(null); setBusy(false); setError(null); }
  // Scale at zoom 1: the short side exactly fills the frame.
  const base = size ? frame / Math.min(size.w, size.h) : 1;
  useEffect(() => {
    Image.getSize(uri, (w, h) => {
      const k = frame / Math.min(w, h);
      setSize({ w, h });
      setView({ zoom: 1, x: (frame - w * k) / 2, y: (frame - h * k) / 2 });
    }, () => setError('Could not open that image.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const pan = useMemo(() => {
    const from = { x: 0, y: 0 };
    const pinch = { d: 0, zoom: 1 };
    const zoomed = (v: { x: number; y: number; zoom: number }, z: number, sz: Size) => {
      const { frame } = live;
      const b0 = frame / Math.min(sz.w, sz.h);
      const cx = (frame / 2 - v.x) / (b0 * v.zoom);
      const cy = (frame / 2 - v.y) / (b0 * v.zoom);
      return place(frame / 2 - cx * b0 * z, frame / 2 - cy * b0 * z, z, sz, frame);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // The sheet body is a ScrollView: refuse to hand the gesture back, or Android cancels pinches.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => { pinch.d = 0; from.x = live.view.x; from.y = live.view.y; },
      onPanResponderMove: (e, g) => {
        const { size, frame } = live;
        if (!size) return;
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          // Two fingers: pinch to zoom around the frame centre.
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (!pinch.d) { pinch.d = d; pinch.zoom = live.view.zoom; return; }
          const z = Math.min(MAX_ZOOM, Math.max(1, pinch.zoom * (d / pinch.d)));
          setView((v) => zoomed(v, z, size));
        } else if (pinch.d) {
          // Back to one finger: re-anchor so the image doesn't jump.
          pinch.d = 0;
          from.x = live.view.x - g.dx;
          from.y = live.view.y - g.dy;
        } else {
          setView((v) => place(from.x + g.dx, from.y + g.dy, v.zoom, size, frame));
        }
      },
    });
  }, [live]);

  const zoomTo = (next: number) => {
    if (!size) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const k = base * view.zoom;
    const cx = (frame / 2 - view.x) / k;
    const cy = (frame / 2 - view.y) / k;
    setView(place(frame / 2 - cx * base * z, frame / 2 - cy * base * z, z, size, frame));
  };

  const save = async () => {
    if (!size) return;
    setBusy(true);
    setError(null);
    try {
      const k = base * view.zoom;
      const side = Math.min(frame / k, size.w, size.h);
      const ctx = ImageManipulator.manipulate(uri).crop({
        originX: Math.max(0, Math.min(size.w - side, -view.x / k)),
        originY: Math.max(0, Math.min(size.h - side, -view.y / k)),
        width: side,
        height: side,
      });
      if (side > OUT) ctx.resize({ width: OUT, height: OUT });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      onDone({ uri: out.uri, mimeType: 'image/jpeg' });
    } catch {
      setError('Could not crop that image. Try another one.');
      setBusy(false);
    }
  };

  const k = base * view.zoom;
  return (
    <Sheet title="Crop photo" subtitle="Drag to move, zoom to fit. Buyers see this square." onClose={onCancel}
      footer={<><Button label="Cancel" variant="ghost" onPress={onCancel} /><Button label="Use photo" loading={busy} disabled={!size} onPress={save} /></>}>
      <View style={s.stage}>
        <View style={[s.frame, { width: frame, height: frame }]} {...pan.panHandlers}>
          {size ? <Image source={{ uri }} resizeMode="stretch" accessibilityLabel="Photo being cropped"
            style={{ position: 'absolute', left: view.x, top: view.y, width: size.w * k, height: size.h * k }} /> : null}
          <View pointerEvents="none" style={s.grid}>
            <View style={[s.line, { left: '33.33%', top: 0, bottom: 0, width: 1 }]} />
            <View style={[s.line, { left: '66.66%', top: 0, bottom: 0, width: 1 }]} />
            <View style={[s.line, { top: '33.33%', left: 0, right: 0, height: 1 }]} />
            <View style={[s.line, { top: '66.66%', left: 0, right: 0, height: 1 }]} />
          </View>
        </View>
        <View style={s.zoom}>
          <Button label="−" size="sm" variant="outline" disabled={view.zoom <= 1} onPress={() => zoomTo(view.zoom - 0.5)} />
          <Text style={s.zoomText}>{Math.round(view.zoom * 100)}%</Text>
          <Button label="+" size="sm" variant="outline" disabled={view.zoom >= MAX_ZOOM} onPress={() => zoomTo(view.zoom + 0.5)} />
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  stage: { alignItems: 'center' as const, gap: 14 },
  frame: { overflow: 'hidden' as const, borderRadius: 16, backgroundColor: c.surfaceSunken, borderWidth: 2, borderColor: c.brand600, cursor: 'grab' } as object,
  grid: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  line: { position: 'absolute' as const, backgroundColor: 'rgba(255,255,255,0.55)' },
  zoom: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  zoomText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, minWidth: 48, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] },
  error: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.dangerInk },
});
