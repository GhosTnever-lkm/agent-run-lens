import test from "node:test";
import assert from "node:assert/strict";
import { filterEvents, normalizeEvent, parseNdjson, summarize, summarizeRuns, toCsv, toMarkdown } from "../core.js";

const sample = [
  { timestamp: "2026-01-01T00:00:00Z", run_id: "r1", event: "run.started", agent: "planner", status: "running", input_tokens: 8 },
  { timestamp: "2026-01-01T00:00:01Z", run_id: "r1", event: "tool.call", tool: "search", status: "success", duration_ms: 300, output_tokens: 4 },
  { timestamp: "2026-01-01T00:00:02Z", run_id: "r2", event: "tool.call", tool: "edit", status: "failed", duration_ms: 600, tokens: 12, cost_usd: 0.25, message: "could not apply" }
];
const events = sample.map((value, i) => normalizeEvent(value, i + 1));

test("parses NDJSON, ignores blank/comment lines, and preserves line numbers", () => {
  const parsed = parseNdjson(`\uFEFF# fixture\n${JSON.stringify(sample[0])}\n\n{broken}\n${JSON.stringify(sample[1])}`);
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.errors.map((e) => e.line), [4]);
});

test("reports malformed rows without throwing and skips non-event objects", () => {
  const parsed = parseNdjson("null\n[]\n{\"message\":\"not an event\"}\n");
  assert.equal(parsed.events.length, 0);
  assert.equal(parsed.errors.length, 3);
});

test("normalizes common aliases and rejects invalid timestamp or negative metrics", () => {
  const normalized = normalizeEvent({ time: "2026-01-01T00:00:00Z", name: "call", status: "ERROR", latency_ms: -3, tokens_in: "11" });
  assert.equal(normalized.status, "error");
  assert.equal(normalized.durationMs, null);
  assert.equal(normalized.tokens, 11);
  assert.equal(normalizeEvent({ timestamp: "nonsense", event: "start" }), null);
});

test("summarizes unique runs, errors, tokens, cost, and reported durations", () => {
  const summary = summarize(events);
  assert.equal(summary.events, 3);
  assert.equal(summary.runs, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.tokens, 24);
  assert.equal(summary.inputTokens, 8);
  assert.equal(summary.outputTokens, 4);
  assert.equal(summary.costUsd, 0.25);
  assert.equal(summary.durationMs, 900);
});

test("falls back to elapsed timestamps when no event has a duration", () => {
  const withoutDuration = events.map((event) => ({ ...event, durationMs: null }));
  assert.equal(summarize(withoutDuration).durationMs, 2000);
});

test("compares runs independently without mixing their tokens or failures", () => {
  const runs = summarizeRuns(events);
  assert.deepEqual(runs.map((run) => run.runId), ["r1", "r2"]);
  assert.equal(runs[0].tokens, 12);
  assert.equal(runs[0].errors, 0);
  assert.equal(runs[1].tokens, 12);
  assert.equal(runs[1].errors, 1);
});

test("filters by status and across searchable event fields", () => {
  assert.deepEqual(filterEvents(events, "EDIT").map((e) => e.tool), ["edit"]);
  assert.equal(filterEvents(events, "", "success").length, 1);
});

test("CSV quotes values and neutralizes spreadsheet formulas", () => {
  const risky = normalizeEvent({ ...sample[0], event: "=HYPERLINK(\"https://bad\")", detail: "@SUM(1,2)" });
  const csv = toCsv([risky]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'@SUM/);
  assert.match(csv, /"r1"/);
});

test("Markdown report escapes table delimiters from event data", () => {
  const report = toMarkdown([{ ...events[0], event: "tool | call" }]);
  assert.match(report, /tool \\\| call/);
  assert.match(report, /# Agent Run Lens report/);
});
