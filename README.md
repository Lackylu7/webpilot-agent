# WebPilot Agent

WebPilot Agent is a portfolio-grade browser workflow agent. It turns a natural-language web research goal into a plan, runs read-only browser sessions, extracts structured facts, and drafts a cited report with visible execution traces.

The product UI is Chinese-first for local demos and interview walkthroughs.

The first production scenario is competitive research:

```text
Compare Notion, ClickUp, and Linear pricing
```

WebPilot plans the run, captures source pages, extracts pricing rows, and produces a report with citations.

## Why this project exists

Most demo agents stop at chat. WebPilot shows the work:

- task planning
- browser execution
- source capture
- structured extraction
- human approval guardrails
- execution timeline
- cited report generation
- local task history
- saved presets and context-aware reruns
- Markdown / CSV exports
- persisted UI settings for local demos
- local health diagnostics
- history backup / restore
- full run package export

It is designed to be cloned, run locally, recorded for a portfolio demo, and operated as a serious local-first tool.

## Tech stack

- Next.js App Router + React + TypeScript
- Playwright for browser automation
- Local JSON store for task history
- Optional OpenAI-compatible Responses API integration
- Deterministic demo mode when no API key is configured
- Local diagnostics, backup / restore, and run package exports
- Vitest for core workflow tests

## Quick start

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

The app works without an API key by using deterministic planning and seed extraction for the default demo targets.

For a production-like local preview:

```powershell
$env:WEBPILOT_DEMO_MODE="true"
npm run build
npm run start
```

## Product screenshots

Desktop:

```text
docs/screenshots/webpilot-v2-dashboard-cn.png
```

Mobile:

```text
docs/screenshots/webpilot-v2-mobile-cn.png
```

## Optional live LLM mode

Copy the example environment file:

```bash
cp .env.example .env.local
```

Set:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

WebPilot will use the Responses API for planning and extraction. If the LLM call fails, it falls back to deterministic logic instead of breaking the run.

## Browser mode

By default, Playwright runs headless:

```bash
WEBPILOT_BROWSER_HEADLESS=true
```

If Chromium is not installed, install the browser runtime:

```bash
npx playwright install chromium
```

For completely offline portfolio demos:

```bash
WEBPILOT_DEMO_MODE=true
```

The UI also exposes three run modes:

- Smart: follows environment settings and falls back safely when live pages fail.
- Demo: uses deterministic seed data first for stable portfolio walkthroughs.
- Live: tries real browser/fetch capture first, then falls back only if needed.

Saved presets, run mode, and auto-scroll preferences are persisted in browser storage so demos survive refreshes.

## Local product controls

WebPilot is local-first. It stores run history on your machine and exposes diagnostics inside the Settings / Local Diagnostics UI.

Useful environment variables:

```bash
WEBPILOT_DATA_DIR=./data          # where local run history is stored
WEBPILOT_HISTORY_LIMIT=100        # max saved runs
WEBPILOT_MAX_PAGES=5              # max pages per run
WEBPILOT_TIMEOUT_MS=15000         # browser/fetch timeout
```

Local product features:

- health check for browser runtime, model API configuration, and local store
- backup / restore for task history JSON
- full run package export with timeline, sources, facts, report, quality score, and interview script
- cancelled runs are saved, so stopping a task still leaves an auditable trace

## How to demo it

For interview or resume demos, use Demo mode first:

1. Open the app.
2. Pick the built-in SaaS pricing comparison preset.
3. Click Run.
4. Walk through execution trace, browser evidence, extracted facts, source quality, and the deliverable report.
5. Export Markdown / CSV, full run package, or copy the portfolio script.

The app does not require a model API for this stable demo path. Add an OpenAI-compatible API key only when you want broader live planning and extraction.

## Commands

```bash
npm run dev        # local app
npm run build      # production build
npm run typecheck  # TypeScript verification
npm run test       # unit tests
```

## Safety model

WebPilot is read-only by default. It does not log in, submit forms, purchase items, download files, or perform destructive actions. The approval card in the UI documents that safety gate and is the foundation for future human-in-the-loop workflows.

## Portfolio talking points

- Designed a browser workflow agent with visible task state instead of a hidden chat loop.
- Implemented streaming execution updates through a Next.js route handler.
- Built a browser runner that degrades from Playwright to fetch to deterministic seed data.
- Normalized unstructured page text into a comparison table and cited Markdown report.
- Added guardrails for read-only browsing and human approval.

## Design concept

The product UI was designed from this concept image:

```text
public/concepts/webpilot-productized-v2-concept.png
```
