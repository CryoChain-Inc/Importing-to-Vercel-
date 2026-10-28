import { useCallback } from 'react';
import { toAccount } from '../data/demoAuth';
import { authService } from '../services/auth.service';
import { useNav } from './Navigator';

/** Pulls the saved name, phone and email onto the signed-in account so headings update without another sign-in. */
export function useRefreshAccount() {
  const { patchAccount } = useNav();
  return useCallback(async () => {
    try {
      const profile = await authService.getProfile();
      if (!profile) return;
      const next = toAccount(profile);
      patchAccount({ name: next.name, phone: next.phone, email: next.email });
    } catch {
      // The screen already has a name; a failed refresh leaves it in place.
    }
  }, [patchAccount]);
}
