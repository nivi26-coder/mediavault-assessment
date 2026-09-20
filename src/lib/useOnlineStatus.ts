import { useEffect, useState } from 'react';

/**
 * Tracks the browser's online/offline state via the standard events.
 * `navigator.onLine` can false-positive as "online" (it only reflects the
 * network interface, not real connectivity to our API), but it's still a
 * useful, zero-cost first signal — combined with the client's own retry
 * logic (see client.ts's `waitForConnectivity`) actually pausing on real
 * fetch failures, that's enough for this app without polling a health
 * endpoint just to double-check.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function goOnline() {
      setIsOnline(true);
    }
    function goOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
