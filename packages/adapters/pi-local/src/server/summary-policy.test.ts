import { describe, expect, it } from "vitest";
import { createPromptContextFixture } from "@paperclipai/adapter-utils/test-fixtures/prompt-context";
import { selectPaperclipPromptSections } from "@paperclipai/adapter-utils/server-utils";
import { createDeliveryCheckpoint, decideSummaryPolicy } from "./summary-policy.js";
import { sessionCodec } from "./index.js";

const identity = { companyId: "company-1", issueId: "issue-1", agentId: "agent-1" };
const sessionId = "/sessions/test.jsonl";
function fixture() {
  const context = createPromptContextFixture();
  context.executionContinuation.completedWork = "SUMMARY";
  Object.assign(context.paperclipWake, { continuationSummary: { body: "SUMMARY", title: "Summary", key: "continuation-summary" } });
  const prompt = selectPaperclipPromptSections(context, { summaryPolicy: "deduplicate" }).wakePrompt;
  const records = [
    { type: "session", version: 3, id: "header", cwd: "/work" },
    { type: "message", id: "user", parentId: null, message: { role: "user", content: [{ type: "text", text: prompt }] } },
    { type: "message", id: "assistant", parentId: "user", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } },
  ];
  const checkpoint = createDeliveryCheckpoint({ records, prompt, runId: "prior-run", sessionId, identity });
  const args = { records, checkpoint, sessionId, identity, wake: context.paperclipWake, resumedSession: true };
  return { args, records, prompt, context };
}

describe("Pi summary delivery proof", () => {
  it("交付證據經 session codec 儲存／讀回仍保留，無效證據不保留", () => {
    const { args } = fixture();
    const params = { sessionId, cwd: "/work", paperclipDelivery: args.checkpoint };
    expect(sessionCodec.deserialize(sessionCodec.serialize(params))).toEqual(params);
    expect(sessionCodec.serialize({ sessionId, paperclipDelivery: { version: 1 } })).toEqual({ sessionId });
  });
  it("c2.1 同任務與 agent、有效分支、基準 run 及全文覆蓋才省略", () => {
    const { args } = fixture();
    expect(args.checkpoint).not.toBeNull();
    expect(decideSummaryPolicy(args)).toMatchObject({ policy: "omit-covered", reason: "verified-history" });
  });
  it("c2.2/c2.5 fresh attempt 不沿用接續證據", () => {
    expect(decideSummaryPolicy({ ...fixture().args, resumedSession: false }).policy).toBe("deduplicate");
  });
  it("c2.3 換 agent 不繼承交付證據", () => {
    expect(decideSummaryPolicy({ ...fixture().args, identity: { ...identity, agentId: "other" } }).policy).toBe("deduplicate");
  });
  it("c2.7 無 checkpoint 或未知基準 run 不省略", () => {
    const { args } = fixture();
    expect(decideSummaryPolicy({ ...args, checkpoint: null }).policy).toBe("deduplicate");
    args.wake.executionContinuation.resumeDelta!.baseRunId = "different-run";
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
  });
  it("新摘要／獨有摘要不省略", () => {
    const { args } = fixture();
    Object.assign(args.wake, { continuationSummary: { body: "NEW UNIQUE" } });
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
    args.wake.executionContinuation.completedWork = "CHANGED";
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
  });
  it("未修改的已交付紀錄不因後續失敗而自動失效，保留新增失敗資訊", () => {
    const { args, records } = fixture();
    records.push({ type: "message", id: "failed", parentId: "assistant", message: { role: "assistant", stopReason: "error", content: [{ type: "text", text: "failed" }] } });
    expect(decideSummaryPolicy(args).policy).toBe("omit-covered");
  });
  it("c2.6 已壓縮掉覆蓋來源時走 c2.7，不把磁碟原文當模型記憶", () => {
    const { args, records } = fixture();
    records.push({ type: "compaction", id: "compact", parentId: "assistant", firstKeptEntryId: "compact", summary: "short summary" } as never);
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
  });
  it("c2.6 只保留最後 delta 仍不足以證明更早訊息覆蓋，走 c2.7 並恢復完整事件", () => {
    const { args, records } = fixture();
    records.push({ type: "compaction", id: "compact", parentId: "assistant", firstKeptEntryId: "user", summary: "summary of earlier material" } as never);
    expect(decideSummaryPolicy(args)).toMatchObject({ policy: "deduplicate", historyVerified: false, reason: "compaction-coverage-unverified" });
  });
  it("分支切換後 checkpoint 不在有效路徑，不省略", () => {
    const { args, records } = fixture();
    records.push({ type: "message", id: "branch", parentId: null, message: { role: "user", content: [{ type: "text", text: "other branch" }] } } as never);
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
  });
  it("內容被修改／session 換身分／context_edit 未支援時保守補背景", () => {
    const { args } = fixture();
    expect(decideSummaryPolicy({ ...args, sessionId: "/other" }).policy).toBe("deduplicate");
    args.records[1].message!.content[0].text = "tampered";
    expect(decideSummaryPolicy(args).policy).toBe("deduplicate");
    const second = fixture();
    second.records.push({ type: "context_edit", id: "edit", parentId: "assistant" } as never);
    expect(decideSummaryPolicy(second.args).policy).toBe("deduplicate");
  });
  it("只寫入 user prompt，沒有完成回應，不能建立交付 checkpoint", () => {
    const { records, prompt } = fixture();
    expect(createDeliveryCheckpoint({ records: records.slice(0, 2), prompt, runId: "run", sessionId, identity })).toBeNull();
  });
});
