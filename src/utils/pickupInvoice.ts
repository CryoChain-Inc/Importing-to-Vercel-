import type { Pickup } from '../services/farmer.service';
import { fmtQty, ghs } from './format';

export interface InvoiceParty {
  name: string;
  phone: string;
}

/** Pickups that have produce collected are the ones with something to invoice. */
export const canInvoice = (p: Pickup) =>
  p.collected > 0 && (p.state === 'collected' || p.state === 'delivered' || p.state === 'paid');

/** Short, stable number a farmer can quote: derived from the pickup id. */
export const invoiceNumber = (p: Pickup) =>
  `CC-${p.id
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase()}`;

export const invoiceFileName = (p: Pickup) =>
  `CryoChain-Invoice-${invoiceNumber(p)}-${(p.collectedAt ?? p.reservedAt).slice(0, 10)}.pdf`;

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' });

/** A4 invoice for one pickup, as a self-contained HTML page for expo-print. The buyer is never named. */
export function invoiceHtml(p: Pickup, farmer: InvoiceParty): string {
  const paid = p.earning > 0 && p.paid >= p.earning;
  const basis = p.collected > 0 ? p.collected : p.expected;
  const rate = basis > 0 ? p.earning / basis : 0;
  const issued = date(p.collectedAt ?? p.reservedAt);
  const truck = p.driver ? [p.driver.plate, p.driver.vehicle].filter(Boolean).join(' · ') : '';

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
  .short { color: #8a4b00; font-weight: 700 }
  .total { margin: 22px 0 0 auto; width: 260px }
  .total div { display: flex; justify-content: space-between; padding: 6px 0 }
  .total .due { border-top: 2px solid #14201a; margin-top: 6px; padding-top: 12px; font-size: 17px; font-weight: 800 }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 6px; font-weight: 800; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    ${paid ? 'color:#0b6b3a;background:#e4f5ea' : 'color:#8a4b00;background:#fbefd9'} }
  .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid #dfe5e1; color: #56615b; font-size: 10.5px }
</style></head><body>
  <div class="top">
    <div class="brand">CryoChain<small>Fresh produce, collected from your farm</small></div>
    <div class="title"><h1>Pickup invoice</h1><p>${invoiceNumber(p)} · ${issued}</p></div>
  </div>
  <div class="meta">
    <div><div class="label">Supplier</div><div class="strong">${esc(farmer.name || 'Farmer')}</div>${farmer.phone ? esc(farmer.phone) : ''}</div>
    <div><div class="label">Billed to</div><div class="strong">CryoChain</div>Produce purchase</div>
    <div><div class="label">Collected by</div><div class="strong">${esc(p.driver?.name || 'CryoChain driver')}</div>${esc(truck)}</div>
  </div>
  <table>
    <tr><th>Produce</th><th>Reserved</th><th>Collected</th><th>Short</th><th>Rate</th><th>Amount</th></tr>
    <tr>
      <td><b>${esc(p.product)}</b></td>
      <td>${fmtQty(p.expected, p.unit)}</td>
      <td>${fmtQty(p.collected, p.unit)}</td>
      <td class="${p.short > 0 ? 'short' : ''}">${p.short > 0 ? fmtQty(p.short, p.unit) : '—'}</td>
      <td>${ghs(rate)} / ${esc(p.unit)}</td>
      <td><b>${ghs(p.earning)}</b></td>
    </tr>
  </table>
  <div class="total">
    <div><span>Subtotal</span><span>${ghs(p.earning)}</span></div>
    <div><span>Paid to wallet</span><span>${ghs(Math.min(p.paid, p.earning))}</span></div>
    <div class="due"><span>${paid ? 'Balance' : 'Amount due'}</span><span>${ghs(Math.max(0, p.earning - p.paid))}</span></div>
    <div style="justify-content:flex-end"><span class="stamp">${paid ? 'Paid' : 'Payment due'}</span></div>
  </div>
  <div class="foot">Amounts are for the quantity the driver collected and weighed${p.collectedAt ? ` on ${date(p.collectedAt)}` : ''}. Questions about this invoice? Contact CryoChain support with the number ${invoiceNumber(p)}.</div>
</body></html>`;
}
