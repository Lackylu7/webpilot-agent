# Architecture

WebPilot Agent is intentionally small enough to explain in an interview while still showing a real agent workflow.

## Runtime flow

1. The user enters a browser research task in the dashboard.
2. The client posts the task to `POST /api/runs/stream`.
3. The route handler streams Server-Sent Events back to the browser.
4. `runAgent` creates a plan, browses targets, extracts facts, builds a report, and saves the run.
5. The UI updates timeline rows, browser preview, extracted facts, and final report as events arrive.

## Core modules

- `src/lib/agent/planner.ts` creates a compact browser plan.
- `src/lib/agent/browser-runner.ts` runs read-only browser capture through Playwright, then falls back to fetch or seed data.
- `src/lib/agent/extractor.ts` converts page excerpts into normalized facts.
- `src/lib/agent/reporter.ts` creates the cited Markdown report.
- `src/lib/store/runs.ts` persists local task history in `data/runs.json`.

## Agent state

Each run moves through:

```text
planning -> running -> extracting -> reporting -> completed
```

The UI also exposes high-level stages:

```text
Plan -> Run -> Needs approval -> Extract -> Report
```

The approval stage is currently a read-only guardrail card. It documents the human-in-the-loop boundary and can be extended to pause server-side execution before risky actions.

## Failure behavior

The browser runner is layered:

1. Try Playwright.
2. If browser launch or navigation fails, try HTTP fetch.
3. If live access fails, use deterministic seed data for known portfolio targets.

This keeps demos stable while preserving a real browser execution path.

## LLM integration

If `OPENAI_API_KEY` exists and `WEBPILOT_DEMO_MODE` is not true, the planner and extractor call an OpenAI-compatible Responses API endpoint. If the call fails, the agent falls back to deterministic planning or heuristics.

No keys are committed, logged, or sent to the client.
