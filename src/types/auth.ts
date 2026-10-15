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
}

export interface CropPrice {
  id: string;
  crop: string;
  grade: 'A' | 'B' | 'C';
  unit: string;
  price: number;
  changePct: number;
  category: string;
  imageUrl: string | null;
}

export interface BuyerForm {
  organization: string;
  name: string;
  /** The contact the user did not sign in with (phone if they used email, and vice versa); verified after sign-up. */
  otherContact: string;
  location: string;
}
