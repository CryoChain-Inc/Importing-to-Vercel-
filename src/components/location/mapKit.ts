import type { LatLng, LivePlace } from './liveMapTypes';

/** Brand-matched look shared by the native and web maps: soft green land, mint parks, calm water, quiet labels. */
export const MAP_COLORS = {
  light: { route: '#12864b', casing: '#ffffff', trail: '#a7b3ac' },
  dark: { route: '#4cc081', casing: '#0a1410', trail: '#4f5d56' },
} as const;

const rule = (featureType: string, elementType: string, stylers: object[]) => ({
  featureType,
  elementType,
  stylers,
});

const build = (dark: boolean) => {
  const c = dark
    ? {
        land: '#141d18',
        built: '#18221c',
        park: '#183022',
        water: '#0d2629',
        local: '#1f2b24',
        artery: '#27362d',
        hwy: '#33473b',
        text: '#86998e',
        road: '#6d8077',
        halo: '#141d18',
      }
    : {
        land: '#eef3ea',
        built: '#e8eee4',
        park: '#d3ebd5',
        water: '#c7e3e3',
        local: '#ffffff',
        artery: '#ffffff',
        hwy: '#f8eed2',
        text: '#5f7166',
        road: '#8a9a90',
        halo: '#ffffff',
      };
  return [
    rule('all', 'geometry', [{ color: c.land }]),
    rule('all', 'labels.text.fill', [{ color: c.text }]),
    rule('all', 'labels.text.stroke', [{ color: c.halo }, { weight: 3 }]),
    rule('all', 'labels.icon', [{ visibility: 'off' }]),
    rule('administrative', 'geometry.stroke', [{ visibility: 'off' }]),
    rule('administrative.land_parcel', 'all', [{ visibility: 'off' }]),
    rule('landscape.man_made', 'geometry', [{ color: c.built }]),
    rule('poi', 'all', [{ visibility: 'off' }]),
    rule('poi.park', 'geometry', [{ visibility: 'on' }, { color: c.park }]),
    rule('transit', 'all', [{ visibility: 'off' }]),
    rule('road', 'geometry.stroke', [{ visibility: 'off' }]),
    rule('road.local', 'geometry.fill', [{ color: c.local }]),
    rule('road.local', 'labels', [{ visibility: 'off' }]),
    rule('road.arterial', 'geometry.fill', [{ color: c.artery }]),
    rule('road.highway', 'geometry.fill', [{ color: c.hwy }]),
    rule('road', 'labels.text.fill', [{ color: c.road }]),
    rule('water', 'geometry', [{ color: c.water }]),
    rule('water', 'labels', [{ visibility: 'off' }]),
  ];
};
const STYLES = { light: build(false), dark: build(true) };

/** Google Maps JSON style (native `customMapStyle` and web `styles`). Same array each call, so maps don't restyle. */
export const mapStyle = (dark: boolean) => STYLES[dark ? 'dark' : 'light'];

/** Light and dark OpenStreetMap-based tiles with the same calm look, for the key-less web fallback. */
export const tileUrl = (dark: boolean) =>
  `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;

const FILL = { pickup: '#d98b1f', dropoff: '#12864b', done: '#8c9a92' } as const;
const GLYPH = {
  pickup:
    'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  dropoff: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  done: 'M20 6 9 17l-5-5',
} as const;

export interface MarkerArt {
  svg: string;
  w: number;
  h: number;
  /** Where the marker touches the map, in marker pixels. */
  ax: number;
  ay: number;
}

const glyph = (d: string, color: string, x: number, y: number, scale: number, width = 2.4) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g>`;

const cache = new Map<string, MarkerArt>();
const memo = (key: string, make: () => MarkerArt) => {
  let a = cache.get(key);
  if (!a) cache.set(key, (a = make()));
  return a;
};

/** The buyer's own address: a home inside a soft brand halo, so "you" never reads as just another stop. */
function homeArt(dark: boolean): MarkerArt {
  const ring = dark ? '#0a1410' : '#ffffff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#1fa463" opacity="0.16"/><circle cx="26" cy="26" r="16.5" fill="${ring}"/><circle cx="26" cy="26" r="13.5" fill="#12864b"/>${glyph(GLYPH.dropoff, '#ffffff', 19.4, 18.8, 0.56, 2.6)}</svg>`;
  return { svg, w: 52, h: 52, ax: 26, ay: 26 };
}

