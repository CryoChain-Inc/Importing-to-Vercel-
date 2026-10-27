import { isEmail, normalizePhone } from './format';

// When each identifier last had a code sent. Module-level so it outlives the screen showing the countdown
// (remounts on navigation, modals closing) and is the same on web and native.
// shortcut: in memory only, a full web reload or app restart forgets it, persist to storage if that matters.
const sentAt = new Map<string, number>();
const key = (identifier: string) => (isEmail(identifier) ? identifier.trim().toLowerCase() : normalizePhone(identifier));

export const markCodeSent = (identifier: string) => void sentAt.set(key(identifier), Date.now());

/** Epoch ms of the last send; starts the clock now if this app has not seen one (e.g. after a reload). */
export const codeSentAt = (identifier: string) => {
  const k = key(identifier);
  if (!sentAt.has(k)) sentAt.set(k, Date.now());
  return sentAt.get(k)!;
};
