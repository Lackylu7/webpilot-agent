# Resume Notes

## Project title

WebPilot Agent - Browser Workflow Agent for Competitive Research

## One-line description

Built a browser workflow agent that turns natural-language research goals into browsing plans, captures public web sources, extracts structured facts, and generates cited comparison reports with visible execution traces.

## Resume bullets

- Designed and implemented a Browser Workflow Agent using Next.js, TypeScript, and Playwright, supporting task planning, read-only web browsing, structured extraction, and cited report generation.
- Built a streaming execution timeline with Server-Sent Events so users can inspect each agent step, browser source, extraction result, and final report update in real time.
- Implemented layered reliability for browser workflows, falling back from Playwright to HTTP fetch to deterministic seed data for stable local demos.
- Added safety guardrails for read-only browsing and human approval boundaries before risky actions such as login, form submission, downloads, or purchases.
- Created a portfolio-ready product UI with task history, browser session preview, extracted facts table, source citations, and Markdown report export.

## Interview story

The key design choice is that WebPilot does not hide the agent behind a chat response. It exposes the agent's state machine, source evidence, and intermediate artifacts. That makes the workflow debuggable, safer, and easier to evaluate.
