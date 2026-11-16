import type { DeliveryOrder, PickupStop } from '../../services/driver.deliveries.service';
import { buildStops, stopAfter, totalText } from './stops';

const pickup = (id: string, farmerId: string, seq: number, product = 'Tomato'): PickupStop => ({
  stopId: id,
  farmerId,
  eta: null,
  farmerName: `Farm ${farmerId}`,
  farmerPhone: '',
  place: 'Ho',
  product,
  expectedKg: 10,
  expectedUnit: 'kg',
  lat: 6,
  lng: 0.4,
  state: 'pending',
  seq,
  recordedKg: null,
  temperatureC: null,
  note: '',
  mediaPath: null,
  mediaKind: null,
  mediaUrl: null,
});

const order = (id: string, pickups: PickupStop[], dropSeq: number): DeliveryOrder => ({
  id,
  code: id.toUpperCase(),
  ongoing: true,
  buyerName: 'Ama Mensah',
  buyerPhone: '0200000006',
  address: '12 Spintex Rd',
  lat: 5.6,
  lng: -0.1,
  pickups,
  dropoff: {
    stopId: `d-${id}`,
    eta: null,
    lat: 5.6,
    lng: -0.1,
    state: 'pending',
    seq: dropSeq,
    temperatureC: null,
    note: '',
    mediaPath: null,
    mediaKind: null,
    mediaUrl: null,
  },
});

describe('buildStops', () => {
  const orders = [
    order('a1', [pickup('p1', 'f1', 1), pickup('p2', 'f2', 2)], 4),
    order('a2', [pickup('p3', 'f1', 1, 'Pepper')], 5),
  ];

  it('groups lines at the same farmer and the same buyer into one stop each', () => {
    const { todo } = buildStops(orders);
    expect(todo.map((s) => [s.kind, s.lines.length])).toEqual([
      ['pickup', 2],
      ['pickup', 1],
      ['dropoff', 2],
    ]);
  });

  it('marks a drop-off as waiting while its orders still have farm pickups', () => {
    expect(buildStops(orders).todo[2].waiting).toBe(2);
  });

  it('moves a stop to done once every line is done, and finds the stop after it', () => {
    orders[0].pickups[0].state = 'done';
    orders[1].pickups[0].state = 'done';
    const { todo, done } = buildStops(orders);
    expect(done.map((s) => s.name)).toEqual(['Farm f1']);
    expect(stopAfter(todo, todo[0].key)?.kind).toBe('dropoff');
  });
});

describe('totalText', () => {
  it('adds per unit', () => {
    expect(
      totalText([
        { qty: 10, unit: 'kg' },
        { qty: 2.6, unit: 'kg' },
        { qty: 3, unit: 'crate' },
      ]),
    ).toBe('12.6 kg + 3 crate');
  });
});
