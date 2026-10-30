import React from 'react';
import type { Account, Role } from '../../types/auth';
import { DriverHome } from '../driver/screens/DriverHome';
import { OpsHome } from '../ops/screens/OpsHome';
import { BuyerHome } from '../buyer/screens/BuyerHome';
import { FarmerHome } from '../farmer/screens/FarmerHome';

/** Role workspace after sign-in. */
export function HomeScreen({ account, role, tab }: { account: Account; role: Role; tab?: string }) {
  if (role === 'farmer') return <FarmerHome account={account} />;
  if (role === 'buyer') return <BuyerHome account={account} tab={tab} />;
  if (role === 'ops') return <OpsHome account={account} />;
  return <DriverHome account={account} />;
}
