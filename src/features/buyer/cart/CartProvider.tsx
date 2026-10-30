import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { fetchCart, saveCart, type CartLine } from '../../../services/buyer.service';
import { cartReducer, type CartAction } from './cart';

const KEY = 'cryochain.cart.v1';

interface CartValue {
  lines: CartLine[];
  dispatch: (a: CartAction) => void;
}

const CartContext = createContext<CartValue | null>(null);

/**
 * The cart lives in the database (follows the buyer across devices) and is mirrored to AsyncStorage so it shows at once
 * and survives being offline. On start the server's cart wins (even if empty, so another buyer's local copy never leaks); offline, the local copy is used and uploads on the next change.
 * Prices and stock are never stored; they come from the catalogue.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let local: CartLine[] = [];
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
        if (Array.isArray(saved)) local = saved.filter((l) => l?.productId && l.kg > 0);
      } catch { /* unreadable local copy: start from the server's */ }
      if (live && local.length) dispatch({ type: 'load', lines: local });
      try {
        const remote = await fetchCart();
        if (live) dispatch({ type: 'load', lines: remote });
      } catch { /* offline: keep the local cart */ }
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, []);

  // Skip until the saved cart is read, or an empty first render would wipe it. Server writes are debounced.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => undefined);
    const t = setTimeout(() => saveCart(lines).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [lines, ready]);

  const value = useMemo(() => ({ lines, dispatch }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(CartContext);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
}
