export const OFFLINE_MESSAGE =
  "No connection. Your details are saved on this device, so you can try again when you're back online.";

export const errorMessage = (e: unknown) =>
  e instanceof Error && e.message === 'offline' ? OFFLINE_MESSAGE : 'Something went wrong. Please try again.';
