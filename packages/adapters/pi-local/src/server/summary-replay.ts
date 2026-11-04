// Read-only diagnostic: node --import tsx <this-file> <Pi-session.jsonl>
// Reconstructs a MINIMAL wake from persisted rendered text, not the missing
// original server metadata. Compares the same reconstruction before/after.
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { renderPaperclipWakePrompt } from "@paperclipai/adapter-utils/server-utils";

export async function replaySummaries(sessionFile: string) {
  const records = (await fs.readFile(sessionFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const results = [];
  for (const record of records) {
    if (record.message?.role !== "user") continue;
    const text = typeof record.message.content === "string" ? record.message.content : record.message.content.map((block: { text?: string }) => block.text ?? "").join("\n");
    const blocks = [...text.matchAll(/```text\n(.*?)\n```/gs)].flatMap(match => {
      try { return [JSON.parse(match[1])]; } catch { return []; }
    });
    const request = blocks.find(value => value.version === 1 && value.issueId);
    const evidence = blocks.find(value => "completedWork" in value);
    if (!request || !evidence) continue;
    const summary = evidence.completedWork;
    const continuation = { ...request, ...evidence };
    const wake = {
      reason: /- reason: (.*)/.exec(text)?.[1],
      issue: { id: request.issueId, identifier: "GH-5", title: "hi", description: "hi", status: /- issue status: (.*)/.exec(text)?.[1] },
      executionContinuation: continuation,
      ...(summary && text.split("Issue continuation summary:")[1]?.trimStart().startsWith(summary)
        ? { continuationSummary: { body: summary, key: "continuation-summary", title: "Continuation Summary" } } : {}),
    };
    const resumedSession = text.startsWith("## Paperclip Resume Delta");
    const before = renderPaperclipWakePrompt(wake, { resumedSession });
    const after = renderPaperclipWakePrompt(wake, { resumedSession, summaryPolicy: "deduplicate" });
    const beforeBytes = Buffer.byteLength(before);
    const afterBytes = Buffer.byteLength(after);
    results.push({ round: results.length + 1, reason: wake.reason, persistedWakeBytes: Buffer.byteLength(text), beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes, savedPercent: Number(((beforeBytes - afterBytes) / beforeBytes * 100).toFixed(2)), duplicatedBodyBytes: summary && "continuationSummary" in wake ? Buffer.byteLength(summary) : 0 });
  }
  return {
    scope: "Minimal reconstructed wakes only; no original full server context, no provider calls, no token or billing savings measured.",
    results,
    totals: results.reduce((total, row) => ({ beforeBytes: total.beforeBytes + row.beforeBytes, afterBytes: total.afterBytes + row.afterBytes, savedBytes: total.savedBytes + row.savedBytes, duplicatedBodyBytes: total.duplicatedBodyBytes + row.duplicatedBodyBytes }), { beforeBytes: 0, afterBytes: 0, savedBytes: 0, duplicatedBodyBytes: 0 }),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("Pass the Pi session JSONL path; this command is read-only.");
  console.log(JSON.stringify(await replaySummaries(process.argv[2]), null, 2));
}
