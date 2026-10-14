// ScheduleWakeup request in an interactive conductor; otherwise PARKED (probe unknown, CONTRACT section 6).
export const PARK_REASON = 'wake unavailable outside interactive';

export function buildWake(at, prompt, context = 'interactive', now = Date.now()) {
  if (context !== 'interactive') return { outcome: 'PARKED', reason: PARK_REASON };
  const delaySeconds = Math.max(60, Math.min(3600, Math.round((Date.parse(at) - now) / 1000) || 60));
  return { outcome: 'ok', tool: 'ScheduleWakeup', at, prompt, request: { delaySeconds, prompt, at } };
}
