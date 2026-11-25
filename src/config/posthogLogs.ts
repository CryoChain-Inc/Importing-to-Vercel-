import { posthog } from './posthog';

type LogAttributes = Record<string, string | number | boolean>;

/** Emits only purpose-written operational logs through PostHog's native log pipeline. */
export const posthogLog = {
  info: (body: string, attributes: LogAttributes) => posthog?.logger.info(body, attributes),
  warn: (body: string, attributes: LogAttributes) => posthog?.logger.warn(body, attributes),
};
