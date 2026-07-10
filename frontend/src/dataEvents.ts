import { useEffect, useState } from 'react';

// Cross-screen "server data changed behind your back" signal — e.g. an Undo
// toast deleting an expense after the group screen already fetched. Same
// window-event pattern as api.ts's `su-auth-expired`.
const EVENT = 'su-data-changed';

export function emitDataChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** Counter that bumps on every data-changed event — add it to fetch-effect deps. */
export function useDataChanged(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((x) => x + 1);
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, []);
  return n;
}
