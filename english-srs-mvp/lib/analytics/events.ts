import { log } from '@/lib/observability/log';

export function trackEvent(name: string, payload: Record<string, unknown>) {
  log.info('analytics_event', { name, ...payload });
}
