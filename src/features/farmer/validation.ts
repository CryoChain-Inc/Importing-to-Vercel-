import { addressReady } from '../../services/maps.service';
import { NAME_MAX, isPhone } from '../../utils/format';
import type { FarmerDetails, Wallet } from '../../services/farmer.service';

export const detailsReady = (d: FarmerDetails) => d.name.trim().length >= 2 && d.name.trim().length <= NAME_MAX && addressReady(d);

export const walletReady = (w: Wallet) => w.network !== '' && isPhone(w.number) && w.name.trim().length >= 2 && w.name.trim().length <= NAME_MAX;
