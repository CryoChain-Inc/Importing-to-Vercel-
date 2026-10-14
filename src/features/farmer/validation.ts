import { isPhone } from '../../utils/format';
import type { FarmerDetails, Wallet } from '../../services/farmer.service';

export const detailsReady = (d: FarmerDetails) => d.name.trim().length > 1 && d.address.trim().length > 2;

export const walletReady = (w: Wallet) => w.network !== '' && isPhone(w.number) && w.name.trim().length > 1;
