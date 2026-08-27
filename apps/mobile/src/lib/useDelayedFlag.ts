import { useEffect, useState } from "react";

/**
 * Delay before a connection interruption is allowed to surface. Sub-second
 * blips — the common reconnect, the cached-thread sync — resolve inside it and
 * never render any UI at all.
 */
export const CONNECTION_STATUS_DELAY_MS = 800;

/**
 * `true` once `active` has held continuously for `delayMs`; `false` the moment
 * it drops. Used to keep transient states from flashing chrome on screen.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) {
      setSettled(false);
      return;
    }

    const timer = setTimeout(() => setSettled(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return settled;
}
