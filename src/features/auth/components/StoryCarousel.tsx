import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LOGIN_STORIES } from '../../../assets/loginStories';

const AUTO_MS = 4500;

/** Swipeable, auto-advancing story posters. Artwork is 2:3 with its caption near the top, so images anchor to the top edge. */
export function StoryCarousel({ style, dotsBottom = 20 }: { style?: object; dotsBottom?: number }) {
  const list = useRef<FlatList>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [index, setIndex] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const goTo = useCallback((i: number) => list.current?.scrollToOffset({ offset: i * box.w, animated: true }), [box.w]);

  // Restarts after every change, so a manual swipe or tap gets a full beat before the next slide.
  useEffect(() => {
    if (!box.w) return;
    const t = setTimeout(() => goTo((index + 1) % LOGIN_STORIES.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [index, box.w, goTo]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / box.w);
    if (i !== index && i >= 0 && i < LOGIN_STORIES.length) setIndex(i);
  };

  const imgH = Math.max(box.h, box.w * 1.5);

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#0a2a1a' }, style]} onLayout={onLayout}>
      {box.w > 0 ? (
        <FlatList
          ref={list}
          data={LOGIN_STORIES}
          keyExtractor={(s) => s.accessibilityLabel}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, i) => ({ length: box.w, offset: box.w * i, index: i })}
          initialNumToRender={2}
          windowSize={3}
          renderItem={({ item }) => (
            <View style={{ width: box.w, height: box.h, overflow: 'hidden' }}>
              <Image source={item.image} accessibilityLabel={item.accessibilityLabel} style={{ width: box.w, height: imgH }} />
            </View>
          )}
        />
      ) : null}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: dotsBottom, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {LOGIN_STORIES.map((s, i) => (
          <Pressable
            key={s.accessibilityLabel}
            onPress={() => goTo(i)}
            accessibilityRole="button"
            accessibilityLabel={`Show story ${i + 1} of ${LOGIN_STORIES.length}`}
            accessibilityState={{ selected: i === index }}
            hitSlop={10}
            style={{ height: 6, width: i === index ? 22 : 6, borderRadius: 3, backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.45)' }}
          />
        ))}
      </View>
    </View>
  );
}
