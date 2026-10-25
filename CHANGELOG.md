# Changelog

## 1.0.2 — 2026-10-25

- Keep the most recently selected file or sample when asynchronous reads finish out of order.
- Show a readable error when a dropped file cannot be read, and prevent pending reads from restoring a cleared session.

## 1.0.1 — 2026-10-12

- Calculate event time spans without spreading large event arrays into function arguments.

## 1.0.0 — 2026-10-10

- First release: local JSONL import, event normalization, run/error/token/cost summary, search and status filtering.
- Add event details with raw JSON, CSV and Markdown report exports, example fixture, accessibility labels, and regression tests.
