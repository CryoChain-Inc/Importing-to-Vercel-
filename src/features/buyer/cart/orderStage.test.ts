import { orderStage } from '../../../services/buyer.service';

const none = { pickupsTotal: 0, pickupsDone: 0, deliveredAt: null };

describe('orderStage', () => {
  it('waits on payment until paid', () => {
    expect(orderStage({ state: 'awaiting_payment', progress: none })).toBe('placed');
  });
  it('is preparing once paid with no pickups yet', () => {
    expect(orderStage({ state: 'paid', progress: none })).toBe('preparing');
  });
  it('is on the way after the first farm pickup', () => {
    expect(orderStage({ state: 'paid', progress: { pickupsTotal: 3, pickupsDone: 1, deliveredAt: null } })).toBe('on_the_way');
  });
  it('is delivered once the drop-off is done, and cancelled wins over progress', () => {
    const delivered = { pickupsTotal: 2, pickupsDone: 2, deliveredAt: '2026-10-27T10:00:00Z' };
    expect(orderStage({ state: 'paid', progress: delivered })).toBe('delivered');
    expect(orderStage({ state: 'cancelled', progress: delivered })).toBe('cancelled');
  });
});
