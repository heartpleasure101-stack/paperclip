import { createHash } from "node:crypto";

type Identity = { companyId: string; issueId: string; agentId: string };
type RecordValue = Record<string, unknown>;
export type DeliveryCheckpoint = Identity & {
  version: 1 | 2;
  sessionId: string;
  headerId: string;
  runId: string;
  entryId: string;
  promptHash: string;
  assistantEntryId?: string;
  assistantHash?: string;
  inputSummaryHash?: string;
  resultHash?: string;
  eventAnchorId?: string;
  eventAnchorHash?: string;
};
export type SummaryDecision = {
  policy: "deduplicate" | "omit-covered";
  reason: string;
  /** Event-snapshot coverage, independent from summary continuity. */
  historyVerified: boolean;
};
const object = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const digest = (value: string | null) => hash(JSON.stringify(value));
const validHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function carrierCovered(full: string, carrier: RecordValue): boolean {
  return carrier.body === full || (carrier.bodyTruncated === true && full.length > 4_000 && carrier.body === full.slice(0, 4_000));
}
/** Use the full server-authored completedWork carrier when the second carrier
 * is its known 4k truncation. Never scrape fenced user text for evidence. */
export function summaryInputForCheckpoint(wakeValue: unknown): string | null {
  const wake = object(wakeValue);
  const carrier = object(wake.continuationSummary);
  const full = object(wake.executionContinuation).completedWork;
  if (typeof full === "string" && carrierCovered(full, carrier)) return full;
  return typeof carrier.body === "string" && carrier.bodyTruncated !== true ? carrier.body : null;
}

export function parseDeliveryCheckpoint(value: unknown): DeliveryCheckpoint | null {
  const data = object(value);
  const keys = ["companyId", "issueId", "agentId", "sessionId", "headerId", "runId", "entryId", "promptHash"] as const;
  if (![1, 2].includes(data.version as number) || keys.some(key => typeof data[key] !== "string" || !data[key]) || !validHash(data.promptHash)) return null;
  const base = { version: data.version, ...Object.fromEntries(keys.map(key => [key, data[key]])) } as DeliveryCheckpoint;
  if (data.version === 1) return base;
  if (typeof data.assistantEntryId !== "string" || !data.assistantEntryId || !validHash(data.assistantHash) || !validHash(data.inputSummaryHash) || !validHash(data.resultHash)) return null;
  return {
    ...base, assistantEntryId: data.assistantEntryId, assistantHash: data.assistantHash,
    inputSummaryHash: data.inputSummaryHash, resultHash: data.resultHash,
    ...(typeof data.eventAnchorId === "string" && data.eventAnchorId && validHash(data.eventAnchorHash)
      ? { eventAnchorId: data.eventAnchorId, eventAnchorHash: data.eventAnchorHash } : {}),
  };
}
function text(entry: RecordValue): string {
  const content = object(entry.message).content;
  return typeof content === "string" ? content : Array.isArray(content)
    ? content.map(block => object(block).text).filter(value => typeof value === "string").join("\n") : "";
}
type View = { headerId: string; branch: RecordValue[]; keptStart: number; compactions: number[] };

/** Validate the active v3 ancestry and native compaction chain. A summarized
 * ancestor is continuity through Pi's native summary, NOT lossless semantics.
 * Custom compaction and unknown edits fail closed. Off-branch records do not
 * establish or invalidate coverage (duplicate IDs still invalidate the file). */
function projection(records: unknown[]): View | null {
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
  const compactions: number[] = [];
  let keptStart = 0;
  for (let index = 0; index < branch.length; index++) {
    const entry = branch[index];
    if (entry.type !== "compaction") continue;
    const start = branch.findIndex(item => item.id === entry.firstKeptEntryId);
    if ((entry.fromHook !== undefined && entry.fromHook !== false) || typeof entry.summary !== "string" || !entry.summary.trim() ||
      typeof entry.tokensBefore !== "number" || !Number.isSafeInteger(entry.tokensBefore) || entry.tokensBefore < 0 ||
      start < keptStart || start > index) return null;
    keptStart = start;
    compactions.push(index);
  }
  return { headerId: header.id, branch, keptStart, compactions };
}
export function activeCompactionId(records: unknown[]): string | null {
  const view = projection(records);
  const index = view?.compactions.at(-1);
  return view && index !== undefined ? view.branch[index].id as string : null;
}
function hasIdentity(checkpoint: RecordValue | DeliveryCheckpoint, identity: Identity) {
  return checkpoint.companyId === identity.companyId && checkpoint.issueId === identity.issueId && checkpoint.agentId === identity.agentId;
}
function anchorVerified(view: View, checkpoint: DeliveryCheckpoint): boolean {
  const index = view.branch.findIndex(entry => entry.id === checkpoint.eventAnchorId);
  const promptIndex = view.branch.findIndex(entry => entry.id === checkpoint.entryId);
  return index >= view.keptStart && index <= promptIndex && view.branch[index]?.type === "message" &&
    object(view.branch[index].message).role === "user" && hash(text(view.branch[index])) === checkpoint.eventAnchorHash;
}

/** Caller checks process/parser success. Receipt is bound to the persisted
 * input AND terminal output, including ancestors summarized during this run. */
