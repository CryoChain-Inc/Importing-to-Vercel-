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
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setView((v) => { from.x = v.x; from.y = v.y; return v; }),
      onPanResponderMove: (_, g) => { if (size) setView((v) => place(from.x + g.dx, from.y + g.dy, v.zoom, size, frame)); },
    });
  }, [size, frame]);

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
