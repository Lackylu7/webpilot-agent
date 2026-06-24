"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AgentReport, AgentRun, BrowserSnapshot, ExtractedFact, RunEvent, TimelineItem } from "@/lib/types/agent";
import { formatDuration } from "@/lib/utils/time";

const sampleTasks = [
  "Compare Notion, ClickUp, and Linear pricing",
  "Best AI meeting note takers for small teams",
  "2026 product analytics tools comparison",
  "Stripe vs Paddle fees for SaaS"
];

const presets = ["SaaS pricing comparison", "Feature comparison table", "Market research report", "Academic literature review"];

export default function Home() {
  const [task, setTask] = useState("Compare Notion, ClickUp, and Linear pricing");
  const [isRunning, setIsRunning] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [facts, setFacts] = useState<ExtractedFact[]>([]);
  const [snapshots, setSnapshots] = useState<BrowserSnapshot[]>([]);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<"waiting" | "approved" | "skipped">("waiting");

  const activeSnapshot = snapshots.at(-1);
  const activeStage = run?.activeStage ?? "plan";
  const status = run?.status ?? "idle";
  const completedSteps = timeline.filter((item) => item.status === "completed").length;

  async function startRun(event: FormEvent) {
    event.preventDefault();
    if (!task.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    setRun(null);
    setTimeline([]);
    setFacts([]);
    setSnapshots([]);
    setReport(null);
    setApprovalState("waiting");

    try {
      const response = await fetch("/api/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task })
      });

      if (!response.ok || !response.body) {
        throw new Error("Unable to start browser workflow.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as RunEvent;
          applyRunEvent(event);
        }
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The run failed unexpectedly.");
    } finally {
      setIsRunning(false);
    }
  }

  function applyRunEvent(event: RunEvent) {
    if (event.type === "run") setRun(event.run);
    if (event.type === "stage") {
      setRun((current) => (current ? { ...current, activeStage: event.stage, status: event.status } : current));
    }
    if (event.type === "timeline") {
      setTimeline((current) => [...current, event.item]);
    }
    if (event.type === "snapshot") {
      setSnapshots((current) => [...current, event.snapshot]);
    }
    if (event.type === "facts") {
      setFacts(event.facts);
    }
    if (event.type === "report") {
      setReport(event.report);
    }
    if (event.type === "done") {
      setRun(event.run);
      setTimeline(event.run.timeline);
      setSnapshots(event.run.snapshots);
      setFacts(event.run.facts);
      setReport(event.run.report ?? null);
    }
    if (event.type === "error") {
      setError(event.message);
      if (event.run) setRun(event.run);
    }
  }

  const groupedFacts = useMemo(() => facts.slice(0, 12), [facts]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <strong>WebPilot Agent</strong>
          <span className="divider" />
          <span>Ask the web to work</span>
        </div>
        <div className="top-actions">
          <span className="online-dot" />
          <span>Agent online</span>
          <button className="soft-button">Run mode: Smart</button>
          <button className="icon-button" aria-label="Help">
            ?
          </button>
          <button className="icon-button" aria-label="Settings">
            ⚙
          </button>
          <span className="avatar">AK</span>
        </div>
      </header>

      <aside className="sidebar">
        <section>
          <p className="section-label">New task</p>
          <button className="new-task">+ New task <span>⌘ K</span></button>
        </section>

        <section>
          <p className="section-label">Task history</p>
          <div className="history-list">
            {sampleTasks.map((item, index) => (
              <button
                key={item}
                className={`history-item ${index === 0 ? "active" : ""}`}
                onClick={() => setTask(item)}
              >
                <span>{item}</span>
                <small>{index === 0 ? "Just now" : `${index + 1}h ago`}</small>
              </button>
            ))}
          </div>
          <button className="link-button">View all history</button>
        </section>

        <section>
          <p className="section-label">Saved presets</p>
          <div className="preset-list">
            {presets.map((preset) => (
              <button key={preset} onClick={() => setTask(preset)} className="preset-item">
                <span className="preset-icon">▣</span>
                {preset}
              </button>
            ))}
          </div>
          <button className="link-button">Manage presets</button>
        </section>
      </aside>

      <section className="workspace">
        <form className="composer panel" onSubmit={startRun}>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="Browser workflow task"
            placeholder="Ask WebPilot to research a market, compare products, or extract facts from websites..."
          />
          <div className="composer-footer">
            <span>◎ Auto</span>
            <span>⌁ Add context</span>
            <button className="primary-button" aria-label="Run workflow" disabled={isRunning}>
              {isRunning ? "Running..." : "▷ Run"}
            </button>
          </div>
        </form>

        <div className="stage-strip panel">
          <StageStep name="Plan" detail="Create browsing plan" active={activeStage === "plan"} done={completedSteps > 0} />
          <StageStep name="Run" detail="Execute steps" active={activeStage === "run"} done={snapshots.length > 0} />
          <StageStep name="Needs approval" detail="Read-only safety gate" active={activeStage === "approval"} warning />
          <StageStep name="Extract" detail="Normalize facts" active={activeStage === "extract"} done={facts.length > 0} />
          <StageStep name="Report" detail="Cite sources" active={activeStage === "report"} done={Boolean(report)} />
        </div>

        <div className="center-grid">
          <section className="panel timeline-panel">
            <PanelTitle title="Execution timeline" meta={status} />
            <div className="timeline">
              {timeline.length === 0 ? (
                <EmptyState title="Ready to launch" detail="Start a run to watch WebPilot plan, browse, extract, and report." />
              ) : (
                timeline.map((item) => <TimelineRow key={item.id} item={item} />)
              )}
            </div>
            <div className="panel-footer">
              <span>Auto-scroll <span className="toggle-on" /></span>
              <button className="soft-button">View plan</button>
            </div>
          </section>

          <section className="panel browser-panel">
            <PanelTitle title="Browser / session preview" meta={activeSnapshot?.sourceType ?? "idle"} />
            <div className="browser-address">
              <span>↗</span>
              <span>{activeSnapshot?.url ?? "Waiting for browser session..."}</span>
              <span>↻</span>
            </div>
            <div className="browser-preview">
              <div className="browser-page">
                <div className="mini-nav">
                  <strong>{activeSnapshot?.target ?? "WebPilot"}</strong>
                  <span>{activeSnapshot?.title ?? "Read-only browsing session"}</span>
                </div>
                <h3>{activeSnapshot?.title ?? "No page captured yet"}</h3>
                <p>{activeSnapshot?.excerpt ?? "The browser preview will show the current source, page title, and extracted page excerpt."}</p>
              </div>
            </div>
            <ApprovalCard state={approvalState} onChange={setApprovalState} />
          </section>
        </div>
      </section>

      <aside className="insights">
        <section className="panel facts-panel">
          <PanelTitle title="Extracted facts" meta={`${facts.length} rows`} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Plan</th>
                  <th>Price</th>
                  <th>Billing</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {groupedFacts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No facts extracted yet.</td>
                  </tr>
                ) : (
                  groupedFacts.map((fact, index) => (
                    <tr key={`${fact.product}-${fact.plan}-${index}`}>
                      <td>{fact.product}</td>
                      <td>{fact.plan}</td>
                      <td>{fact.price}</td>
                      <td>{fact.billing}</td>
                      <td>{fact.notes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button className="soft-button full-width">Open full data table ↗</button>
        </section>

        <section className="panel report-panel">
          <PanelTitle title="Final report" meta="MD" />
          {report ? (
            <article className="report">
              <h2>{report.title}</h2>
              <p>{report.summary}</p>
              <h3>Key takeaways</h3>
              <ul>
                {report.takeaways.map((takeaway) => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
              </ul>
              <h3>Sources</h3>
              <ol>
                {report.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.target}
                    </a>
                  </li>
                ))}
              </ol>
            </article>
          ) : (
            <EmptyState title="Report will appear here" detail="WebPilot will cite every captured source and preserve structured facts." />
          )}
          {error && <p className="error">{error}</p>}
          <div className="report-actions">
            <button className="soft-button" disabled={!report} onClick={() => navigator.clipboard?.writeText(report?.markdown ?? "")}>
              Copy report
            </button>
            <button className="soft-button" disabled={!activeSnapshot} onClick={() => activeSnapshot && window.open(activeSnapshot.url, "_blank")}>
              Open in new tab ↗
            </button>
          </div>
        </section>
      </aside>
    </main>
  );
}

function StageStep({
  name,
  detail,
  active,
  done,
  warning
}: {
  name: string;
  detail: string;
  active?: boolean;
  done?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`stage-step ${active ? "active" : ""} ${done ? "done" : ""} ${warning ? "warning" : ""}`}>
      <span>{done ? "✓" : warning ? "!" : "·"}</span>
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function PanelTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="panel-title">
      <strong>{title}</strong>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <div className={`timeline-row ${item.status}`}>
      <span className="timeline-dot">{item.status === "completed" ? "✓" : item.status === "running" ? "▶" : item.status === "warning" ? "!" : "·"}</span>
      <span className="timeline-index">{item.index}</span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
      </div>
      <small>{formatDuration(item.durationMs)}</small>
    </div>
  );
}

function ApprovalCard({
  state,
  onChange
}: {
  state: "waiting" | "approved" | "skipped";
  onChange: (state: "waiting" | "approved" | "skipped") => void;
}) {
  return (
    <div className={`approval-card ${state}`}>
      <div className="approval-head">
        <strong>Approval required</strong>
        <span>Read-only guard</span>
      </div>
      <p>WebPilot blocks login, checkout, file downloads, and form submission by default. Current run only reads public pages.</p>
      <div className="approval-actions">
        <button className="primary-button" onClick={() => onChange("approved")}>Approve</button>
        <button className="soft-button" onClick={() => onChange("approved")}>Approve once</button>
        <button className="soft-button" onClick={() => onChange("skipped")}>Skip step</button>
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
