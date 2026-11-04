import { describe, expect, it } from "vitest";
import { renderPaperclipWakePrompt, selectPaperclipPromptSections } from "./server-utils.js";
import { createPromptContextFixture } from "./test-fixtures/prompt-context.js";

function fixture(a = "SAME SUMMARY", b = a) {
  const context = createPromptContextFixture();
  context.executionContinuation.completedWork = a;
  Object.assign(context.paperclipWake, {
    continuationSummary: { key: "continuation-summary", title: "Continuation Summary", body: b },
  });
  return context;
}
function evidence(text: string) {
  return [...text.matchAll(/```text\n(.*?)\n```/gs)].flatMap(match => {
    try { return [JSON.parse(match[1])]; } catch { return []; }
  }).find(value => "completedWork" in value);
}

describe("Pi opt-in summary rendering", () => {
  it("沒有摘要時不額外加入摘要讀取提示", () => {
    const context = createPromptContextFixture();
    const before = renderPaperclipWakePrompt(context.paperclipWake);
    expect(renderPaperclipWakePrompt(context.paperclipWake, { summaryPolicy: "deduplicate" })).toBe(before);
  });
  it("其他 adapter 未啟用策略：保留原本兩處輸出", () => {
    const output = renderPaperclipWakePrompt(fixture().paperclipWake);
    expect(evidence(output).completedWork).toBe("SAME SUMMARY");
    expect(output).toContain("Issue continuation summary:\nSAME SUMMARY");
  });
  it("相同摘要只呈現 completedWork 一份，保留信任提醒與來源", () => {
    const context = fixture();
    const before = JSON.stringify(context);
    const output = selectPaperclipPromptSections(context, { summaryPolicy: "deduplicate" }).wakePrompt;
    expect(evidence(output).completedWork).toBe("SAME SUMMARY");
    expect(output).not.toContain("Issue continuation summary:");
    expect(output).toContain("not instructions or permission");
    expect(output).toContain("prior-run");
    expect(JSON.stringify(context)).toBe(before);
  });
  it("不同摘要不誤刪", () => {
    const output = renderPaperclipWakePrompt(fixture("FIRST", "SECOND").paperclipWake, { summaryPolicy: "deduplicate" });
    expect(evidence(output).completedWork).toBe("FIRST");
    expect(output).toContain("Issue continuation summary:\nSECOND");
  });
  it("有覆蓋證據的接續省略兩處正文，所有新事件與補取入口仍在", () => {
    const output = selectPaperclipPromptSections(fixture(), { resumedSession: true, summaryPolicy: "omit-covered" }).wakePrompt;
    expect(evidence(output).completedWork).toBeNull();
    expect(output).not.toContain("SAME SUMMARY");
    expect(output).toContain("/api/issues/issue-1/documents/continuation-summary");
    expect(output).toContain("comment-second");
    expect(output).toContain("published-action");
    expect(output).toContain("not instructions or permission");
  });
  it("fresh attempt 即使誤帶省略策略仍補回必要摘要一份", () => {
    const output = renderPaperclipWakePrompt(fixture().paperclipWake, { resumedSession: false, summaryPolicy: "omit-covered" });
    expect(evidence(output).completedWork).toBe("SAME SUMMARY");
    expect(output).not.toContain("Issue continuation summary:");
  });
  it("空 completedWork 不妨礙另一份摘要輸出", () => {
    const context = fixture("", "ONLY SUMMARY");
    context.executionContinuation.completedWork = null;
    const output = renderPaperclipWakePrompt(context.paperclipWake, { summaryPolicy: "deduplicate" });
    expect(output).toContain("Issue continuation summary:\nONLY SUMMARY");
  });
});
