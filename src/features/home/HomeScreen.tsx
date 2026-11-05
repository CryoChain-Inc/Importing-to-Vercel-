import React, { Suspense, lazy } from 'react';
import { LoadingScreen } from '../../components/feedback';
import type { Account, Role } from '../../types/auth';

// One chunk per role on web, so a driver never downloads the ops console. Native bundles inline these.
const DriverHome = lazy(() => import('../driver/screens/DriverHome').then((m) => ({ default: m.DriverHome })));
const OpsHome = lazy(() => import('../ops/screens/OpsHome').then((m) => ({ default: m.OpsHome })));
const BuyerHome = lazy(() => import('../buyer/screens/BuyerHome').then((m) => ({ default: m.BuyerHome })));
const FarmerHome = lazy(() => import('../farmer/screens/FarmerHome').then((m) => ({ default: m.FarmerHome })));

/** Role workspace after sign-in. */
export function HomeScreen({ account, role, tab }: { account: Account; role: Role; tab?: string }) {
  return (
    <Suspense fallback={<LoadingScreen message="Loading..." />}>
      {role === 'farmer' ? <FarmerHome account={account} tab={tab} />
        : role === 'buyer' ? <BuyerHome account={account} tab={tab} />
        : role === 'ops' ? <OpsHome account={account} />
        : <DriverHome account={account} />}
    </Suspense>
  );
}
