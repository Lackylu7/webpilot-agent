"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AgentReport, AgentRun, BrowserSnapshot, ExtractedFact, RunEvent, TimelineItem } from "@/lib/types/agent";
import { formatDuration } from "@/lib/utils/time";

const sampleTasks = [
  "对比 Notion、ClickUp 和 Linear 的定价",
  "调研适合小团队的 AI 会议纪要工具",
  "对比 2026 年产品分析工具",
  "分析 Stripe 和 Paddle 的 SaaS 收费差异"
];

const presets = ["SaaS 定价对比", "功能对比表", "市场调研报告", "学术资料综述"];

const statusText: Record<string, string> = {
  idle: "空闲",
  planning: "规划中",
  running: "执行中",
  extracting: "抽取中",
  reporting: "生成报告",
  completed: "已完成",
  failed: "失败"
};

const sourceText: Record<string, string> = {
  browser: "浏览器",
  fetch: "网页读取",
  seed: "演示数据",
  idle: "待命"
};

export default function Home() {
  const [task, setTask] = useState("对比 Notion、ClickUp 和 Linear 的定价");
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
  const groupedFacts = useMemo(() => facts.slice(0, 12), [facts]);

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
        throw new Error("无法启动浏览器工作流。");
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
      setError(runError instanceof Error ? runError.message : "运行失败，请稍后重试。");
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

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <strong>WebPilot Agent</strong>
          <span className="divider" />
          <span>让网页自己干活</span>
        </div>
        <div className="top-actions">
          <span className="online-dot" />
          <span>Agent 在线</span>
          <button className="soft-button">运行模式：智能</button>
          <button className="icon-button" aria-label="帮助">?</button>
          <button className="icon-button" aria-label="设置">设置</button>
          <span className="avatar">AK</span>
        </div>
      </header>

      <aside className="sidebar">
        <section>
          <p className="section-label">新任务</p>
          <button className="new-task">+ 新建任务 <span>Ctrl K</span></button>
        </section>

        <section>
          <p className="section-label">任务历史</p>
          <div className="history-list">
            {sampleTasks.map((item, index) => (
              <button
                key={item}
                className={`history-item ${index === 0 ? "active" : ""}`}
                onClick={() => setTask(item)}
              >
                <span>{item}</span>
                <small>{index === 0 ? "刚刚" : `${index + 1} 小时前`}</small>
              </button>
            ))}
          </div>
          <button className="link-button">查看全部历史</button>
        </section>

        <section>
          <p className="section-label">保存的预设</p>
          <div className="preset-list">
            {presets.map((preset) => (
              <button key={preset} onClick={() => setTask(preset)} className="preset-item">
                <span className="preset-icon">□</span>
                {preset}
              </button>
            ))}
          </div>
          <button className="link-button">管理预设</button>
        </section>
      </aside>

      <section className="workspace">
        <form className="composer panel" onSubmit={startRun}>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="浏览器工作流任务"
            placeholder="让 WebPilot 调研市场、对比产品，或者从网页里抽取结构化信息..."
          />
          <div className="composer-footer">
            <span>自动模式</span>
            <span>添加上下文</span>
            <button className="primary-button" aria-label="运行工作流" disabled={isRunning}>
              {isRunning ? "运行中..." : "运行"}
            </button>
          </div>
        </form>

        <div className="stage-strip panel">
          <StageStep name="规划" detail="生成浏览计划" active={activeStage === "plan"} done={completedSteps > 0} />
          <StageStep name="执行" detail="访问网页" active={activeStage === "run"} done={snapshots.length > 0} />
          <StageStep name="人工确认" detail="只读安全边界" active={activeStage === "approval"} warning />
          <StageStep name="抽取" detail="整理事实" active={activeStage === "extract"} done={facts.length > 0} />
          <StageStep name="报告" detail="引用来源" active={activeStage === "report"} done={Boolean(report)} />
        </div>

        <div className="center-grid">
          <section className="panel timeline-panel">
            <PanelTitle title="执行时间线" meta={statusText[status] ?? status} />
            <div className="timeline">
              {timeline.length === 0 ? (
                <EmptyState title="准备就绪" detail="点击运行后，你会看到 WebPilot 规划、浏览、抽取和生成报告的全过程。" />
              ) : (
                timeline.map((item) => <TimelineRow key={item.id} item={item} />)
              )}
            </div>
            <div className="panel-footer">
              <span>自动滚动 <span className="toggle-on" /></span>
              <button className="soft-button">查看计划</button>
            </div>
          </section>

          <section className="panel browser-panel">
            <PanelTitle title="浏览器 / 会话预览" meta={sourceText[activeSnapshot?.sourceType ?? "idle"]} />
            <div className="browser-address">
              <span>↗</span>
              <span>{activeSnapshot?.url ?? "等待浏览器会话启动..."}</span>
              <span>↻</span>
            </div>
            <div className="browser-preview">
              <div className="browser-page">
                <div className="mini-nav">
                  <strong>{activeSnapshot?.target ?? "WebPilot"}</strong>
                  <span>{activeSnapshot?.title ?? "只读浏览会话"}</span>
                </div>
                <h3>{activeSnapshot?.title ?? "还没有捕获页面"}</h3>
                <p>{activeSnapshot?.excerpt ?? "浏览器预览会展示当前来源、页面标题和 Agent 读取到的网页摘要。"}</p>
              </div>
            </div>
            <ApprovalCard state={approvalState} onChange={setApprovalState} />
          </section>
        </div>
      </section>

      <aside className="insights">
        <section className="panel facts-panel">
          <PanelTitle title="抽取结果" meta={`${facts.length} 行`} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>产品</th>
                  <th>方案</th>
                  <th>价格</th>
                  <th>计费</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {groupedFacts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>还没有抽取到事实。</td>
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
          <button className="soft-button full-width">打开完整数据表 ↗</button>
        </section>

        <section className="panel report-panel">
          <PanelTitle title="最终报告" meta="MD" />
          {report ? (
            <article className="report">
              <h2>{report.title}</h2>
              <p>{report.summary}</p>
              <h3>关键结论</h3>
              <ul>
                {report.takeaways.map((takeaway) => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
              </ul>
              <h3>来源</h3>
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
            <EmptyState title="报告会显示在这里" detail="WebPilot 会保留每个来源链接，并把抽取结果整理成可复制的报告。" />
          )}
          {error && <p className="error">{error}</p>}
          <div className="report-actions">
            <button className="soft-button" disabled={!report} onClick={() => navigator.clipboard?.writeText(report?.markdown ?? "")}>
              复制报告
            </button>
            <button className="soft-button" disabled={!activeSnapshot} onClick={() => activeSnapshot && window.open(activeSnapshot.url, "_blank")}>
              新窗口打开 ↗
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
        <strong>需要人工确认</strong>
        <span>只读保护</span>
      </div>
      <p>WebPilot 默认阻止登录、结账、下载文件和提交表单。当前运行只读取公开网页，不会替你做高风险操作。</p>
      <div className="approval-actions">
        <button className="primary-button" onClick={() => onChange("approved")}>确认</button>
        <button className="soft-button" onClick={() => onChange("approved")}>仅本次确认</button>
        <button className="soft-button" onClick={() => onChange("skipped")}>跳过步骤</button>
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