export function createDeliveryCheckpoint(args: {
  records: unknown[]; prompt: string; runId: string; sessionId: string; identity: Identity;
  inputSummary?: string | null; resultSummary?: string; fullSnapshot?: boolean; previousCheckpoint?: unknown;
}): DeliveryCheckpoint | null {
  const view = projection(args.records);
  if (!view || !args.identity.issueId) return null;
  const index = view.branch.findLastIndex(entry => entry.type === "message" && object(entry.message).role === "user");
  if (index < 0 || text(view.branch[index]) !== args.prompt) return null;
  const terminal = view.branch.slice(index + 1).findLast(entry => entry.type === "message" && object(entry.message).role === "assistant");
  if (!terminal || object(terminal.message).stopReason !== "stop") return null;
  const result = (args.resultSummary ?? text(terminal)).trim();
  if (text(terminal).trim() !== result) return null;
  const previous = parseDeliveryCheckpoint(args.previousCheckpoint);
  const checkpoint: DeliveryCheckpoint = {
    ...args.identity, version: 2, sessionId: args.sessionId, headerId: view.headerId,
    runId: args.runId, entryId: view.branch[index].id as string, promptHash: hash(args.prompt),
    assistantEntryId: terminal.id as string, assistantHash: hash(text(terminal)),
    inputSummaryHash: digest(args.inputSummary ?? null), resultHash: digest(result),
  };
  if (args.fullSnapshot !== false && index >= view.keptStart) {
    checkpoint.eventAnchorId = checkpoint.entryId;
    checkpoint.eventAnchorHash = checkpoint.promptHash;
  } else if (previous && hasIdentity(previous, args.identity) && previous.sessionId === args.sessionId &&
    previous.headerId === view.headerId && anchorVerified(view, previous)) {
    checkpoint.eventAnchorId = previous.eventAnchorId;
    checkpoint.eventAnchorHash = previous.eventAnchorHash;
  }
  return checkpoint;
}

export function decideSummaryPolicy(args: {
  records: unknown[]; checkpoint: unknown; sessionId: string; identity: Identity;
  wake: unknown; resumedSession: boolean;
}): SummaryDecision {
  const keep = (reason: string, historyVerified = false): SummaryDecision => ({ policy: "deduplicate", reason, historyVerified });
  if (!args.resumedSession) return keep("fresh-handoff");
  const wake = object(args.wake);
  const continuation = object(wake.executionContinuation);
  if (continuation.companyId !== args.identity.companyId || continuation.issueId !== args.identity.issueId || object(wake.issue).id !== args.identity.issueId) return keep("identity-unknown");
  const checkpoint = parseDeliveryCheckpoint(args.checkpoint);
  if (!checkpoint || !hasIdentity(checkpoint, args.identity) || checkpoint.sessionId !== args.sessionId) return keep("delivery-unverified");
  const delta = object(continuation.resumeDelta);
  if (typeof delta.baseRunId !== "string" || delta.baseRunId !== checkpoint.runId) return keep("baseline-unverified");
  const view = projection(args.records);
  if (!view || view.headerId !== checkpoint.headerId) return keep("projection-unverified");
  const deliveredIndex = view.branch.findIndex(entry => entry.id === checkpoint.entryId && entry.type === "message" && object(entry.message).role === "user");
  if (deliveredIndex < 0 || hash(text(view.branch[deliveredIndex])) !== checkpoint.promptHash) return keep("delivery-not-in-context");
  if (checkpoint.version === 2) {
    const answerIndex = view.branch.findIndex(entry => entry.id === checkpoint.assistantEntryId && entry.type === "message" && object(entry.message).role === "assistant");
    if (answerIndex <= deliveredIndex || object(view.branch[answerIndex].message).stopReason !== "stop" ||
      hash(text(view.branch[answerIndex])) !== checkpoint.assistantHash || digest(text(view.branch[answerIndex]).trim()) !== checkpoint.resultHash) return keep("result-unverified");
  } else if (view.compactions.length > 0) return keep("legacy-compaction-unverified");
  const historyVerified = checkpoint.version === 2 ? anchorVerified(view, checkpoint) : view.compactions.length === 0;
  const completedWork = continuation.completedWork;
  const separate = object(wake.continuationSummary).body;
  if (typeof completedWork !== "string" || !completedWork) return keep("no-completed-work-proof", historyVerified);
  if (typeof separate === "string" && !carrierCovered(completedWork, object(wake.continuationSummary))) return keep("distinct-summary", historyVerified);
  const proof = object(continuation.summaryProvenance);
  if (checkpoint.version === 2 && proof.version === 1 && proof.kind === "regenerated-own-run" &&
    hasIdentity(proof, args.identity) && proof.runId === checkpoint.runId && typeof proof.documentRevisionId === "string" && proof.documentRevisionId &&
    proof.bodyHash === digest(completedWork) && proof.previousSummaryHash === checkpoint.inputSummaryHash && proof.resultHash === checkpoint.resultHash) {
    return { policy: "omit-covered", reason: deliveredIndex < view.keptStart ? "verified-own-run-compacted" : "verified-own-run", historyVerified };
  }
  if (checkpoint.version === 2 && checkpoint.inputSummaryHash === digest(completedWork)) {
    return { policy: "omit-covered", reason: "verified-history", historyVerified };
  }
  return keep("summary-not-covered", historyVerified);
}