/** A teardrop pin: a leaf for a pickup, a tick for a visited stop, or the stop's number on a driver's route. */
export function placeArt(p: Pick<LivePlace, 'kind' | 'label'>, dark: boolean): MarkerArt {
  const num = /^(\d+)\./.exec(p.label)?.[1];
  if (p.kind === 'dropoff' && !num) return memo(`home${dark}`, () => homeArt(dark));
  return memo(`${p.kind}${num ?? ''}${dark}`, () => {
    const fill = FILL[p.kind];
    const inner =
      num && p.kind !== 'done'
        ? `<text x="20" y="23.4" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="12.5" fill="${fill}">${num}</text>`
        : glyph(GLYPH[p.kind], fill, 13.2, 11.7, 0.58);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><ellipse cx="20" cy="48.5" rx="7" ry="2.6" fill="#000" opacity="${dark ? 0.5 : 0.18}"/><path d="M20 2C10.6 2 3 9.4 3 18.6 3 31 20 46 20 46s17-15 17-27.4C37 9.4 29.4 2 20 2z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="18.6" r="11" fill="#fff"/>${inner}</svg>`;
    return { svg, w: 40, h: 52, ax: 20, ay: 47 };
  });
}

/**
 * The truck: a side-on refrigerated truck (cold box with a snowflake, darker cab) on a raised tile that points at
 * its spot, with the driver's initial as a small avatar on the corner.
 */
export function truckArt(name: string | undefined, dark: boolean): MarkerArt {
  const initial = (name?.trim().charAt(0) ?? '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return memo(`truck${initial}${dark}`, () => {
    const tile = dark ? '#0f1a14' : '#ffffff';
    const edge = dark ? '#2b3c32' : '#d7e6dc';
    const box = dark ? '#34d17b' : '#1fa463';
    const cab = dark ? '#16a34a' : '#0b6b3a';
    const flake =
      'M16 6.2v9.6M11.8 8.6l8.4 4.8M11.8 13.4l8.4-4.8M14.6 6.9l1.4 1.2 1.4-1.2M14.6 15.1l1.4-1.2 1.4 1.2';
    const truck = `<g transform="translate(9 12)">
<rect x="1" y="1" width="28" height="19" rx="3.5" fill="${box}"/>
<path d="${flake}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M30.5 6.5h7.2a3 3 0 0 1 2.4 1.2l3.5 4.7a3 3 0 0 1 .6 1.8V20H30.5z" fill="${cab}"/>
<path d="M33 9h4.6l2.9 4.2H33z" fill="#d5f2e1"/>
<rect x="1" y="19" width="43.4" height="3.2" rx="1.6" fill="${dark ? '#06150e' : '#0a3d24'}"/>
<circle cx="10.5" cy="23" r="4.4" fill="#14201a"/><circle cx="10.5" cy="23" r="1.7" fill="#e4e9e6"/>
<circle cx="35.5" cy="23" r="4.4" fill="#14201a"/><circle cx="35.5" cy="23" r="1.7" fill="#e4e9e6"/>
</g>`;
    const avatar = initial
      ? `<circle cx="62" cy="10" r="9.5" fill="#12864b" stroke="${tile}" stroke-width="2.5"/><text x="62" y="14.2" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="11.5" fill="#fff">${initial}</text>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="74" height="62" viewBox="0 0 74 62"><ellipse cx="33" cy="58.5" rx="9" ry="2.6" fill="#000" opacity="${dark ? 0.5 : 0.18}"/><path d="M15 4h36a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H39.5L33 54l-6.5-8H15A10 10 0 0 1 5 36V14A10 10 0 0 1 15 4z" fill="${tile}" stroke="${edge}" stroke-width="1.5"/>${truck}${avatar}</svg>`;
    return { svg, w: 74, h: 62, ax: 33, ay: 54 };
  });
}

export const artUrl = (a: MarkerArt) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(a.svg)}`;

/** A short string that changes only when a line's shape does, so maps can skip redrawing identical routes. */
export const lineKey = (p: LatLng[]) =>
  p.length
    ? `${p.length}:${p[0].lat},${p[0].lng}:${p[p.length - 1].lat},${p[p.length - 1].lng}`
    : '0';
