import React from 'react';
import type { Account, Role } from '../../types/auth';
import { AgentHome } from '../agent/screens/AgentHome';
import { DriverHome } from '../driver/screens/DriverHome';
import { OpsHome } from '../ops/screens/OpsHome';
import { BuyerHome } from '../buyer/screens/BuyerHome';
import { FarmerHome } from '../farmer/screens/FarmerHome';

/** Role workspace after sign-in. */
export function HomeScreen({ account, role }: { account: Account; role: Role }) {
  if (role === 'farmer') return <FarmerHome account={account} />;
  if (role === 'buyer') return <BuyerHome account={account} />;
  if (role === 'ops') return <OpsHome account={account} />;
  if (role === 'agent') return <AgentHome account={account} />;
  return <DriverHome account={account} />;
}
