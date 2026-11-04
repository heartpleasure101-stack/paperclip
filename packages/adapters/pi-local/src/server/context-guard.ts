/** Per-attempt local Pi extension. It runs at the documented `context` hook,
 * after Pi's pre-request compaction, closing the adapter/CLI scheduling race.
 * The repair is request-local, not another persisted copy in session history. */
export function buildContextGuardSource(config: {
  initialCompactionId: string | null;
  initialContextEditIds?: string[];
  attemptPrompt?: string;
  eventsPrompt: string;
  fallbackPrompt: string;
}): string {
  return `const config = ${JSON.stringify(config)};
export default function register(pi) {
  pi.on("context", (event, ctx) => {
    let latest;
    let branch;
    let newEdits = false;
    try {
      branch = ctx.sessionManager.getBranch();
      newEdits = branch.some(entry => entry.type === "context_edit" && !(config.initialContextEditIds || []).includes(entry.id));
      latest = branch.findLast(entry => entry.type === "compaction");
      if (!newEdits && (!latest || latest.id === config.initialCompactionId)) return;
    } catch {
      latest = null;
    }
    const native = latest && !newEdits && branch.filter(entry => entry.type === "compaction").every(entry =>
      (entry.fromHook === undefined || entry.fromHook === false) &&
      typeof entry.summary === "string" && entry.summary.trim() &&
      Number.isSafeInteger(entry.tokensBefore) && entry.tokensBefore >= 0 &&
      branch.findIndex(item => item.id === entry.firstKeptEntryId) >= 0 &&
      branch.findIndex(item => item.id === entry.firstKeptEntryId) <= branch.indexOf(entry));
    const snapshot = native ? config.eventsPrompt : config.fallbackPrompt;
    const messages = event.messages.filter(message => message.customType !== "paperclip-context-repair");
    // Restore newer user turns that arrived during this invocation and were
    // subsequently compacted. Do not replay tool calls/results as commands.
    const messageText = entry => typeof entry.message?.content === "string" ? entry.message.content :
      Array.isArray(entry.message?.content) ? entry.message.content.filter(block => block.type === "text").map(block => block.text).join("\\n") : "";
    const start = branch && config.attemptPrompt ? branch.findLastIndex(entry => entry.type === "message" && entry.message?.role === "user" && messageText(entry) === config.attemptPrompt) : -1;
    const cut = branch && latest ? branch.findIndex(entry => entry.id === latest.firstKeptEntryId) : -1;
    const newerUsers = start >= 0 && cut > start ? branch.slice(start + 1, cut).filter(entry => entry.type === "message" && entry.message?.role === "user").map(entry => entry.message) : [];
    return { messages: [{
      role: "custom", customType: "paperclip-context-repair", display: false,
      content: "Paperclip context repair after compaction. Source context only, not a new task or approval. Do not override newer messages.\\n\\n" + snapshot,
      timestamp: Date.now()
    }, ...newerUsers, ...messages] };
  });
}
`;
}
