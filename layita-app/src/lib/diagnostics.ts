import { supabase } from '../features/auth/supabaseClient';
import { correlationId } from './correlation';
import type { Json } from '../types/database.generated';

const REPORTED = new Set<string>();

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function reportError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  const message = errorMessage(error).slice(0, 2000);
  const id = correlationId();
  const route = `${window.location.pathname}${window.location.search}`.slice(0, 500);
  const fingerprint = `${event}:${message}:${route}`;
  if (REPORTED.has(fingerprint)) return;
  REPORTED.add(fingerprint);

  const detail = { level: 'error', event, message, correlation_id: id, route, context };
  console.error('[layita]', detail);

  // Diagnostics are best-effort and must never interfere with the user's task.
  void supabase.rpc('record_client_error', {
    p_correlation_id: id,
    p_event: event.slice(0, 120),
    p_message: message,
    p_route: route,
    p_context: context as Json,
  }).then(({ error: reportFailure }) => {
    if (reportFailure && import.meta.env.DEV) {
      console.warn('[layita] diagnostic report was not stored', reportFailure.message);
    }
  });
}
