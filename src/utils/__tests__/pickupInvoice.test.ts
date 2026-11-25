import type { Pickup } from '../../services/farmer.service';
import { canInvoice, invoiceFileName, invoiceHtml, invoiceNumber } from '../pickupInvoice';

const pickup: Pickup = {
  id: 'ab12cd34-0000',
  product: 'Tomatoes <b>',
  unit: 'crate',
  expected: 10,
  collected: 8,
  short: 2,
  earning: 400,
  paid: 400,
  state: 'paid',
  eta: null,
  collectedAt: '2026-11-10T09:00:00Z',
  reservedAt: '2026-11-08T09:00:00Z',
  driver: { name: 'Kojo', phone: '0240000000', plate: 'GR 123-26', vehicle: 'Van' },
};

test('invoice shows the collected amount, rate and paid status, and escapes text', () => {
  const html = invoiceHtml(pickup, { name: 'Ama', phone: '024' });
  expect(invoiceNumber(pickup)).toBe('CC-AB12CD34');
  expect(invoiceFileName(pickup)).toBe('CryoChain-Invoice-CC-AB12CD34-2026-11-10.pdf');
  expect(html).toContain('GH₵50.00 / crate');
  expect(html).toContain('Paid');
  expect(html).toContain('Tomatoes &lt;b&gt;');
});

test('only pickups with collected produce can be invoiced', () => {
  expect(canInvoice(pickup)).toBe(true);
  expect(canInvoice({ ...pickup, state: 'waiting', collected: 0 })).toBe(false);
  expect(canInvoice({ ...pickup, state: 'not_supplied', collected: 0 })).toBe(false);
});
