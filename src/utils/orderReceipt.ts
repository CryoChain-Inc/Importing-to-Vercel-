import type { Order } from '../services/buyer.service';
import { fmtQty, ghs } from './format';

/** Only orders that were paid have a receipt; cancelled and unpaid ones never took money. */
export const canReceipt = (o: Order) => o.state === 'paid';

export const receiptFileName = (o: Order) =>
  `CryoChain-Receipt-${o.code}-${(o.paidAt ?? o.createdAt).slice(0, 10)}.pdf`;

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** A4 receipt for one paid order, as a self-contained HTML page for expo-print. */
export function receiptHtml(o: Order): string {
  const refunded = o.refunds.reduce((n, r) => n + r.amount, 0);
  const delivered = o.progress.deliveredAt;
  const rows = o.items
    .map(
      (i) => `<tr>
      <td><b>${esc(i.name)}</b></td>
      <td>${fmtQty(i.kg, i.unit)}</td>
      <td>${ghs(i.lineTotal / (i.kg || 1))} / ${esc(i.unit)}</td>
      <td><b>${ghs(i.lineTotal)}</b></td></tr>`,
    )
    .join('');
  const refundRows = o.refunds
    .map(
      (r) =>
        `<div class="refund"><span>Refund for produce we could not supply · ${r.refunded ? 'returned' : 'being processed'}</span><span>− ${ghs(r.amount)}</span></div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; padding: 48px 52px; font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #14201a; font-size: 12px; line-height: 1.5 }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0b6b3a; padding-bottom: 22px }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #0b6b3a }
  .brand small { display: block; font-size: 11px; font-weight: 500; letter-spacing: 0; color: #56615b; margin-top: 2px }
  .title { text-align: right }
  .title h1 { margin: 0; font-size: 26px; letter-spacing: -0.5px }
  .title p { margin: 4px 0 0; color: #56615b }
  .meta { display: flex; gap: 40px; margin: 28px 0 }
  .meta div { flex: 1 }
  .label { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #56615b; margin-bottom: 4px }
  .strong { font-size: 14px; font-weight: 700 }
  table { width: 100%; border-collapse: collapse; margin-top: 4px }
  th { text-align: right; font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; color: #56615b; padding: 10px 8px; background: #ebf0ec }
  th:first-child, td:first-child { text-align: left }
  td { text-align: right; padding: 14px 8px; border-bottom: 1px solid #dfe5e1; font-variant-numeric: tabular-nums }
  .total { margin: 22px 0 0 auto; width: 300px }
  .total div { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0 }
  .total .refund { color: #8a4b00 }
  .total .due { border-top: 2px solid #14201a; margin-top: 6px; padding-top: 12px; font-size: 17px; font-weight: 800 }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 6px; font-weight: 800; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #0b6b3a; background: #e4f5ea }
  .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid #dfe5e1; color: #56615b; font-size: 10.5px }
</style></head><body>
  <div class="top">
    <div class="brand">CryoChain<small>Fresh produce, collected from your farm</small></div>
    <div class="title"><h1>Receipt</h1><p>${esc(o.code)} · ${date(o.paidAt ?? o.createdAt)}</p></div>
  </div>
  <div class="meta">
    <div><div class="label">Order</div><div class="strong">${esc(o.code)}</div>Placed ${dateTime(o.createdAt)}</div>
    <div><div class="label">Payment</div><div class="strong">Paid</div>${o.paidAt ? dateTime(o.paidAt) : ''}</div>
    <div><div class="label">Delivery</div><div class="strong">${delivered ? 'Delivered' : 'In progress'}</div>${delivered ? dateTime(delivered) : ''}</div>
  </div>
  ${o.deliveryAddress ? `<div class="label">Delivered to</div><div style="margin-bottom:22px">${esc(o.deliveryAddress)}</div>` : ''}
  <table>
    <tr><th>Produce</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr>
    ${rows}
  </table>
  <div class="total">
    <div><span>Subtotal</span><span>${ghs(o.amount)}</span></div>
    ${refundRows}
    <div class="due"><span>${refunded > 0 ? 'Net paid' : 'Total paid'}</span><span>${ghs(Math.max(0, o.amount - refunded))}</span></div>
    <div style="justify-content:flex-end"><span class="stamp">Paid</span></div>
  </div>
  <div class="foot">Thank you for buying with CryoChain. Questions about this order? Contact CryoChain support and quote ${esc(o.code)}.</div>
</body></html>`;
}
