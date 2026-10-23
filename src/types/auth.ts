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
