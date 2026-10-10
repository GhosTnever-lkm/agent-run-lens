import { filterEvents, parseNdjson, summarize, summarizeRuns, toCsv, toMarkdown } from "./core.js";

const $ = (selector) => document.querySelector(selector);
const state = { events: [], errors: [], source: "" };
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return notify("File is over the 25 MiB limit.", true);
  try { loadText(await file.text(), file.name); }
  catch { notify("Could not read that file.", true); }
  fileInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); });
dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return notify("File is over the 25 MiB limit.", true);
  loadText(await file.text(), file.name);
});

$("#sampleButton").addEventListener("click", async () => loadText(await (await fetch("./sample-run.jsonl")).text(), "sample-run.jsonl"));
$("#search").addEventListener("input", render);
$("#statusFilter").addEventListener("change", render);
$("#exportCsv").addEventListener("click", () => download("agent-run-lens.csv", toCsv(visibleEvents()), "text/csv;charset=utf-8"));
$("#exportMd").addEventListener("click", () => download("agent-run-lens-report.md", toMarkdown(visibleEvents()), "text/markdown;charset=utf-8"));
$("#clearButton").addEventListener("click", () => { state.events = []; state.errors = []; state.source = ""; render(); notify("Session cleared from memory."); });

function loadText(text, filename) {
  const result = parseNdjson(text);
  state.events = result.events;
  state.errors = result.errors;
  state.source = filename;
  render();
  notify(`${result.events.length} events loaded${result.errors.length ? ` · ${result.errors.length} skipped` : ""}.`);
}

function visibleEvents() { return filterEvents(state.events, $("#search").value, $("#statusFilter").value); }

function render() {
  const summary = summarize(state.events);
  $("#metricEvents").textContent = summary.events.toLocaleString();
  $("#metricRuns").textContent = summary.runs.toLocaleString();
  $("#metricErrors").textContent = summary.errors.toLocaleString();
  $("#metricTokens").textContent = summary.tokens == null ? "—" : summary.tokens.toLocaleString();
  $("#metricCost").textContent = summary.costUsd == null ? "—" : `$${summary.costUsd.toFixed(4)}`;
  $("#sourceLabel").textContent = state.source || "No file loaded";
  $("#parseErrors").hidden = state.errors.length === 0;
  $("#parseErrors").textContent = state.errors.slice(0, 5).map((e) => `Line ${e.line}: ${e.message}`).join(" · ") + (state.errors.length > 5 ? ` · and ${state.errors.length - 5} more` : "");
  const events = visibleEvents().sort((a, b) => b.epoch - a.epoch);
  $("#eventCount").textContent = `${events.length} shown`;
  const runBody = $("#runRows"); runBody.replaceChildren();
  const runs = summarizeRuns(events);
  $("#runCount").textContent = `${runs.length} runs`;
  for (const run of runs) {
    const row = document.createElement("tr");
    for (const value of [run.runId, [run.agents, run.models].filter(Boolean).join(" · ") || "—", run.events, run.errors, `${run.elapsedMs.toLocaleString()} ms`, run.tokens == null ? "—" : run.tokens.toLocaleString(), run.costUsd == null ? "—" : `$${run.costUsd.toFixed(4)}`]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    runBody.append(row);
  }
  $("#runComparison").hidden = runs.length < 2;
  const tbody = $("#eventRows");
  tbody.replaceChildren();
  for (const event of events) {
    const row = document.createElement("tr");
    for (const value of [new Date(event.timestamp).toLocaleTimeString(), event.runId || "—", event.event, event.agent || event.model || event.tool || "—", event.status, event.durationMs == null ? "—" : `${event.durationMs.toLocaleString()} ms`, event.tokens == null ? "—" : event.tokens.toLocaleString()]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    const badge = row.children[4]; badge.innerHTML = "";
    const pill = document.createElement("span"); pill.className = `pill ${event.status}`; pill.textContent = event.status; badge.append(pill);
    row.addEventListener("click", () => showDetails(event));
    tbody.append(row);
  }
  $("#emptyState").hidden = events.length > 0;
  $("#tableWrap").hidden = events.length === 0;
}

function showDetails(event) {
  $("#detailTitle").textContent = event.event;
  const fields = [["Timestamp", event.timestamp], ["Run", event.runId], ["Agent", event.agent], ["Model", event.model], ["Tool", event.tool], ["Status", event.status], ["Duration", event.durationMs == null ? "" : `${event.durationMs} ms`], ["Tokens", event.tokens], ["Cost", event.costUsd == null ? "" : `$${event.costUsd}`], ["Detail", event.detail]];
  const list = $("#detailList"); list.replaceChildren();
  for (const [label, value] of fields.filter(([, value]) => value !== "" && value != null)) {
    const term = document.createElement("dt"); term.textContent = label;
    const description = document.createElement("dd"); description.textContent = String(value);
    list.append(term, description);
  }
  $("#rawJson").textContent = JSON.stringify(event.raw, null, 2);
  $("#detailDialog").showModal();
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function notify(message, error = false) {
  const toast = $("#toast"); toast.textContent = message; toast.dataset.error = String(error);
  toast.classList.add("visible"); setTimeout(() => toast.classList.remove("visible"), 3000);
}

$("#closeDetail").addEventListener("click", () => $("#detailDialog").close());
$("#detailDialog").addEventListener("click", (event) => { if (event.target === $("#detailDialog")) $("#detailDialog").close(); });
render();
