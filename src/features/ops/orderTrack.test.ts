import { orderTrack, TRACK_STEPS } from './orderTrack';
import type { BoardOrder } from '../../services/ops.fulfilment.service';

const base = (): BoardOrder => ({
  id: 'o1',
  code: 'ORD-1',
  buyer: 'Buyer',
  amount: 100,
  state: 'paid',
  createdAt: '2026-11-01T10:00:00Z',
  address: 'Accra',
  items: ['Tomato A · 10 kg'],
  itemKg: 10,
  allocations: [],
  stops: [],
  driver: null,
});

describe('orderTrack', () => {
  it('starts at ordered while payment is outstanding', () => {
    const t = orderTrack({ ...base(), state: 'awaiting_payment' });
    expect(t.key).toBe('placed');
    expect(t.index).toBe(0);
  });

  it('is paid when nothing is allocated yet', () => {
    expect(orderTrack(base()).key).toBe('paid');
  });

  it('waits on farmers after an offer', () => {
    const t = orderTrack({
      ...base(),
      allocations: [{ id: 'a', product: 'Tomato', grade: 'A', farmer: 'Ama', kg: 10, amount: 40, status: 'offered', expiresAt: '', kmToBuyer: 3, farmerPhotos: [], capturePhoto: null, takenKg: null, takenGrade: null, temperatureC: null, driverMediaUrl: null, driverMediaKind: null }],
    });
    expect(t.key).toBe('farmers');
    expect(t.allocatedKg).toBe(10);
  });

  it('is collecting once a farm stop is done, then to the buyer, then delivered', () => {
    const pickup = { id: 'p', kind: 'pickup' as const, label: 'Farm', seq: 1, state: 'done' as const, doneAt: 'x', driver: 'Kwame', lat: 1, lng: 1, allocationId: 'a', takenKg: 9.5, takenGrade: 'A', temperatureC: 4, mediaUrl: null, mediaKind: null as 'photo' | 'video' | null };
    const drop = { id: 'd', kind: 'dropoff' as const, label: 'Buyer', seq: 2, state: 'pending' as const, doneAt: null, driver: 'Kwame', lat: 2, lng: 2, allocationId: null, takenKg: null, takenGrade: null, temperatureC: null, mediaUrl: null, mediaKind: null as 'photo' | 'video' | null };
    const collecting = orderTrack({ ...base(), stops: [pickup, drop], allocations: [{ id: 'a', product: 'Tomato', grade: 'A', farmer: 'Ama', kg: 10, amount: 40, status: 'collected', expiresAt: '', kmToBuyer: 3, farmerPhotos: [], capturePhoto: null, takenKg: 9.5, takenGrade: 'A', temperatureC: 4, driverMediaUrl: null, driverMediaKind: null }] });
    expect(collecting.key).toBe('to_buyer');
    expect(collecting.collectedKg).toBe(9.5);
    expect(collecting.next?.kind).toBe('dropoff');

    const delivered = orderTrack({ ...base(), stops: [{ ...pickup }, { ...drop, state: 'done', doneAt: 'y' }] });
    expect(delivered.key).toBe('delivered');
    expect(delivered.index).toBe(TRACK_STEPS.length - 1);
  });
});
