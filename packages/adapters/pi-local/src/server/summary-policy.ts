import { createHash } from "node:crypto";

type Identity = { companyId: string; issueId: string; agentId: string };
type RecordValue = Record<string, unknown>;
export type DeliveryCheckpoint = Identity & {
  version: 1;
  sessionId: string;
  headerId: string;
  runId: string;
  entryId: string;
  promptHash: string;
};
export type SummaryDecision = {
  policy: "deduplicate" | "omit-covered";
  reason: string;
  historyVerified: boolean;
};
const object = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function parseDeliveryCheckpoint(value: unknown): DeliveryCheckpoint | null {
  const data = object(value);
  const keys = ["companyId", "issueId", "agentId", "sessionId", "headerId", "runId", "entryId", "promptHash"] as const;
  if (data.version !== 1 || keys.some(key => typeof data[key] !== "string" || !data[key]) || !/^[a-f0-9]{64}$/.test(data.promptHash as string)) return null;
  return { version: 1, ...Object.fromEntries(keys.map(key => [key, data[key]])) } as DeliveryCheckpoint;
}
function text(entry: RecordValue): string {
  const content = object(entry.message).content;
  return typeof content === "string" ? content : Array.isArray(content)
    ? content.map(block => object(block).text).filter(value => typeof value === "string").join("\n") : "";
}

/** Conservative projection of the active branch. Unknown edits fail closed;
 * raw off-branch or compacted-away entries never count as delivery evidence.
 * This is deliberately not a replacement for Pi's own context projection. */
function projection(records: unknown[]): { headerId: string; entries: RecordValue[] } | null {
  const header = object(records[0]);
  if (header.type !== "session" || header.version !== 3 || typeof header.id !== "string") return null;
  const map = new Map<string, RecordValue>();
  for (const raw of records.slice(1)) {
    const entry = object(raw);
    if (typeof entry.id !== "string" || map.has(entry.id)) return null;
    map.set(entry.id, entry);
  }
  let current = object(records.at(-1));
  const reversed: RecordValue[] = [];
  const seen = new Set<string>();
  while (typeof current.id === "string" && current.type !== "session") {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    reversed.push(current);
    if (current.parentId === null) break;
    if (typeof current.parentId !== "string" || !map.has(current.parentId)) return null;
    current = map.get(current.parentId)!;
  }
  const branch = reversed.reverse();
  if (branch.some(entry => entry.type === "context_edit")) return null;
  const compactIndex = branch.findLastIndex(entry => entry.type === "compaction");
  if (compactIndex >= 0) {
    const firstKept = branch[compactIndex].firstKeptEntryId;
    const start = branch.findIndex(entry => entry.id === firstKept);
    if (start < 0 || start > compactIndex) return null;
    return { headerId: header.id, entries: branch.slice(start).filter(entry => entry.type !== "compaction") };
  }
  return { headerId: header.id, entries: branch };
}

function hasIdentity(checkpoint: RecordValue, identity: Identity) {
  return checkpoint.companyId === identity.companyId && checkpoint.issueId === identity.issueId && checkpoint.agentId === identity.agentId;
}

/** Record a receipt only after a successful attempt and a persisted terminal
 * assistant reply on the same active branch. Caller checks process/parser status. */
export function createDeliveryCheckpoint(args: {
  records: unknown[]; prompt: string; runId: string; sessionId: string; identity: Identity;
}): DeliveryCheckpoint | null {
  const view = projection(args.records);
  if (!view || !args.identity.issueId) return null;
  const index = view.entries.findLastIndex(entry => entry.type === "message" && object(entry.message).role === "user");
  if (index < 0 || text(view.entries[index]) !== args.prompt) return null;
  const terminal = view.entries.slice(index + 1).findLast(entry => entry.type === "message" && object(entry.message).role === "assistant");
  if (!terminal || object(terminal.message).stopReason !== "stop") return null;
  return {
    ...args.identity, version: 1, sessionId: args.sessionId, headerId: view.headerId,
    runId: args.runId, entryId: view.entries[index].id as string, promptHash: hash(args.prompt),
  };
}

/** Only exact completedWork bodies previously carried by a same-task wake count.
 * Differing stand-alone summaries and semantic-only compaction are deliberately
 * not guessed at: they take c2.7 until richer coverage evidence is available. */
export function decideSummaryPolicy(args: {
  records: unknown[]; checkpoint: unknown; sessionId: string; identity: Identity;
  wake: unknown; resumedSession: boolean;
}): SummaryDecision {
  const keep = (reason: string, historyVerified = false): SummaryDecision => ({ policy: "deduplicate", reason, historyVerified });
  if (!args.resumedSession) return keep("fresh-handoff");
  const wake = object(args.wake);
  const continuation = object(wake.executionContinuation);
  if (continuation.companyId !== args.identity.companyId || continuation.issueId !== args.identity.issueId || object(wake.issue).id !== args.identity.issueId) return keep("identity-unknown");
  const checkpoint = object(args.checkpoint);
  if (checkpoint.version !== 1 || !hasIdentity(checkpoint, args.identity) || checkpoint.sessionId !== args.sessionId) return keep("delivery-unverified");
  // A retained delta prompt does not prove earlier full-snapshot events survived
  // semantic compaction. Until that coverage can be verified, restore the full
  // event snapshot AND summary (c2.7), even if this prompt itself was retained.
  if (args.records.some(raw => object(raw).type === "compaction")) return keep("compaction-coverage-unverified");
  const delta = object(continuation.resumeDelta);
  if (typeof delta.baseRunId !== "string" || delta.baseRunId !== checkpoint.runId) return keep("baseline-unverified");
  const view = projection(args.records);
  if (!view || view.headerId !== checkpoint.headerId) return keep("projection-unverified");
  const delivered = view.entries.find(entry => entry.id === checkpoint.entryId && entry.type === "message" && object(entry.message).role === "user");
  if (!delivered || hash(text(delivered)) !== checkpoint.promptHash) return keep("delivery-not-in-context");
  const completedWork = continuation.completedWork;
  const separate = object(wake.continuationSummary).body;
  if (typeof completedWork !== "string" || !completedWork) return keep("no-completed-work-proof", true);
  if (typeof separate === "string" && separate !== completedWork) return keep("distinct-summary", true);
  // Any additional stand-alone carrier is kept; the core decision cannot prove it.
  for (const entry of view.entries) {
    if (entry.type !== "message" || object(entry.message).role !== "user") continue;
    const prompt = text(entry);
    if (!prompt.startsWith("## Paperclip Resume Delta") && !prompt.startsWith("## Paperclip Wake Payload") && !prompt.includes("\n## Paperclip Wake Payload\n")) continue;
    const blocks = [...prompt.matchAll(/```text\n(.*?)\n```/gs)];
    let sameTask = false;
    for (const block of blocks) {
      let data: RecordValue;
      try { data = object(JSON.parse(block[1])); } catch { continue; }
      if (data.version === 1 && data.companyId === args.identity.companyId && data.issueId === args.identity.issueId) sameTask = true;
      if (sameTask && data.completedWork === completedWork) return { policy: "omit-covered", reason: "verified-history", historyVerified: true };
    }
  }
  return keep("summary-not-covered", true);
}
