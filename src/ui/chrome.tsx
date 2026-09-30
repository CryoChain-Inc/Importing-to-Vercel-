import { createContext, useContext } from 'react';

export const ChromeContext = createContext<'phone' | 'desk' | 'plain'>('plain');
export function useChrome() {
  return useContext(ChromeContext);
}
