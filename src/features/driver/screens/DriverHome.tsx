import React from 'react';
import { FieldShell } from '../../../components/layout/FieldShell';
import type { Account } from '../../../types/auth';
import { DriverRoute } from '../components/DriverRoute';
import { TruckJobs } from '../components/TruckJobs';

/** The system-planned delivery route, plus any cold-truck bookings. */
export function DriverHome({ account }: { account: Account }) {
  return (
    <FieldShell name={account.name} role="Driver">
      <DriverRoute />
      <TruckJobs />
    </FieldShell>
  );
}
