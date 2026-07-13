import { ApiError, AuthExpiredError } from './api.js';

// One place that turns any thrown value into copy a person can act on.
// Server ApiError messages (§11 envelope) are already human-written, so they
// pass through; everything else maps to a friendly line instead of leaking
// codes like "HTTP_502" or "Failed to fetch" into the UI.
export function friendlyError(e: unknown, fallback = "That didn't work — please try again."): string {
  if (e instanceof AuthExpiredError) return 'Your session expired — please sign in again.';
  if (e instanceof ApiError) {
    if (e.status === 404) return "We couldn't find that — it may have been deleted.";
    if (e.status === 429) return 'Too many tries — give it a few seconds and try again.';
    if (e.status >= 500) return 'Something went wrong on our side — please try again in a moment.';
    if (e.message && e.message !== e.code) return e.message;
    return fallback;
  }
  // fetch() rejects with a TypeError when the network / server is unreachable.
  if (e instanceof TypeError || !navigator.onLine) {
    return "You're offline or the server is unreachable — check your connection and try again.";
  }
  return fallback;
}
