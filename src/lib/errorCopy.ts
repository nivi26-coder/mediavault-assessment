import { ApiError } from '@/api/client';

const FRIENDLY_MESSAGES: Partial<Record<string, string>> = {
  stale_cursor: 'The results changed while loading more. Refreshing.',
  upstream_unavailable: 'The server is temporarily unavailable. Retrying…',
  rate_limited: 'Too many requests right now. Slowing down and retrying…',
  network_error: 'Connection problem. Check your network and try again.',
};

export function toUserMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return FRIENDLY_MESSAGES[err.code] ?? 'Something went wrong loading assets. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}
