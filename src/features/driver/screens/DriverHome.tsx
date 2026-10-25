import React from 'react';
import { FieldShell } from '../../../components/layout/FieldShell';
import type { Account } from '../../../types/auth';
import { TruckJobs } from '../components/TruckJobs';

/** Drivers only handle cold-truck bookings. */
export function DriverHome({ account }: { account: Account }) {
  return (
    <FieldShell name={account.name} role="Driver">
      <TruckJobs />
    </FieldShell>
  );
}
