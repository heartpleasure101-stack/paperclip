import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { agents, documentRevisions, documents, heartbeatRuns, issueDocuments, issues, type Db } from "@paperclipai/db";
import { ISSUE_STATUSES } from "@paperclipai/shared";
import { buildContinuationSummaryMarkdown, ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY, type IssueContinuationSummaryDocument } from "./issue-continuation-summary.js";

type Checkpoint = { version: number; companyId: string; issueId: string; agentId: string; runId: string; inputSummaryHash: string; resultHash: string };
type Evidence = {
  companyId: string; issueId: string; agentId: string; checkpoint: unknown;
  summary: IssueContinuationSummaryDocument | string | null;
  document: typeof documents.$inferSelect;
  revision: typeof documentRevisions.$inferSelect;
  previous: typeof documentRevisions.$inferSelect | null;
  issue: typeof issues.$inferSelect;
  agent: typeof agents.$inferSelect;
  run: typeof heartbeatRuns.$inferSelect;
};

const hash = (value: string | null) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Verify already-loaded evidence without trusting revision metadata as proof of generation. */
export function verifyPiSummaryProvenanceEvidence(e: Evidence) {
  try {
    const cp = e.checkpoint as Checkpoint | null;
    const { companyId, issueId, agentId, document, revision, previous, issue, agent, run } = e;
    const suppliedBody = typeof e.summary === "string" ? e.summary : e.summary?.body;
    if (!cp || cp.version !== 2 || cp.companyId !== companyId || cp.issueId !== issueId || cp.agentId !== agentId ||
      typeof cp.runId !== "string" || !cp.runId || typeof suppliedBody !== "string" ||
      issue.id !== issueId || issue.companyId !== companyId || agent.id !== agentId || agent.companyId !== companyId ||
      run.id !== cp.runId || run.companyId !== companyId || run.agentId !== agentId || run.contextSnapshot?.issueId !== issueId ||
      run.status !== "succeeded" || run.error !== null ||
      document.companyId !== companyId || revision.companyId !== companyId || revision.documentId !== document.id ||
      document.latestRevisionId !== revision.id || document.latestRevisionNumber !== revision.revisionNumber ||
      !Number.isInteger(revision.revisionNumber) || revision.revisionNumber < 1 ||
      document.latestBody !== revision.body || suppliedBody !== revision.body ||
      revision.createdByAgentId !== agentId || revision.createdByRunId !== run.id || revision.createdByUserId !== null) return null;
    if (typeof e.summary !== "string" && e.summary &&
      (e.summary.key !== ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY || e.summary.latestRevisionId !== revision.id || e.summary.latestRevisionNumber !== revision.revisionNumber)) return null;
    if (revision.revisionNumber === 1 ? previous !== null :
      !previous || previous.companyId !== companyId || previous.documentId !== document.id || previous.revisionNumber !== revision.revisionNumber - 1) return null;
    const previousBody = previous?.body ?? null;
    const result = run.resultJson?.summary;
    if (typeof result !== "string" || !result.trim() || hash(result.trim()) !== cp.resultHash || hash(previousBody) !== cp.inputSummaryHash) return null;
    if (!ISSUE_STATUSES.some((status) => buildContinuationSummaryMarkdown({ issue: { ...issue, status }, run, agent, previousSummaryBody: previousBody }) === revision.body)) return null;
    return { version: 1 as const, kind: "regenerated-own-run" as const, companyId, issueId, agentId, runId: run.id,
      documentRevisionId: revision.id, bodyHash: hash(revision.body), previousSummaryHash: hash(previousBody), resultHash: hash(result.trim()) };
  } catch {
    return null;
  }
}

export async function verifyPiSummaryProvenance(input: {
  db: Db; companyId: string; issueId: string; agentId: string; checkpoint: unknown;
  summary: IssueContinuationSummaryDocument | string | null;
}) {
  try {
    const { db, companyId, issueId, agentId, checkpoint, summary } = input;
    if (!summary || !checkpoint || typeof checkpoint !== "object") return null;
    const cp = checkpoint as Partial<Checkpoint>;
    if (cp.version !== 2 || cp.companyId !== companyId || cp.issueId !== issueId || cp.agentId !== agentId || typeof cp.runId !== "string" || !cp.runId) return null;
    const [rows, issueRows, agentRows, runRows] = await Promise.all([
      db.select({ document: documents, revision: documentRevisions }).from(issueDocuments)
        .innerJoin(documents, and(eq(documents.id, issueDocuments.documentId), eq(documents.companyId, companyId)))
        .innerJoin(documentRevisions, and(eq(documentRevisions.id, documents.latestRevisionId), eq(documentRevisions.documentId, documents.id), eq(documentRevisions.companyId, companyId)))
        .where(and(eq(issueDocuments.companyId, companyId), eq(issueDocuments.issueId, issueId), eq(issueDocuments.key, ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY))).limit(1),
      db.select().from(issues).where(and(eq(issues.id, issueId), eq(issues.companyId, companyId))).limit(1),
      db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId))).limit(1),
      db.select().from(heartbeatRuns).where(and(eq(heartbeatRuns.id, cp.runId), eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, agentId))).limit(1),
    ]);
    const row = rows[0];
    if (!row || !issueRows[0] || !agentRows[0] || !runRows[0]) return null;
    const previous = row.revision.revisionNumber > 1 ? (await db.select().from(documentRevisions).where(and(
      eq(documentRevisions.companyId, companyId), eq(documentRevisions.documentId, row.document.id),
      eq(documentRevisions.revisionNumber, row.revision.revisionNumber - 1),
    )).limit(1))[0] ?? null : null;
    return verifyPiSummaryProvenanceEvidence({ companyId, issueId, agentId, checkpoint, summary, ...row, previous, issue: issueRows[0], agent: agentRows[0], run: runRows[0] });
  } catch {
    return null;
  }
}
