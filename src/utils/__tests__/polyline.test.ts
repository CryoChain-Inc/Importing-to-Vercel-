import { decodePolyline } from '../polyline';

test('decodes Google\'s documented example polyline', () => {
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
});

test('an empty line has no points', () => {
  expect(decodePolyline('')).toEqual([]);
});
