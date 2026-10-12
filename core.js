const REQUIRED = ["timestamp", "event"];
const STATUSES = new Set(["ok", "success", "completed", "error", "failed", "timeout", "cancelled", "running", "warning"]);

export function parseNdjson(input) {
  const events = [];
  const errors = [];
  const lines = String(input).replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    try {
      const value = JSON.parse(line);
      const normalized = normalizeEvent(value, index + 1);
      if (normalized) events.push(normalized);
      else errors.push({ line: index + 1, message: "Expected a JSON object with timestamp and event fields." });
    } catch (error) {
      errors.push({ line: index + 1, message: error instanceof SyntaxError ? "Invalid JSON." : "Could not read this record." });
    }
  });
  return { events, errors, lines: lines.length };
}

export function normalizeEvent(value, line = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const timestamp = value.timestamp ?? value.time ?? value.start_time ?? value.started_at;
  const event = value.event ?? value.name ?? value.type;
  if (timestamp == null || event == null) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const statusValue = String(value.status ?? value.outcome ?? "").trim().toLowerCase();
  const status = STATUSES.has(statusValue) ? statusValue : "info";
  const duration = finiteNumber(value.duration_ms ?? value.durationMs ?? value.latency_ms);
  const inputTokens = finiteNumber(value.input_tokens ?? value.prompt_tokens ?? value.tokens_in);
  const outputTokens = finiteNumber(value.output_tokens ?? value.completion_tokens ?? value.tokens_out);
  const tokens = finiteNumber(value.tokens ?? value.total_tokens) ?? ((inputTokens ?? 0) + (outputTokens ?? 0) || null);
  const cost = finiteNumber(value.cost_usd ?? value.costUsd ?? value.cost);
  return {
    line,
    timestamp: date.toISOString(),
    epoch: date.getTime(),
    event: String(event).slice(0, 200),
    runId: clean(value.run_id ?? value.runId ?? value.session_id ?? value.sessionId),
    agent: clean(value.agent ?? value.agent_name ?? value.agentName),
    model: clean(value.model ?? value.model_name ?? value.modelName),
    tool: clean(value.tool ?? value.tool_name ?? value.toolName),
    status,
    durationMs: duration,
    inputTokens,
    outputTokens,
    tokens,
    costUsd: cost,
    detail: clean(value.message ?? value.error ?? value.detail ?? value.output),
    raw: value
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function clean(value) {
  if (value === null || value === undefined || typeof value === "object") return "";
  return String(value).slice(0, 2000);
}

export function summarize(events) {
  const durationValues = events.map((e) => e.durationMs).filter(Number.isFinite);
  let earliestEpoch = Infinity;
  let latestEpoch = -Infinity;
  for (const event of events) {
    if (event.epoch < earliestEpoch) earliestEpoch = event.epoch;
    if (event.epoch > latestEpoch) latestEpoch = event.epoch;
  }
  const span = events.length > 1 ? latestEpoch - earliestEpoch : 0;
  const errorCount = events.filter((e) => ["error", "failed", "timeout"].includes(e.status)).length;
  return {
    events: events.length,
    runs: new Set(events.map((e) => e.runId).filter(Boolean)).size,
    errors: errorCount,
    warnings: events.filter((e) => e.status === "warning").length,
    durationMs: durationValues.length ? durationValues.reduce((a, b) => a + b, 0) : span,
    tokens: sum(events, "tokens"),
    inputTokens: sum(events, "inputTokens"),
    outputTokens: sum(events, "outputTokens"),
    costUsd: sum(events, "costUsd"),
    agents: new Set(events.map((e) => e.agent).filter(Boolean)).size,
    tools: new Set(events.map((e) => e.tool).filter(Boolean)).size
  };
}

export function summarizeRuns(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.runId || "(unassigned)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups].map(([runId, rows]) => {
    let firstEpoch = Infinity;
    let lastEpoch = -Infinity;
    for (const event of rows) {
      if (event.epoch < firstEpoch) firstEpoch = event.epoch;
      if (event.epoch > lastEpoch) lastEpoch = event.epoch;
    }
    return {
      runId,
      events: rows.length,
      errors: rows.filter((event) => ["error", "failed", "timeout"].includes(event.status)).length,
      elapsedMs: lastEpoch - firstEpoch,
      tokens: sum(rows, "tokens"),
      costUsd: sum(rows, "costUsd"),
      agents: [...new Set(rows.map((event) => event.agent).filter(Boolean))].join(", "),
      models: [...new Set(rows.map((event) => event.model).filter(Boolean))].join(", "),
      firstEpoch
    };
  }).sort((a, b) => a.firstEpoch - b.firstEpoch);
}

function sum(events, key) {
  const values = events.map((event) => event[key]).filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

export function filterEvents(events, query = "", status = "all") {
  const needle = query.trim().toLowerCase();
  return events.filter((e) => (status === "all" || e.status === status) && (!needle || [e.event, e.runId, e.agent, e.model, e.tool, e.detail].join(" ").toLowerCase().includes(needle)));
}

export function toCsv(events) {
  const columns = ["timestamp", "run_id", "event", "status", "agent", "model", "tool", "duration_ms", "tokens", "cost_usd", "detail"];
  const rows = events.map((e) => [e.timestamp, e.runId, e.event, e.status, e.agent, e.model, e.tool, e.durationMs, e.tokens, e.costUsd, e.detail]);
  return [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toMarkdown(events) {
  const summary = summarize(events);
  const lines = ["# Agent Run Lens report", "", `- Events: ${summary.events}`, `- Runs: ${summary.runs}`, `- Errors/timeouts: ${summary.errors}`, `- Tokens: ${summary.tokens ?? "not provided"}`, `- Cost (USD): ${summary.costUsd ?? "not provided"}`, "", "| Time | Run | Event | Status | Agent / model | Duration | Tokens |", "|---|---|---|---|---|---:|---:|"];
  for (const e of events) lines.push(`| ${md(e.timestamp)} | ${md(e.runId)} | ${md(e.event)} | ${md(e.status)} | ${md([e.agent, e.model].filter(Boolean).join(" / "))} | ${e.durationMs ?? ""} | ${e.tokens ?? ""} |`);
  return `${lines.join("\n")}\n`;
}

function md(value) { return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " "); }
