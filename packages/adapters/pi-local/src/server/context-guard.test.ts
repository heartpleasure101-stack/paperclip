import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildContextGuardSource } from "./context-guard.js";

function fixture(eventsPrompt = "FULL EVENTS", fallbackPrompt = "FULL EVENTS AND SUMMARY") {
  const source = buildContextGuardSource({ initialCompactionId: null, attemptPrompt: "START", eventsPrompt, fallbackPrompt });
  const register = runInNewContext(source.replace("export default function register", "function register") + "; register;");
  let callback: (event: { messages: Record<string, unknown>[] }, ctx: unknown) => { messages: Record<string, unknown>[] } | undefined;
  register({ on(name: string, fn: typeof callback) { expect(name).toBe("context"); callback = fn; } });
  const branch: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [{ role: "user", content: "LATEST USER DIRECTION" }];
  return { branch, messages, invoke: () => callback({ messages }, { sessionManager: { getBranch: () => branch } }) };
}

describe("request-time Pi compaction guard", () => {
  it("沒有新壓縮時不增加任何 context", () => { expect(fixture().invoke()).toBeUndefined(); });
  it("決策之後、模型呼叫之前才壓縮，context hook 仍補完整事件", () => {
    const f = fixture();
    expect(f.invoke()).toBeUndefined();
    f.branch.push({ type: "compaction", id: "compact", firstKeptEntryId: "compact", summary: "native", tokensBefore: 50000 });
    const result = f.invoke()!;
    expect(result.messages[0].content).toContain("FULL EVENTS");
    expect(result.messages[0].content).not.toContain("AND SUMMARY");
    expect(result.messages.at(-1)).toEqual(f.messages[0]);
    expect(f.messages).toHaveLength(1);
  });
  it("自訂壓縮補回摘要；重複請求不累加 repair 副本", () => {
    const f = fixture();
    f.branch.push({ type: "compaction", id: "compact", firstKeptEntryId: "compact", summary: "custom", fromHook: true, tokensBefore: 50000 });
    const first = f.invoke()!;
    expect(first.messages[0].content).toContain("FULL EVENTS AND SUMMARY");
    f.messages.unshift(first.messages[0]);
    expect(f.invoke()!.messages.filter(message => message.customType === "paperclip-context-repair")).toHaveLength(1);
  });
  it("模型呼叫前新增 context_edit 或自訂壓縮後再原生壓縮，仍補摘要", () => {
    const edited = fixture();
    edited.branch.push({ type: "context_edit", id: "edit" });
    expect(edited.invoke()!.messages[0].content).toContain("FULL EVENTS AND SUMMARY");
    const custom = fixture();
    custom.branch.push({ type: "compaction", id: "custom", firstKeptEntryId: "custom", summary: "custom", tokensBefore: 1, fromHook: true });
    custom.branch.push({ type: "compaction", id: "native", firstKeptEntryId: "native", summary: "native", tokensBefore: 1 });
    expect(custom.invoke()!.messages[0].content).toContain("FULL EVENTS AND SUMMARY");
  });
  it("本輪新抵達又被壓縮掉的人類指示也能恢復，不重播工具", () => {
    const f = fixture();
    f.branch.push({ type: "message", id: "start", message: { role: "user", content: "START" } });
    f.branch.push({ type: "message", id: "steer", message: { role: "user", content: "STOP: do not deploy", timestamp: 1 } });
    f.branch.push({ type: "message", id: "tool", message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] } });
    f.branch.push({ type: "compaction", id: "compact", firstKeptEntryId: "compact", summary: "native", tokensBefore: 1 });
    const result = f.invoke()!;
    expect(result.messages[1].content).toBe("STOP: do not deploy");
    expect(result.messages).toHaveLength(3);
    expect(result.messages.at(-1)).toEqual(f.messages[0]);
  });
  it("任務文字只當資料，不可逃出產生的 JS 字串", () => {
    const payload = '\"; globalThis.injection = true; // </script> ` ${x}';
    const f = fixture(payload);
    f.branch.push({ type: "compaction", id: "compact", firstKeptEntryId: "compact", summary: "native", tokensBefore: 1 });
    expect(f.invoke()!.messages[0].content).toContain(payload);
  });
});
