export type Role = 'farmer' | 'buyer' | 'agent' | 'driver' | 'ops';
export type AccountStatus = 'active' | 'locked' | 'invite_expired';

export interface Account {
  id: string;
  name: string;
  phone?: string; // normalized, see utils/format.normalizePhone
  email?: string;
  roles: Role[];
  status: AccountStatus;
  staff: boolean;
  businessVerified?: boolean;
  payoutReady?: boolean;
}

export interface CropPrice {
  id: string;
  crop: string;
  grade: 'A' | 'B' | 'C';
  unit: string;
  price: number;
  changePct: number;
  window: string;
}

export interface FarmerForm {
  name: string;
  phone: string;
  language: string;
  locality: string;
}

export interface BuyerForm {
  business: string;
  contact: string;
  phone: string;
  email: string;
  location: string;
}

export interface PayoutForm {
  network: string;
  number: string;
  holder: string;
  consent: boolean;
}
