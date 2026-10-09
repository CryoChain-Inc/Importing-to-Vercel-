import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { captureSignedUrl } from '../backend/media';
import { Ph } from './kit';

export function StoredImage({
  stored,
  w = 72,
  h = 72,
}: {
  stored?: string;
  w?: number;
  h?: number;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUri(null);
    void captureSignedUrl(stored).then((url) => {
      if (live) setUri(url);
    });
    return () => {
      live = false;
    };
  }, [stored]);
  if (!uri) return <Ph label="" w={w} h={h} />;
  return (
    <Image source={{ uri }} style={{ width: w, height: h, borderRadius: 6 }} resizeMode="cover" />
  );
}
