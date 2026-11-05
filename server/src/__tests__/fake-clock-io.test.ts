import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { setImmediate as yieldForIo, setTimeout as realSleep } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settleDueTimers } from "./helpers/fake-clock-io.js";

describe("settleDueTimers (real I/O under a fake clock)", () => {
  let server: Server | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    if (server) { const closed = once(server, "close"); server.close(); server.closeAllConnections(); await closed; server = undefined; }
  });

  async function listen() {
    server = createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end('{"ok":true}'); });
    const listening = once(server, "listening");
    server.listen(0, "127.0.0.1");
    await listening;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No loopback listener");
    return `http://127.0.0.1:${address.port}/`;
  }

  /** Wait for a promise with a bounded real-time budget, servicing only the timers that are due. */
  async function settled<T>(promise: Promise<T>, budgetMs = 2_000): Promise<{ done: boolean; value?: T }> {
    let outcome: { done: boolean; value?: T } = { done: false };
    void promise.then(value => { outcome = { done: true, value }; });
    const until = performance.now() + budgetMs;
    while (!outcome.done && performance.now() < until) await settleDueTimers();
    return outcome;
  }

  it("runs timers due now but never moves Date or later deadlines", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const start = Date.now();
    const fired: string[] = [];
    setTimeout(() => fired.push("due-now"), 0);
    setTimeout(() => fired.push("in-1ms"), 1);
    setTimeout(() => fired.push("in-5s"), 5_000);
    await settleDueTimers();
    expect(fired).toEqual(["due-now"]);
    expect(Date.now()).toBe(start);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fired).toEqual(["due-now", "in-1ms"]);
  });

  it("lets a keep-alive follow-up request leave the process while setTimeout is faked", async () => {
    const url = await listen();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const start = Date.now();
    for (const request of ["first", "second", "third"]) {
      const response = await settled(fetch(url).then(reply => reply.json()));
      expect(response, `${request} request`).toEqual({ done: true, value: { ok: true } });
    }
    expect(Date.now()).toBe(start);
  });

  it("explains any stalled follow-up by queued zero-delay timers, not by the server", async () => {
    const url = await listen();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    expect((await settled(fetch(url).then(reply => reply.json()))).done).toBe(true);
    // Recent Node versions hold a reused socket until a zero-delay timer fires; older ones do not.
    // Either way the unpumped request may only be waiting on queued fake timers.
    const second = fetch(url).then(reply => reply.json());
    let finished = false;
    void second.then(() => { finished = true; });
    const until = performance.now() + 300;
    while (!finished && performance.now() < until) await yieldForIo();
    if (!finished) {
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      expect((await settled(second)).done).toBe(true);
    }
    await realSleep(0);
  });
});
