import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { CartLine } from '../../../services/buyer.service';
import { cartReducer, type CartAction } from './cart';

const KEY = 'cryochain.cart.v1';

interface CartValue {
  lines: CartLine[];
  dispatch: (a: CartAction) => void;
}

const CartContext = createContext<CartValue | null>(null);

/** The cart survives restarts (AsyncStorage). Prices and stock are never stored; they come from the catalogue. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : [];
        if (Array.isArray(saved)) dispatch({ type: 'load', lines: saved.filter((l) => l?.productId && l.kg > 0) });
      })
      .catch(() => undefined)
      .finally(() => { loaded.current = true; });
  }, []);

  useEffect(() => {
    // Skip until the saved cart is read, or an empty first render would wipe it.
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => undefined);
  }, [lines]);

  const value = useMemo(() => ({ lines, dispatch }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(CartContext);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
}
