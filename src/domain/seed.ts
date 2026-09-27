import type { Config, Consignment, Order, OrderLine, State } from './types';
import { addDays, isoDay, orderLinesTotal, round2 } from './logic';

const H = 3600_000;
export function buildSeed(now = Date.now()): State {
  const today = isoDay(now);
  const t = (dayOffset: number, hh: number, mm = 0) => { const d = new Date(addDays(today, dayOffset) + 'T00:00:00'); d.setHours(hh, mm, 0, 0); return d.getTime(); };
  const categories = [{ id: 'fruit', name: 'Fruit' }, { id: 'vegetables', name: 'Vegetables' }, { id: 'meat', name: 'Meat' }, { id: 'fish', name: 'Fish' }, { id: 'dairy', name: 'Dairy' }];
  const products = [
    { id: 'tomato', categoryId: 'vegetables', name: 'Tomato', grades: [{ grade: 'A', pricePerKg: 8.5 }, { grade: 'B', pricePerKg: 7.2 }, { grade: 'C', pricePerKg: 5.9 }], minKg: 50, available: true, photo: 'tomato' },
    { id: 'onion', categoryId: 'vegetables', name: 'Onion, red', grades: [{ grade: 'A', pricePerKg: 6.2 }, { grade: 'B', pricePerKg: 5.4 }], minKg: 100, available: true, photo: 'onion' },
    { id: 'pepper', categoryId: 'vegetables', name: 'Pepper, green', grades: [{ grade: 'A', pricePerKg: 9.4 }, { grade: 'B', pricePerKg: 8.1 }], minKg: 30, available: true, photo: 'pepper' },
    { id: 'cabbage', categoryId: 'vegetables', name: 'Cabbage', grades: [{ grade: 'A', pricePerKg: 5.1 }, { grade: 'B', pricePerKg: 4.3 }], minKg: 50, available: true, photo: 'cabbage' },
    { id: 'carrot', categoryId: 'vegetables', name: 'Carrot', grades: [{ grade: 'A', pricePerKg: 6.8 }], minKg: 50, available: false, photo: 'carrot' },
    { id: 'pineapple', categoryId: 'fruit', name: 'Pineapple', grades: [{ grade: 'A', pricePerKg: 4.2 }, { grade: 'B', pricePerKg: 3.6 }], minKg: 50, available: true, photo: 'pineapple' },
    { id: 'mango', categoryId: 'fruit', name: 'Mango', grades: [{ grade: 'A', pricePerKg: 7.8 }, { grade: 'B', pricePerKg: 6.5 }], minKg: 50, available: true, photo: 'mango' },
    { id: 'tilapia', categoryId: 'fish', name: 'Tilapia, whole', grades: [{ grade: 'A', pricePerKg: 38 }], minKg: 50, available: true, photo: 'tilapia' },
    { id: 'chicken', categoryId: 'meat', name: 'Chicken, whole', grades: [{ grade: 'A', pricePerKg: 42 }], minKg: 30, available: true, photo: 'chicken' },
    { id: 'milk', categoryId: 'dairy', name: 'Fresh milk', grades: [{ grade: 'A', pricePerKg: 12 }], minKg: 20, available: true, photo: 'milk' },
  ];
  const farmGatePrice: Record<string, number> = { tomato: 4.5, onion: 3.2, pepper: 5, cabbage: 2.6, pineapple: 2.1, mango: 4, tilapia: 24, chicken: 28, milk: 7 };
  const orgs = [
    { id: 'O1', name: 'Kempinski Gold Coast', type: 'Hotel', country: 'Ghana', address: 'Main kitchen, Gamel Abdul Nasser Ave, Accra', contact: 'Abena Darko, Procurement', status: 'approved' as const, submittedAt: t(-40, 10), virtualAccount: { bank: 'Stanbic Bank Ghana', number: '9040 0071 2419 6' } },
    { id: 'O2', name: 'Labadi Beach Hotel', type: 'Hotel', country: 'Ghana', address: 'No. 1 La Bypass, La, Accra · GA-152-9203', contact: 'Efua Boateng, Purchasing', status: 'pending' as const, submittedAt: t(-1, 10, 18) },
    { id: 'O3', name: 'Shoprite Accra Mall', type: 'Grocery chain', country: 'Ghana', address: 'Accra Mall, Spintex Rd', contact: 'Kojo Bonsu, Fresh', status: 'approved' as const, submittedAt: t(-30, 9), virtualAccount: { bank: 'Stanbic Bank Ghana', number: '9040 0071 2431 2' } },
    { id: 'O4', name: 'Newmont Ahafo camp', type: 'Mining camp', country: 'Ghana', address: 'Kenyasi camp kitchen', contact: 'Linda Mensah, Catering', status: 'approved' as const, submittedAt: t(-22, 9), virtualAccount: { bank: 'Stanbic Bank Ghana', number: '9040 0071 2440 8' } },
  ];
  const buyerUsers = [
    { id: 'U1', orgId: 'O1', name: 'Abena Darko', phone: '+233 24 555 0101', roles: ['admin', 'approver'] as const, limit: 25000, status: 'active' as const },
    { id: 'U2', orgId: 'O1', name: 'Kwame Asante', phone: '+233 24 555 0102', roles: ['approver'] as const, limit: 10000, status: 'active' as const },
    { id: 'U3', orgId: 'O1', name: 'Efua Boateng', phone: '+233 24 555 0192', roles: ['requester'] as const, status: 'active' as const },
    { id: 'U4', orgId: 'O1', name: 'Yaw Ofori', phone: '+233 24 555 0104', roles: ['viewer'] as const, status: 'invited' as const },
    { id: 'U5', orgId: 'O1', name: 'Nana Adjei', phone: '+233 24 555 0105', roles: ['requester'] as const, status: 'deactivated' as const },
    { id: 'U6', orgId: 'O3', name: 'Kojo Bonsu', phone: '+233 20 555 0301', roles: ['admin', 'approver'] as const, limit: 50000, status: 'active' as const },
  ].map(u => ({ ...u, roles: [...u.roles] }));
  const farmers = [
    { id: 'F1', code: 'FM-0101', name: 'Akua Boateng', phone: '+233 24 400 9999', momo: '0244009999', network: 'MTN' as const, tier: 'medium' as const, kyc: 'verified_manual' as const, village: 'Adeiso', consentAt: t(-60, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F2', code: 'FM-0102', name: 'Kwesi Appiah', phone: '+233 24 410 2211', momo: '0244102211', network: 'MTN' as const, tier: 'enhanced' as const, kyc: 'verified_manual' as const, village: 'Asamankese', consentAt: t(-58, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F3', code: 'FM-0103', name: 'Efua Darko', momo: '0207713344', network: 'Telecel' as const, tier: 'medium' as const, kyc: 'unverified' as const, village: 'Mampong-Akuapem', consentAt: t(-50, 9), registeredBy: 'Kojo Antwi' },
    { id: 'F4', code: 'FM-0104', name: 'Kofi Adu', phone: '+233 24 331 8080', momo: '0243318080', network: 'MTN' as const, tier: 'minimum' as const, kyc: 'unverified' as const, village: 'Nsawam', consentAt: t(-45, 9), registeredBy: 'Kojo Antwi' },
    { id: 'F5', code: 'FM-0105', name: 'Ama Gyamfi', phone: '+233 55 210 4433', momo: '0552104433', network: 'MTN' as const, tier: 'medium' as const, kyc: 'verified_manual' as const, village: 'Adoagyiri', consentAt: t(-44, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F6', code: 'FM-0106', name: 'Esi Quaye', momo: '0267001234', network: 'AirtelTigo' as const, tier: 'minimum' as const, kyc: 'unverified' as const, village: 'Pokrom', consentAt: t(-40, 9), registeredBy: 'Kojo Antwi', walletBad: true },
    { id: 'F7', code: 'FM-0107', name: 'Kwame Owusu', phone: '+233 24 998 1122', momo: '0249981122', network: 'MTN' as const, tier: 'medium' as const, kyc: 'verified_manual' as const, village: 'Fotobi', consentAt: t(-38, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F8', code: 'FM-0108', name: 'Abena Owusu', momo: '0244550001', network: 'MTN' as const, tier: 'medium' as const, kyc: 'unverified' as const, village: 'Aburi', consentAt: t(-30, 9), registeredBy: 'Kojo Antwi' },
    { id: 'F9', code: 'FM-0109', name: 'Kwabena Asare', phone: '+233 24 610 7788', momo: '0246107788', network: 'MTN' as const, tier: 'medium' as const, kyc: 'verified_manual' as const, village: 'Dobro', consentAt: t(-28, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F10', code: 'FM-0110', name: 'Adjoa Mensima', momo: '0208812345', network: 'Telecel' as const, tier: 'enhanced' as const, kyc: 'verified_manual' as const, village: 'Akropong', consentAt: t(-25, 9), registeredBy: 'Kojo Antwi', momoVerified: true },
    { id: 'F11', code: 'FM-0111', name: 'Nana Yaa Serwaa', momo: '0243300777', network: 'MTN' as const, tier: 'unknown' as const, kyc: 'unverified' as const, village: 'Larteh', consentAt: t(-10, 9), registeredBy: 'Kojo Antwi' },
  ];
  const availability = [
    { id: 'AV1', farmerId: 'F8', productId: 'tomato', expectedKg: 120, readyFrom: today, readyUntil: addDays(today, 3), source: 'agent' as const },
    { id: 'AV2', farmerId: 'F11', productId: 'tomato', expectedKg: 180, readyFrom: today, readyUntil: addDays(today, 4), source: 'agent' as const },
    { id: 'AV3', farmerId: 'F5', productId: 'mango', expectedKg: 250, readyFrom: today, readyUntil: addDays(today, 5), source: 'agent' as const },
    { id: 'AV4', farmerId: 'F6', productId: 'mango', expectedKg: 350, readyFrom: today, readyUntil: addDays(today, 5), source: 'agent' as const },
    { id: 'AV5', farmerId: 'F10', productId: 'mango', expectedKg: 200, readyFrom: addDays(today, 1), readyUntil: addDays(today, 6), source: 'agent' as const },
    { id: 'AV6', farmerId: 'F2', productId: 'onion', expectedKg: 400, readyFrom: today, readyUntil: addDays(today, 7), source: 'agent' as const },
  ];
  const L = (id: string, productId: string, grade: string, qtyKg: number, extra: Partial<OrderLine> = {}): OrderLine => { const p = products.find(x => x.id === productId)!; const unitPrice = p.grades.find(g => g.grade === grade)!.pricePerKg; return { id, productId, name: p.name, grade, qtyKg, unitPrice, total: round2(qtyKg * unitPrice), ...extra }; };
  const mkOrder = (o: Omit<Order, 'linesTotal' | 'total' | 'allocationVersion'> & { allocationVersion?: number }): Order => { const linesTotal = orderLinesTotal(o.lines); return { ...o, linesTotal, total: round2(linesTotal - o.creditApplied), allocationVersion: o.allocationVersion ?? 0 }; };
  const orders: Order[] = [
    mkOrder({ id: 'CC-2388', orgId: 'O1', requestedBy: 'U3', approvedBy: 'U1', deliveryDate: addDays(today, -6), address: 'Main kitchen', status: 'closed', lines: [L('CC-2388-1', 'tomato', 'A', 300, { deliveredKg: 300 }), L('CC-2388-2', 'onion', 'A', 200, { deliveredKg: 172.3, rejectedKg: 27.7, rejectReason: 'bruised', credit: 172 }), L('CC-2388-3', 'pineapple', 'A', 150, { deliveredKg: 150 })], creditApplied: 0, payment: { method: 'bank_transfer', status: 'confirmed', ref: 'STB-76010', amount: 4420, at: t(-9, 15, 2) }, submittedAt: t(-9, 9), approvedAt: t(-9, 11), paidAt: t(-9, 15, 2), deliveredAt: t(-6, 7, 35), acceptedAt: t(-6, 9), allocationVersion: 1, runId: 'RUN-1001', receiver: 'Yaw Ofori, receiving', handoverTemp: 4.3 }),
    mkOrder({ id: 'CC-2391', orgId: 'O1', requestedBy: 'U3', approvedBy: 'U1', deliveryDate: addDays(today, 3), address: 'Main kitchen', status: 'awaiting_payment', lines: [L('CC-2391-1', 'tilapia', 'A', 100), L('CC-2391-2', 'chicken', 'A', 50), L('CC-2391-3', 'mango', 'A', 200), L('CC-2391-4', 'milk', 'A', 70)], creditApplied: 0, payment: { method: 'bank_transfer', status: 'awaiting', ref: 'CC-2391', amount: 8300 }, submittedAt: t(-1, 9, 30), approvedAt: t(-1, 10), expiresAt: now + 9 * H }),
    mkOrder({ id: 'CC-2396', orgId: 'O1', requestedBy: 'U3', approvedBy: 'U2', deliveryDate: today, address: 'Main kitchen', status: 'in_collection', lines: [L('CC-2396-1', 'pepper', 'A', 200), L('CC-2396-2', 'cabbage', 'A', 240)], creditApplied: 0, payment: { method: 'momo', status: 'confirmed', ref: 'MTN-88120', amount: 3104, at: t(-2, 9, 47) }, submittedAt: t(-2, 8), approvedAt: t(-2, 9), paidAt: t(-2, 9, 47), allocationVersion: 1, runId: 'RUN-1008' }),
    mkOrder({ id: 'CC-2402', orgId: 'O1', requestedBy: 'U3', approvedBy: 'U1', deliveryDate: addDays(today, -1), address: 'Main kitchen', status: 'delivered', lines: [L('CC-2402-1', 'tomato', 'A', 300, { deliveredKg: 298.5 }), L('CC-2402-2', 'onion', 'A', 200, { deliveredKg: 200 }), L('CC-2402-3', 'pineapple', 'A', 150, { deliveredKg: 150, rejectedKg: 40, rejectReason: 'bruised on arrival', credit: 168 })], creditApplied: 0, payment: { method: 'bank_transfer', status: 'confirmed', ref: 'STB-77120', amount: 4420, at: t(-4, 15, 2) }, submittedAt: t(-4, 9), approvedAt: t(-4, 11), paidAt: t(-4, 15, 2), deliveredAt: now - (5 * H + 48 * 60000), allocationVersion: 1, runId: 'RUN-1005', receiver: 'Yaw Ofori, receiving', handoverTemp: 4.1 }),
    mkOrder({ id: 'CC-2410', orgId: 'O1', requestedBy: 'U3', approvedBy: 'U1', deliveryDate: today, address: 'Main kitchen', status: 'in_collection', lines: [L('CC-2410-1', 'tomato', 'A', 2000)], creditApplied: 0, payment: { method: 'bank_transfer', status: 'confirmed', ref: 'STB-77201', amount: 17000, at: t(-3, 14, 10) }, submittedAt: t(-3, 8), approvedAt: t(-3, 10), paidAt: t(-3, 14, 10), allocationVersion: 1, runId: 'RUN-1008' }),
    mkOrder({ id: 'CC-2419', orgId: 'O1', requestedBy: 'U3', deliveryDate: addDays(today, 2), address: 'Main kitchen', status: 'submitted', lines: [L('CC-2419-1', 'tomato', 'A', 300), L('CC-2419-2', 'onion', 'A', 200), L('CC-2419-3', 'pineapple', 'A', 150), L('CC-2419-4', 'tilapia', 'A', 200), L('CC-2419-5', 'milk', 'A', 65)], creditApplied: 320, submittedAt: t(0, 9, 12), expiresAt: now + 48 * H }),
    mkOrder({ id: 'CC-2420', orgId: 'O3', requestedBy: 'U6', approvedBy: 'U6', deliveryDate: addDays(today, 2), address: 'Accra Mall fresh dock', status: 'paid', lines: [L('CC-2420-1', 'mango', 'A', 300)], creditApplied: 0, payment: { method: 'bank_transfer', status: 'confirmed', ref: 'STB-77230', amount: 2340, at: t(0, 8, 5) }, submittedAt: t(-1, 16), approvedAt: t(-1, 16, 20), paidAt: t(0, 8, 5) }),
  ];
  const C = (id: string, orderId: string, lineId: string, farmerId: string, productId: string, plannedKg: number, extra: Partial<Consignment> = {}): Consignment => ({ id, orderId, lineId, farmerId, productId, productName: products.find(p => p.id === productId)!.name, plannedKg, pricePerKg: farmGatePrice[productId], photos: [], status: 'planned', version: 1, ...extra });
  const consignments: Consignment[] = [
    // CC-2388, closed and paid
    C('CS-3001', 'CC-2388', 'CC-2388-1', 'F1', 'tomato', 300, { farmGateKg: 300, grade: 'A', status: 'delivered', capturedAt: t(-6, 5, 40), coldBoxAt: t(-6, 5, 48), photos: ['crate', 'scale'], runId: 'RUN-1001', stopSeq: 1 }),
    C('CS-3002', 'CC-2388', 'CC-2388-2', 'F9', 'onion', 200, { farmGateKg: 200, grade: 'A', status: 'delivered', capturedAt: t(-6, 6, 10), coldBoxAt: t(-6, 6, 15), photos: ['crate', 'scale'], runId: 'RUN-1001', stopSeq: 2 }),
    C('CS-3003', 'CC-2388', 'CC-2388-3', 'F10', 'pineapple', 150, { farmGateKg: 150, grade: 'A', status: 'delivered', capturedAt: t(-6, 6, 40), coldBoxAt: t(-6, 6, 44), photos: ['crate', 'scale'], runId: 'RUN-1001', stopSeq: 3 }),
    // CC-2402, delivered yesterday, settlements payable
    C('CS-3011', 'CC-2402', 'CC-2402-1', 'F5', 'tomato', 300, { farmGateKg: 298.5, grade: 'A', status: 'delivered', capturedAt: t(-1, 5, 31), coldBoxAt: t(-1, 5, 36), photos: ['crate', 'scale'], runId: 'RUN-1005', stopSeq: 1 }),
    C('CS-3012', 'CC-2402', 'CC-2402-2', 'F6', 'onion', 200, { farmGateKg: 200, grade: 'A', status: 'delivered', capturedAt: t(-1, 6, 4), coldBoxAt: t(-1, 6, 9), photos: ['crate', 'scale'], runId: 'RUN-1005', stopSeq: 2 }),
    C('CS-3013', 'CC-2402', 'CC-2402-3', 'F7', 'pineapple', 150, { farmGateKg: 150, grade: 'A', status: 'delivered', capturedAt: t(-1, 6, 38), coldBoxAt: t(-1, 6, 41), photos: ['crate', 'scale'], runId: 'RUN-1005', stopSeq: 3 }),
    // CC-2396, in collection on today's run (stops 1 and 2 done)
    C('CS-3021', 'CC-2396', 'CC-2396-1', 'F9', 'pepper', 200, { farmGateKg: 201.5, grade: 'A', status: 'in_transit', capturedAt: t(0, 5, 22), coldBoxAt: t(0, 5, 27), photos: ['crate', 'scale'], runId: 'RUN-1008', stopSeq: 1 }),
    C('CS-3022', 'CC-2396', 'CC-2396-2', 'F10', 'cabbage', 240, { farmGateKg: 240, grade: 'A', status: 'in_transit', capturedAt: t(0, 5, 55), coldBoxAt: t(0, 5, 59), photos: ['crate', 'scale'], runId: 'RUN-1008', stopSeq: 2 }),
    // CC-2410, the reference order: 2,000 kg tomato across seven farmers, stops 3 to 9 today
    C('CS-3031', 'CC-2410', 'CC-2410-1', 'F4', 'tomato', 400, { runId: 'RUN-1008', stopSeq: 3 }),
    C('CS-3032', 'CC-2410', 'CC-2410-1', 'F1', 'tomato', 350, { runId: 'RUN-1008', stopSeq: 4 }),
    C('CS-3033', 'CC-2410', 'CC-2410-1', 'F2', 'tomato', 300, { runId: 'RUN-1008', stopSeq: 5 }),
    C('CS-3034', 'CC-2410', 'CC-2410-1', 'F3', 'tomato', 300, { runId: 'RUN-1008', stopSeq: 6 }),
    C('CS-3035', 'CC-2410', 'CC-2410-1', 'F5', 'tomato', 250, { runId: 'RUN-1008', stopSeq: 7 }),
    C('CS-3036', 'CC-2410', 'CC-2410-1', 'F6', 'tomato', 250, { runId: 'RUN-1008', stopSeq: 8 }),
    C('CS-3037', 'CC-2410', 'CC-2410-1', 'F7', 'tomato', 150, { runId: 'RUN-1008', stopSeq: 9 }),
  ];
  const fv = (id: string) => farmers.find(f => f.id === id)!.village;
  const runs = [
    { id: 'RUN-1001', date: addDays(today, -6), truck: 'GS 2140-26', driverId: 'Yaw Mensah', agentId: 'Kojo Antwi', status: 'closed' as const, tempMin: 2, tempMax: 6, stops: [
      { seq: 1, kind: 'farm' as const, farmerId: 'F1', label: fv('F1'), address: 'Adeiso farm gate', window: '05:30–06:00', arrivedAt: t(-6, 5, 32), collectedAt: t(-6, 5, 50), departedAt: t(-6, 5, 53) },
      { seq: 2, kind: 'farm' as const, farmerId: 'F9', label: fv('F9'), address: 'Dobro junction', window: '06:00–06:30', arrivedAt: t(-6, 6, 5), collectedAt: t(-6, 6, 16), departedAt: t(-6, 6, 18) },
      { seq: 3, kind: 'farm' as const, farmerId: 'F10', label: fv('F10'), address: 'Akropong market road', window: '06:30–07:00', arrivedAt: t(-6, 6, 36), collectedAt: t(-6, 6, 45), departedAt: t(-6, 6, 47) },
      { seq: 4, kind: 'delivery' as const, orderId: 'CC-2388', orderIds: ['CC-2388'], label: 'Kempinski Gold Coast', address: 'Main kitchen, Accra', window: '07:30–08:30', arrivedAt: t(-6, 7, 28), deliveredAt: t(-6, 7, 35) },
    ] },
    { id: 'RUN-1005', date: addDays(today, -1), truck: 'GS 2140-26', driverId: 'Yaw Mensah', agentId: 'Kojo Antwi', status: 'delivered' as const, tempMin: 2, tempMax: 6, stops: [
      { seq: 1, kind: 'farm' as const, farmerId: 'F5', label: 'Adoagyiri', address: 'Adoagyiri farm gate', window: '05:15–05:45', arrivedAt: t(-1, 5, 28), collectedAt: t(-1, 5, 37), departedAt: t(-1, 5, 40) },
      { seq: 2, kind: 'farm' as const, farmerId: 'F6', label: 'Pokrom', address: 'Pokrom school road', window: '05:45–06:15', arrivedAt: t(-1, 6, 0), collectedAt: t(-1, 6, 10), departedAt: t(-1, 6, 12) },
      { seq: 3, kind: 'farm' as const, farmerId: 'F7', label: 'Fotobi', address: 'Fotobi farm gate', window: '06:15–06:45', arrivedAt: t(-1, 6, 33), collectedAt: t(-1, 6, 42), departedAt: t(-1, 6, 49) },
      { seq: 4, kind: 'delivery' as const, orderId: 'CC-2402', orderIds: ['CC-2402'], label: 'Kempinski Gold Coast', address: 'Main kitchen, Accra', window: '07:15–08:00', arrivedAt: t(-1, 7, 31), deliveredAt: t(-1, 7, 40) },
    ] },
    { id: 'RUN-1008', date: today, truck: 'GS 2140-26', driverId: 'Yaw Mensah', agentId: 'Kojo Antwi', status: 'in_progress' as const, tempMin: 2, tempMax: 6, positionOn: true, stops: [
      { seq: 1, kind: 'farm' as const, farmerId: 'F9', label: 'Dobro', address: 'Dobro junction', window: '05:00–05:30', arrivedAt: t(0, 5, 12), collectedAt: t(0, 5, 28), departedAt: t(0, 5, 30) },
      { seq: 2, kind: 'farm' as const, farmerId: 'F10', label: 'Akropong', address: 'Akropong market road', window: '05:30–06:00', arrivedAt: t(0, 5, 48), collectedAt: t(0, 6, 0), departedAt: t(0, 6, 2) },
      { seq: 3, kind: 'farm' as const, farmerId: 'F4', label: 'Nsawam', address: 'Nsawam, Adoagyiri road', window: '06:00–06:30' },
      { seq: 4, kind: 'farm' as const, farmerId: 'F1', label: 'Adeiso', address: 'Adeiso farm gate', window: '06:30–07:00' },
      { seq: 5, kind: 'farm' as const, farmerId: 'F2', label: 'Asamankese', address: 'Asamankese lorry park', window: '07:00–07:30' },
      { seq: 6, kind: 'farm' as const, farmerId: 'F3', label: 'Mampong-Akuapem', address: 'Mampong farm gate', window: '07:30–08:00' },
      { seq: 7, kind: 'farm' as const, farmerId: 'F5', label: 'Adoagyiri', address: 'Adoagyiri farm gate', window: '08:00–08:30' },
      { seq: 8, kind: 'farm' as const, farmerId: 'F6', label: 'Pokrom', address: 'Pokrom school road', window: '08:30–09:00' },
      { seq: 9, kind: 'farm' as const, farmerId: 'F7', label: 'Fotobi', address: 'Fotobi farm gate', window: '09:00–09:30' },
      { seq: 10, kind: 'delivery' as const, orderId: 'CC-2410', orderIds: ['CC-2396', 'CC-2410'], label: 'Kempinski Gold Coast', address: 'Main kitchen, Accra', window: '11:00–12:00' },
    ] },
  ];
  const temps = [
    { id: 'TP-1', runId: 'RUN-1005', checkpoint: 'load' as const, label: 'Load · Nsawam node', valueC: 3.8, source: 'manual' as const, photo: true, at: t(-1, 4, 52), outOfRange: false },
    { id: 'TP-2', runId: 'RUN-1005', checkpoint: 'farm_stop' as const, stopSeq: 1, label: 'Stop 1 · Adoagyiri', valueC: 4.0, source: 'manual' as const, photo: true, at: t(-1, 5, 31), outOfRange: false },
    { id: 'TP-3', runId: 'RUN-1005', checkpoint: 'farm_stop' as const, stopSeq: 2, label: 'Stop 2 · Pokrom', valueC: 7.4, source: 'manual' as const, photo: true, at: t(-1, 6, 4), outOfRange: true, note: 'Door open 9 min at loading. Back in range by next checkpoint.' },
    { id: 'TP-4', runId: 'RUN-1005', checkpoint: 'farm_stop' as const, stopSeq: 3, label: 'Stop 3 · Fotobi', valueC: 4.6, source: 'manual' as const, photo: true, at: t(-1, 6, 38), outOfRange: false },
    { id: 'TP-5', runId: 'RUN-1005', checkpoint: 'depart_last' as const, label: 'Departure · last stop', valueC: 4.2, source: 'manual' as const, photo: true, at: t(-1, 6, 49), outOfRange: false },
    { id: 'TP-6', runId: 'RUN-1005', checkpoint: 'arrival' as const, label: 'Arrival · Main kitchen', valueC: 4.0, source: 'manual' as const, photo: true, at: t(-1, 7, 31), outOfRange: false },
    { id: 'TP-7', runId: 'RUN-1005', checkpoint: 'handover' as const, label: 'Handover', valueC: 4.1, source: 'manual' as const, photo: true, at: t(-1, 7, 40), outOfRange: false },
    { id: 'TP-11', runId: 'RUN-1008', checkpoint: 'load' as const, label: 'Load · Nsawam node', valueC: 3.6, source: 'manual' as const, photo: true, at: t(0, 4, 50), outOfRange: false },
    { id: 'TP-12', runId: 'RUN-1008', checkpoint: 'farm_stop' as const, stopSeq: 1, label: 'Stop 1 · Dobro', valueC: 4.1, source: 'manual' as const, photo: true, at: t(0, 5, 14), outOfRange: false },
    { id: 'TP-13', runId: 'RUN-1008', checkpoint: 'farm_stop' as const, stopSeq: 2, label: 'Stop 2 · Akropong', valueC: 4.4, source: 'manual' as const, photo: true, at: t(0, 5, 50), outOfRange: false },
  ];
  const deliveries = [
    { id: 'DL-1', runId: 'RUN-1001', orderId: 'CC-2388', at: t(-6, 7, 35), receiver: 'Yaw Ofori, receiving', signed: true, lines: [{ lineId: 'CC-2388-1', acceptedKg: 300, rejectedKg: 0 }, { lineId: 'CC-2388-2', acceptedKg: 172.3, rejectedKg: 27.7, reason: 'bruised' }, { lineId: 'CC-2388-3', acceptedKg: 150, rejectedKg: 0 }] },
    { id: 'DL-2', runId: 'RUN-1005', orderId: 'CC-2402', at: orders[3].deliveredAt!, receiver: 'Yaw Ofori, receiving', signed: true, lines: [{ lineId: 'CC-2402-1', acceptedKg: 298.5, rejectedKg: 0 }, { lineId: 'CC-2402-2', acceptedKg: 200, rejectedKg: 0 }, { lineId: 'CC-2402-3', acceptedKg: 110, rejectedKg: 40, reason: 'bruised on arrival' }] },
  ];
  const S = (id: string, cid: string, status: 'paid' | 'payable', payableAt?: number) => { const c = consignments.find(x => x.id === cid)!; const gross = round2(c.farmGateKg! * c.pricePerKg); return { id, consignmentId: cid, farmerId: c.farmerId, orderId: c.orderId, payableKg: c.farmGateKg!, pricePerKg: c.pricePerKg, gross, deductions: 0, net: gross, createdAt: c.coldBoxAt!, payableAt, deadlineAt: payableAt ? payableAt + 24 * H : undefined, status }; };
  const settlements = [
    S('ST-5001', 'CS-3001', 'paid', t(-6, 7, 35)), S('ST-5002', 'CS-3002', 'paid', t(-6, 7, 35)), S('ST-5003', 'CS-3003', 'paid', t(-6, 7, 35)),
    S('ST-5011', 'CS-3011', 'payable', orders[3].deliveredAt), S('ST-5012', 'CS-3012', 'payable', orders[3].deliveredAt), S('ST-5013', 'CS-3013', 'payable', orders[3].deliveredAt),
    { ...S('ST-5021', 'CS-3021', 'payable'), status: 'pending_delivery' as const, payableAt: undefined, deadlineAt: undefined }, { ...S('ST-5022', 'CS-3022', 'payable'), status: 'pending_delivery' as const, payableAt: undefined, deadlineAt: undefined },
  ];
  const transfers = [
    { id: 'TR-7001', runId: 'PR-0930', settlementId: 'ST-5001', farmerId: 'F1', momo: '0244009999', network: 'MTN', amount: settlements[0].net, idempotencyKey: 'a1b2c3d4-7001', status: 'succeeded' as const, attempts: 1, providerRef: 'FLW-A1B2C3D4', at: t(-6, 12, 10) },
    { id: 'TR-7002', runId: 'PR-0930', settlementId: 'ST-5002', farmerId: 'F9', momo: '0246107788', network: 'MTN', amount: settlements[1].net, idempotencyKey: 'a1b2c3d4-7002', status: 'succeeded' as const, attempts: 1, providerRef: 'FLW-A1B2C3D5', at: t(-6, 12, 10) },
    { id: 'TR-7003', runId: 'PR-0930', settlementId: 'ST-5003', farmerId: 'F10', momo: '0208812345', network: 'Telecel', amount: settlements[2].net, idempotencyKey: 'a1b2c3d4-7003', status: 'succeeded' as const, attempts: 1, providerRef: 'FLW-A1B2C3D6', at: t(-6, 12, 11) },
  ];
  const payoutRuns = [{ id: 'PR-0930', createdBy: 'OU1', createdByName: 'Ama Owusu', createdAt: t(-6, 10, 2), total: round2(transfers.reduce((s, x) => s + x.amount, 0)), count: 3, threshold: 2000, requiresTwo: true, approvals: [{ userId: 'OU2', name: 'Will McCoy II', at: t(-6, 10, 20) }, { userId: 'OU3', name: 'Richel Attafuah', at: t(-6, 11, 5) }], status: 'completed' as const, transferIds: ['TR-7001', 'TR-7002', 'TR-7003'], executedAt: t(-6, 12, 10) }];
  const ledger = [
    { id: 'LG-1', kind: 'payment_in' as const, direction: 'in' as const, amount: 4420, ref: 'STB-76010', orderId: 'CC-2388', at: t(-9, 15, 2), by: 'Flutterwave webhook' },
    { id: 'LG-2', kind: 'credit_note' as const, direction: 'out' as const, amount: 320, ref: 'CN-0102', orderId: 'CC-2388', at: t(-9, 10), by: 'Ama Owusu', memo: 'Tomato 37.6 kg rejected, approved by Will McCoy II' },
    { id: 'LG-3', kind: 'credit_note' as const, direction: 'out' as const, amount: 172, ref: 'CN-0108', orderId: 'CC-2388', at: t(-6, 9, 30), by: 'Ama Owusu', memo: 'Onion 27.7 kg bruised, approved by Richel Attafuah' },
    { id: 'LG-4', kind: 'payout_out' as const, direction: 'out' as const, amount: settlements[0].net, ref: 'FLW-A1B2C3D4', settlementId: 'ST-5001', transferId: 'TR-7001', at: t(-6, 12, 10), by: 'Payout run PR-0930' },
    { id: 'LG-5', kind: 'payout_out' as const, direction: 'out' as const, amount: settlements[1].net, ref: 'FLW-A1B2C3D5', settlementId: 'ST-5002', transferId: 'TR-7002', at: t(-6, 12, 10), by: 'Payout run PR-0930' },
    { id: 'LG-6', kind: 'payout_out' as const, direction: 'out' as const, amount: settlements[2].net, ref: 'FLW-A1B2C3D6', settlementId: 'ST-5003', transferId: 'TR-7003', at: t(-6, 12, 11), by: 'Payout run PR-0930' },
    { id: 'LG-7', kind: 'payment_in' as const, direction: 'in' as const, amount: 4420, ref: 'STB-77120', orderId: 'CC-2402', at: t(-4, 15, 2), by: 'Flutterwave webhook' },
    { id: 'LG-8', kind: 'payment_in' as const, direction: 'in' as const, amount: 3104, ref: 'MTN-88120', orderId: 'CC-2396', at: t(-2, 9, 47), by: 'Flutterwave webhook' },
    { id: 'LG-9', kind: 'payment_in' as const, direction: 'in' as const, amount: 17000, ref: 'STB-77201', orderId: 'CC-2410', at: t(-3, 14, 10), by: 'Flutterwave webhook' },
    { id: 'LG-10', kind: 'credit_note' as const, direction: 'out' as const, amount: 168, ref: 'CN-0112', orderId: 'CC-2402', at: now - 5 * H, by: 'Ama Owusu', memo: 'Pineapple 40 kg bruised on arrival, approved by Will McCoy II' },
    { id: 'LG-11', kind: 'payment_in' as const, direction: 'in' as const, amount: 2340, ref: 'STB-77230', orderId: 'CC-2420', at: t(0, 8, 5), by: 'Flutterwave webhook' },
  ];
  const exceptions = [
    { id: 'EX-0141', type: 'temperature_out_of_range' as const, severity: 'high' as const, title: 'Out of range · RUN-1005 stop 2 Pokrom', detail: '7.4 °C against a 2 to 6 °C range. Driver note: door open 9 min at loading. Back in range by the next checkpoint.', entity: { type: 'run', id: 'RUN-1005' }, openedAt: t(-1, 7, 45), status: 'in_progress' as const, assignee: 'Ama Owusu' },
    { id: 'EX-0142', type: 'delivery_rejection' as const, severity: 'medium' as const, title: 'CC-2402 · Pineapple 40 kg rejected', detail: 'Bruised on arrival. Credit note CN-0112 issued. Disposition of the 40 kg still to record.', entity: { type: 'order', id: 'CC-2402' }, openedAt: t(-1, 7, 50), status: 'open' as const },
    { id: 'EX-0143', type: 'payment_amount_mismatch' as const, severity: 'medium' as const, title: 'CC-2371 · underpayment resolved', detail: 'Received 12,000.00 against 12,480.00. Balance transferred 3 days later. Order released.', entity: { type: 'order', id: 'CC-2371' }, openedAt: t(-20, 9), status: 'resolved' as const, resolution: 'Balance received, order released', resolvedAt: t(-17, 11) },
  ];
  const sms = [
    { id: 'SM-1', to: '+233 24 400 9999', farmerId: 'F1', template: 'allocation_confirmed', body: 'CryoChain: truck comes today for Tomato, 350 kg at 4.50/kg. Have it ready 06:30–07:00.', at: t(-1, 18), status: 'delivered' as const, ref: 'HUB-90011' },
    { id: 'SM-2', to: '+233 24 400 9999', farmerId: 'F1', template: 'farmer_paid', body: 'CryoChain: GHS 1,350.00 sent to ••• ••• •999. Ref FLW-A1B2C3D4. Thank you.', at: t(-6, 12, 11), status: 'delivered' as const, ref: 'HUB-88120' },
    { id: 'SM-3', to: '+233 55 210 4433', farmerId: 'F5', template: 'consignment_captured', body: 'CryoChain: collected 298.5 kg Tomato, grade A. Amount GHS 1,343.25, paid within 24 hours of delivery.', at: t(-1, 7, 42), status: 'delivered' as const, ref: 'HUB-90102' },
    { id: 'SM-4', to: '+233 24 610 7788', farmerId: 'F9', template: 'consignment_captured', body: 'CryoChain: collected 201.5 kg Pepper, green, grade A. Amount GHS 1,007.50, paid within 24 hours of delivery.', at: t(0, 5, 29), status: 'delivered' as const, ref: 'HUB-90210' },
  ];
  const events = [
    { id: 'EV-1', deviceId: 'DEV-A1', seq: 118, type: 'consignment.cold_boxed', occurredAt: t(0, 5, 27), receivedAt: t(0, 5, 29), payload: { consignmentId: 'CS-3021' }, status: 'applied' as const, sizeKb: 2 },
    { id: 'EV-2', deviceId: 'DEV-A1', seq: 119, type: 'consignment.cold_boxed', occurredAt: t(0, 5, 59), receivedAt: t(0, 6, 3), payload: { consignmentId: 'CS-3022' }, status: 'applied' as const, sizeKb: 2 },
    { id: 'EV-3', deviceId: 'DEV-D1', seq: 64, type: 'run.temperature_recorded', occurredAt: t(0, 5, 50), receivedAt: t(0, 6, 3), payload: { runId: 'RUN-1008', valueC: 4.4 }, status: 'applied' as const, sizeKb: 180 },
  ];
  const devices = [
    { id: 'DEV-A1', role: 'agent' as const, userName: 'Kojo Antwi', online: true, outbox: [], lastSyncAt: t(0, 6, 3), seq: 119, appVersion: '0.9.2', storageMb: 6120, clockSkewMin: 0 },
    { id: 'DEV-D1', role: 'driver' as const, userName: 'Yaw Mensah', online: true, outbox: [], lastSyncAt: t(0, 6, 3), seq: 64, appVersion: '0.9.2', storageMb: 4380, clockSkewMin: 1 },
  ];
  const opsUsers = [{ id: 'OU1', name: 'Ama Owusu', title: 'Node manager', approver: false }, { id: 'OU2', name: 'Will McCoy II', title: 'Chief Executive', approver: true }, { id: 'OU3', name: 'Richel Attafuah', title: 'Advisory lead', approver: true }];
  const audit = [
    { id: 'AU-1', at: t(-6, 11, 5), actor: 'Richel Attafuah', action: 'Approved payout run', entity: 'PR-0930' },
    { id: 'AU-2', at: t(-1, 10, 12), actor: 'Ama Owusu', action: 'Revealed wallet number', entity: 'F6 Esi Quaye', detail: 'Reason: transfer failure investigation' },
    { id: 'AU-3', at: now - 5 * H, actor: 'Will McCoy II', action: 'Approved credit note', entity: 'CN-0112' },
  ];
  const config: Config = {
    payoutThreshold: 2000, approverIds: ['OU2', 'OU3'], checkpoints: ['load', 'farm_stop', 'depart_last', 'arrival', 'handover'], tempMin: 2, tempMax: 6, tolerancePct: 5, leadDays: 2, paymentExpiryHours: 48, pingMinutes: 5,
    walletLimits: { minimum: 3000, medium: 15000, enhanced: 25000 },
    smsTemplates: {
      farmer_registered: 'CryoChain: {name}, you are registered. Your farmer number is {code}. Questions: 030 274 1100.',
      allocation_confirmed: 'CryoChain: truck comes {date} for {product}, {kg} kg at {price}/kg. Have it ready {window}.',
      consignment_captured: 'CryoChain: collected {kg} kg {product}, grade {grade}. Amount {amount}, paid within 24 hours of delivery.',
      farmer_paid: 'CryoChain: {amount} sent to {masked}. Ref {ref}. Thank you.',
      payout_delayed: 'CryoChain: your payment of {amount} is delayed. We are fixing it. Call 030 274 1100.',
      wallet_changed: 'CryoChain: your payment number was changed to {masked}. If this was not you, call 030 274 1100.',
    },
    farmGatePrice,
  };
  return {
    categories, products, orgs, buyerUsers, orders, farmers, availability, consignments, runs, temps, deliveries, settlements, payoutRuns, transfers, ledger, exceptions, sms, events, devices, opsUsers, audit, config,
    session: { buyerUserId: 'U3', opsUserId: 'OU1', farmerId: 'F1', agentDeviceId: 'DEV-A1', driverDeviceId: 'DEV-D1', draft: { lines: [], deliveryDate: addDays(today, 2), address: 'Main kitchen, Gamel Abdul Nasser Ave' } },
    seq: 8000, seededAt: now,
  };
}
