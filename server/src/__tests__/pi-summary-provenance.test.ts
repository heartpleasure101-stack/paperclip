import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPromptContextFixture } from "@paperclipai/adapter-utils/test-fixtures/prompt-context";
import { selectPaperclipPromptSections } from "@paperclipai/adapter-utils/server-utils";
import { createDeliveryCheckpoint, decideSummaryPolicy } from "../../../packages/adapters/pi-local/src/server/summary-policy.js";
import { buildContinuationSummaryMarkdown } from "../services/issue-continuation-summary.js";
import { verifyPiSummaryProvenance, verifyPiSummaryProvenanceEvidence } from "../services/pi-summary-provenance.js";

const hash = (value: string | null) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture() {
  const issue = { id: "issue", companyId: "company", identifier: "P-1", title: "Title", description: "Objective", status: "done", priority: "high" };
  const agent = { id: "agent", companyId: "company", name: "Agent", adapterType: "pi_local" };
  const run = { id: "run", companyId: "company", agentId: "agent", contextSnapshot: { issueId: "issue" }, status: "succeeded", error: null, resultJson: { summary: " result " }, finishedAt: null };
  const previous = { id: "previous", companyId: "company", documentId: "doc", revisionNumber: 1, body: "previous body" };
  const body = buildContinuationSummaryMarkdown({ issue, agent, run, previousSummaryBody: previous.body });
  const revision = { id: "revision", companyId: "company", documentId: "doc", revisionNumber: 2, body, createdByAgentId: "agent", createdByRunId: "run", createdByUserId: null, changeSummary: "anything" };
  const document = { id: "doc", companyId: "company", latestRevisionId: "revision", latestRevisionNumber: 2, latestBody: body };
  const checkpoint = { version: 2, companyId: "company", issueId: "issue", agentId: "agent", runId: "run", inputSummaryHash: hash(previous.body), resultHash: hash("result") };
  return { companyId: "company", issueId: "issue", agentId: "agent", checkpoint, summary: body, document, revision, previous, issue, agent, run };
}
const verify = (value: ReturnType<typeof fixture>) => verifyPiSummaryProvenanceEvidence(value as unknown as Parameters<typeof verifyPiSummaryProvenanceEvidence>[0]);

describe("Pi summary provenance", () => {
  it("server 精確重建來源到 adapter 實際 prompt：壓縮後不重貼新摘要但完整事件仍在", () => {
    const e = fixture();
    const context = createPromptContextFixture();
    const identity = { companyId: e.companyId, issueId: e.issueId, agentId: e.agentId };
    Object.assign(context.executionContinuation, identity, { completedWork: e.previous.body });
    context.executionContinuation.resumeDelta!.baseRunId = e.run.id;
    Object.assign(context.paperclipWake.issue, { id: e.issueId });
    Object.assign(context.paperclipWake, { continuationSummary: { body: e.previous.body } });
    const prompt = selectPaperclipPromptSections(context, { summaryPolicy: "deduplicate" }).wakePrompt;
    const records: Record<string, unknown>[] = [
      { type: "session", version: 3, id: "header" },
      { type: "message", id: "user", parentId: null, message: { role: "user", content: [{ type: "text", text: prompt }] } },
      { type: "message", id: "answer", parentId: "user", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "result" }] } },
    ];
    const checkpoint = createDeliveryCheckpoint({ records, prompt, identity, sessionId: "/session", runId: e.run.id, inputSummary: e.previous.body });
    const proof = verify({ ...e, checkpoint: checkpoint as unknown as typeof e.checkpoint });
    expect(proof).not.toBeNull();
    Object.assign(context.executionContinuation, { completedWork: e.summary, summaryProvenance: proof });
    Object.assign(context.paperclipWake, { continuationSummary: { body: e.summary } });
    records.push({ type: "compaction", id: "compact", parentId: "answer", firstKeptEntryId: "compact", summary: "Native Pi summary", tokensBefore: 50000 });
    const decision = decideSummaryPolicy({ records, checkpoint, identity, sessionId: "/session", resumedSession: true, wake: context.paperclipWake });
    expect(decision).toMatchObject({ policy: "omit-covered", historyVerified: false });
    const output = selectPaperclipPromptSections(context, { resumedSession: true, summaryPolicy: decision.policy, resumeDeltaVerified: decision.historyVerified }).wakePrompt;
    expect(output).not.toContain(e.summary);
    expect(output).toContain("comment-first");
    expect(output).not.toContain("summaryProvenance");
  });
  it("verifies exact generation after an issue reopens", () => {
    const e = fixture();
    e.issue.status = "in_progress";
    expect(verify(e)).toMatchObject({ version: 1, kind: "regenerated-own-run", documentRevisionId: "revision", bodyHash: hash(e.summary) });
  });
  it("does not trust a forged changeSummary or altered body", () => {
    const e = fixture();
    e.revision.changeSummary = "Refresh continuation summary after run run";
    e.revision.body += " forged";
    e.document.latestBody = e.revision.body;
    e.summary = e.revision.body;
    expect(verify(e)).toBeNull();
  });
  it("rejects changed inputs, hashes, identity and missing previous revision", () => {
    const changes: Array<(e: ReturnType<typeof fixture>) => void> = [
      e => { e.checkpoint.inputSummaryHash = hash(null); },
      e => { e.checkpoint.resultHash = hash("wrong"); },
      e => { e.checkpoint.companyId = "other"; },
      e => { e.run.contextSnapshot.issueId = "other"; },
      e => { e.revision.createdByAgentId = "other"; },
      e => { e.revision.createdByUserId = "user" as never; },
      e => { e.previous.revisionNumber = 0; },
      e => { e.issue.title = "changed"; },
      e => { e.agent.name = "changed"; },
      e => { e.summary += " masked"; },
      e => { e.run.status = "failed"; },
    ];
    for (const change of changes) { const e = fixture(); change(e); expect(verify(e)).toBeNull(); }
  });
  it("supports a first revision with a null previous body", () => {
    const e = fixture();
    const body = buildContinuationSummaryMarkdown({ issue: e.issue, agent: e.agent, run: e.run, previousSummaryBody: null });
    e.revision.revisionNumber = e.document.latestRevisionNumber = 1;
    e.revision.body = e.document.latestBody = e.summary = body;
    e.checkpoint.inputSummaryHash = hash(null);
    expect(verifyPiSummaryProvenanceEvidence({ ...e, previous: null } as unknown as Parameters<typeof verifyPiSummaryProvenanceEvidence>[0])).not.toBeNull();
  });
  it("returns null when queries fail or the supplied summary is absent", async () => {
    const e = fixture();
    const db = { select() { throw new Error("database unavailable"); } } as unknown as Parameters<typeof verifyPiSummaryProvenance>[0]["db"];
    expect(await verifyPiSummaryProvenance({ ...e, db })).toBeNull();
    expect(await verifyPiSummaryProvenance({ ...e, db, summary: null })).toBeNull();
  });
});
