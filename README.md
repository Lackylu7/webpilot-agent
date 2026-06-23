# WebPilot Agent

WebPilot Agent is a portfolio-grade browser workflow agent. It turns a natural-language web research goal into a plan, runs read-only browser sessions, extracts structured facts, and drafts a cited report with visible execution traces.

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

It is designed to be cloned, run locally, recorded for a portfolio demo, and extended into a hosted product.

## Tech stack

- Next.js App Router + React + TypeScript
- Playwright for browser automation
- Local JSON store for task history
- Optional OpenAI-compatible Responses API integration
- Deterministic demo mode when no API key is configured
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

## Product screenshots

Desktop:

```text
docs/screenshots/webpilot-dashboard-desktop.png
```

Mobile:

```text
docs/screenshots/webpilot-dashboard-mobile.png
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
public/concepts/webpilot-dashboard-concept.png
```
