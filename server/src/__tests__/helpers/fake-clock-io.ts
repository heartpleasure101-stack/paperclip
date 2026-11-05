import { setImmediate as yieldForIo } from "node:timers/promises";
import { vi } from "vitest";

/**
 * Let real loopback I/O make progress while Date and setTimeout are faked.
 *
 * Node's HTTP client schedules its own zero-delay timers through the global
 * `setTimeout` (undici validates an idle keep-alive socket this way before it
 * reuses the socket for the next request). A fake `setTimeout` keeps them queued,
 * so a follow-up request such as the event acknowledgement never leaves the
 * process even though the service and database have finished their part.
 *
 * This runs only what is already due at the current virtual instant. It never
 * moves virtual time: `Date.now()` and every later deadline stay where they were,
 * so quiet-period and frozen-clock assertions keep their meaning.
 */
export async function settleDueTimers(): Promise<void> {
  const virtualNow = Date.now();
  await vi.advanceTimersByTimeAsync(0);
  if (Date.now() !== virtualNow) throw new Error("settleDueTimers must not advance virtual time");
  await yieldForIo();
}
