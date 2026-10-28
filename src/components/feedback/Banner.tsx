import { useEffect } from 'react';
import { useToast, type ToastTone } from './Toast';

/** Shows an error or success as a toast. Kept so existing call sites stay in place. */
export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  const { show } = useToast();
  const kind: ToastTone = tone === 'info' ? 'success' : 'error';
  useEffect(() => {
    show(text, kind);
  }, [kind, show, text]);
  return null;
}
