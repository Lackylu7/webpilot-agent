"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { AgentPlan, AgentReport, AgentRun, BrowserSnapshot, ExtractedFact, RunEvent, RunMode, TimelineItem } from "@/lib/types/agent";
import { formatDuration } from "@/lib/utils/time";

type ModalName = "history" | "presets" | "plan" | "data" | "settings" | "help" | "context" | null;

type Preset = {
  id: string;
  name: string;
  prompt: string;
  description: string;
};

const defaultTask = "对比 Notion、ClickUp 和 Linear 的定价";

const builtInPresets: Preset[] = [
  {
    id: "pricing",
    name: "SaaS 定价对比",
    prompt: defaultTask,
    description: "适合演示浏览、抽取、对比表和报告生成。"
  },
  {
    id: "features",
    name: "功能对比表",
    prompt: "对比 Notion、ClickUp 和 Linear 的核心功能、目标用户和团队协作能力",
    description: "强调结构化事实抽取和横向分析。"
  },
  {
    id: "market",
    name: "市场调研报告",
    prompt: "调研适合小团队的 AI 会议纪要工具，并输出推荐结论",
    description: "适合展示调研型报告工作流。"
  },
  {
    id: "finance",
    name: "收费差异分析",
    prompt: "分析 Stripe 和 Paddle 的 SaaS 收费差异",
    description: "适合展示可替换业务场景。"
  }
];

const sampleTasks = builtInPresets.map((preset) => preset.prompt);

const storageKeys = {
  presets: "webpilot.presets",
  runMode: "webpilot.runMode",
  autoScroll: "webpilot.autoScroll"
};

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

const runModeText: Record<RunMode, string> = {
  smart: "智能",
  demo: "演示",
  live: "实时"
};

export default function Home() {
  const [task, setTask] = useState(defaultTask);
  const [context, setContext] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [facts, setFacts] = useState<ExtractedFact[]>([]);
  const [snapshots, setSnapshots] = useState<BrowserSnapshot[]>([]);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<"waiting" | "approved" | "skipped">("waiting");
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [presets, setPresets] = useState<Preset[]>(builtInPresets);
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [runMode, setRunMode] = useState<RunMode>("smart");
  const [historyQuery, setHistoryQuery] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  const activeSnapshot = snapshots.at(-1);
  const activeStage = run?.activeStage ?? "plan";
  const status = run?.status ?? "idle";
  const completedSteps = timeline.filter((item) => item.status === "completed").length;
  const visibleFacts = useMemo(() => facts.slice(0, 12), [facts]);
  const sourceCount = report?.sources.length ?? snapshots.length;
  const progress = progressFromStage(activeStage, status);

  const filteredHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return history;
    return history.filter((item) => item.task.toLowerCase().includes(query));
  }, [history, historyQuery]);

  useEffect(() => {
    void loadHistory();
    try {
      const savedPresets = JSON.parse(window.localStorage.getItem(storageKeys.presets) ?? "[]") as Preset[];
      if (Array.isArray(savedPresets) && savedPresets.length > 0) {
        const savedCustomPresets = savedPresets.filter((preset) => preset.id?.startsWith("preset-") && preset.prompt?.trim());
        setPresets([...savedCustomPresets, ...builtInPresets]);
      }

      const savedMode = window.localStorage.getItem(storageKeys.runMode);
      if (savedMode === "smart" || savedMode === "demo" || savedMode === "live") setRunMode(savedMode);

      const savedAutoScroll = window.localStorage.getItem(storageKeys.autoScroll);
      if (savedAutoScroll === "true" || savedAutoScroll === "false") setAutoScroll(savedAutoScroll === "true");
    } catch {
      // Local settings are optional; a corrupt browser storage entry should never block the app.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKeys.presets, JSON.stringify(presets));
  }, [presets, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKeys.runMode, runMode);
  }, [runMode, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKeys.autoScroll, String(autoScroll));
  }, [autoScroll, storageReady]);

  useEffect(() => {
    if (!autoScroll) return;
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [timeline, autoScroll]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        newTask();
      }
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function loadHistory() {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { runs?: AgentRun[] };
      setHistory(data.runs ?? []);
    } catch {
      // History is a convenience panel. The core run path should not fail because local history is unavailable.
    }
  }

  async function startRun(event?: FormEvent) {
    event?.preventDefault();
    if (!task.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    setRun(null);
    setTimeline([]);
    setFacts([]);
    setSnapshots([]);
    setReport(null);
    setApprovalState("waiting");
    setModal(null);

    try {
      const taskWithContext = context.trim() ? `${task.trim()}\n\n补充上下文：${context.trim()}` : task.trim();
      const response = await fetch("/api/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskWithContext, runMode })
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
      await loadHistory();
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
      setHistory((current) => [event.run, ...current.filter((item) => item.id !== event.run.id)].slice(0, 20));
      showToast("任务已完成，报告和数据已保存。");
    }
    if (event.type === "error") {
      setError(event.message);
      if (event.run) setRun(event.run);
    }
  }

  function newTask() {
    setTask("");
    setContext("");
    setRun(null);
    setTimeline([]);
    setFacts([]);
    setSnapshots([]);
    setReport(null);
    setError(null);
    setApprovalState("waiting");
    setModal(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function applyPreset(preset: Preset) {
    setTask(preset.prompt);
    setModal(null);
    showToast(`已套用预设：${preset.name}`);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function saveCurrentAsPreset() {
    const name = newPresetName.trim() || "自定义预设";
    if (!task.trim()) {
      showToast("请先填写任务，再保存预设。");
      return;
    }
    const normalizedTask = task.trim();
    const alreadyExists = presets.some((preset) => preset.prompt === normalizedTask && preset.name === name);
    if (alreadyExists) {
      showToast("这个预设已经存在。");
      return;
    }
    const preset: Preset = {
      id: `preset-${Date.now()}`,
      name,
      prompt: normalizedTask,
      description: context.trim() ? `包含补充上下文：${context.trim().slice(0, 24)}...` : "从当前任务保存。"
    };
    setPresets((current) => [preset, ...current]);
    setNewPresetName("");
    showToast("预设已保存，刷新后仍会保留。");
  }

  function deletePreset(presetId: string) {
    if (!presetId.startsWith("preset-")) {
      showToast("内置预设会保留，适合随时恢复演示。");
      return;
    }
    setPresets((current) => current.filter((preset) => preset.id !== presetId));
    showToast("自定义预设已删除。");
  }

  function resetPresets() {
    setPresets(builtInPresets);
    setNewPresetName("");
    showToast("已恢复内置预设。");
  }

  function loadRun(selectedRun: AgentRun) {
    setRun(selectedRun);
    setTask(selectedRun.task);
    setTimeline(selectedRun.timeline);
    setSnapshots(selectedRun.snapshots);
    setFacts(selectedRun.facts);
    setReport(selectedRun.report ?? null);
    setError(selectedRun.error ?? null);
    setModal(null);
    showToast("已载入历史任务。");
  }

  function cycleRunMode() {
    setRunMode((current) => {
      const next = current === "smart" ? "demo" : current === "demo" ? "live" : "smart";
      showToast(`运行模式已切换为：${runModeText[next]}`);
      return next;
    });
  }

  async function copyReport() {
    if (!report) {
      showToast("还没有报告可复制。");
      return;
    }
    try {
      await navigator.clipboard.writeText(report.markdown);
      showToast("报告 Markdown 已复制。");
    } catch {
      showToast("当前浏览器不允许直接复制，可以使用导出 MD。");
    }
  }

  function downloadMarkdown() {
    if (!report) {
      showToast("还没有报告可导出。");
      return;
    }
    downloadFile("webpilot-report.md", report.markdown, "text/markdown;charset=utf-8");
    showToast("报告已导出为 Markdown。");
  }

  function downloadCsv() {
    if (facts.length === 0) {
      showToast("还没有数据可导出。");
      return;
    }
    const header = ["产品", "方案", "价格", "计费", "备注", "来源", "置信度"];
    const rows = facts.map((fact) => [
      fact.product,
      fact.plan,
      fact.price,
      fact.billing,
      fact.notes,
      fact.sourceUrl,
      `${Math.round(fact.confidence * 100)}%`
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    downloadFile("webpilot-facts.csv", csv, "text/csv;charset=utf-8");
    showToast("数据表已导出为 CSV。");
  }

  function openActiveSource() {
    if (!activeSnapshot) {
      showToast("还没有可打开的来源。");
      return;
    }
    window.open(activeSnapshot.url, "_blank", "noopener,noreferrer");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  const plan = run?.plan;

  return (
    <main className="shell">
      {toast && <div className="toast">{toast}</div>}
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
          <button className="soft-button" onClick={cycleRunMode}>运行模式：{runModeText[runMode]}</button>
          <button className="icon-button" aria-label="帮助" onClick={() => setModal("help")}>?</button>
          <button className="soft-button" onClick={() => setModal("settings")}>设置</button>
          <span className="avatar">AK</span>
        </div>
      </header>

      <aside className="sidebar">
        <section>
          <p className="section-label">新任务</p>
          <button className="new-task" onClick={newTask}>+ 新建任务 <span>Ctrl K</span></button>
        </section>

        <section>
          <p className="section-label">任务历史</p>
          <div className="history-list">
            {(history.length > 0 ? history.slice(0, 4) : sampleTasks).map((item, index) => {
              const isRun = typeof item !== "string";
              const label = isRun ? item.task.split("\n")[0] : item;
              const meta = isRun ? statusText[item.status] ?? item.status : index === 0 ? "示例任务" : `${index + 1} 小时前`;
              return (
                <button
                  key={isRun ? item.id : item}
                  className={`history-item ${index === 0 ? "active" : ""}`}
                  onClick={() => (isRun ? loadRun(item) : setTask(item))}
                >
                  <span>{label}</span>
                  <small>{meta}</small>
                </button>
              );
            })}
          </div>
          <button className="link-button" onClick={() => setModal("history")}>查看全部历史</button>
        </section>

        <section>
          <p className="section-label">保存的预设</p>
          <div className="preset-list">
            {presets.slice(0, 4).map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)} className="preset-item">
                <span className="preset-icon">□</span>
                {preset.name}
              </button>
            ))}
          </div>
          <button className="link-button" onClick={() => setModal("presets")}>管理预设</button>
        </section>
      </aside>

      <section className="workspace">
        <form className="composer panel" onSubmit={startRun}>
          <div className="composer-head">
            <span>自然语言任务</span>
            <span>{context.trim() ? "已添加上下文" : "可选上下文"}</span>
          </div>
          <textarea
            ref={textareaRef}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="浏览器工作流任务"
            placeholder="让 WebPilot 调研市场、对比产品，或者从网页里抽取结构化信息..."
          />
          <div className="composer-footer">
            <button type="button" className="text-control" onClick={cycleRunMode}>
              模式：{runModeText[runMode]}
            </button>
            <button type="button" className="text-control" onClick={() => setModal("context")}>添加上下文</button>
            <button type="button" className="soft-button" onClick={saveCurrentAsPreset}>保存为预设</button>
            <button className="primary-button" aria-label="运行工作流" disabled={isRunning || !task.trim()}>
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

        <div className="progress-strip">
          <span style={{ width: `${progress}%` }} />
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
              <div ref={timelineEndRef} />
            </div>
            <div className="panel-footer">
              <button className={`text-control ${autoScroll ? "selected" : ""}`} onClick={() => setAutoScroll((value) => !value)}>
                自动滚动 {autoScroll ? "开" : "关"}
              </button>
              <button className="soft-button" onClick={() => setModal("plan")} disabled={!plan}>查看计划</button>
            </div>
          </section>

          <section className="panel browser-panel">
            <PanelTitle title="浏览器 / 会话预览" meta={sourceText[activeSnapshot?.sourceType ?? "idle"]} />
            <div className="browser-address">
              <button onClick={openActiveSource} aria-label="打开当前来源">↗</button>
              <span>{activeSnapshot?.url ?? "等待浏览器会话启动..."}</span>
              <button onClick={() => void startRun()} disabled={isRunning || !task.trim()} aria-label="重新运行">↻</button>
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
            <ApprovalCard state={approvalState} onChange={setApprovalState} showToast={showToast} />
          </section>
        </div>
      </section>

      <aside className="insights">
        <section className="panel facts-panel">
          <PanelTitle title="抽取结果" meta={`${facts.length} 行`} />
          <div className="metric-row">
            <Metric label="来源" value={`${sourceCount}`} />
            <Metric label="字段" value={`${facts.length * 5}`} />
            <Metric label="平均置信度" value={facts.length ? `${Math.round((facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length) * 100)}%` : "--"} />
          </div>
          <FactTable facts={visibleFacts} emptyText="还没有抽取到事实。" />
          <div className="split-actions">
            <button className="soft-button" onClick={() => setModal("data")} disabled={facts.length === 0}>完整数据表</button>
            <button className="soft-button" onClick={downloadCsv} disabled={facts.length === 0}>导出 CSV</button>
          </div>
        </section>

        <section className="panel report-panel">
          <PanelTitle title="最终报告" meta="MD" />
          {report ? (
            <ReportView report={report} />
          ) : (
            <EmptyState title="报告会显示在这里" detail="WebPilot 会保留每个来源链接，并把抽取结果整理成可复制的报告。" />
          )}
          {error && <p className="error">{error}</p>}
          <div className="report-actions">
            <button className="soft-button" disabled={!report} onClick={copyReport}>复制报告</button>
            <button className="soft-button" disabled={!report} onClick={downloadMarkdown}>导出 MD</button>
            <button className="soft-button" disabled={!activeSnapshot} onClick={openActiveSource}>打开来源 ↗</button>
          </div>
        </section>
      </aside>

      {modal === "history" && (
        <Modal title="全部历史任务" onClose={() => setModal(null)}>
          <input
            className="field"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="搜索历史任务..."
          />
          <div className="modal-list">
            {filteredHistory.length === 0 ? (
              <EmptyState title="暂无历史" detail="运行一次任务后，这里会显示可回看的历史记录。" />
            ) : (
              filteredHistory.map((item) => (
                <button key={item.id} className="modal-row" onClick={() => loadRun(item)}>
                  <strong>{item.task.split("\n")[0]}</strong>
                  <span>{statusText[item.status] ?? item.status} · {item.facts.length} 行数据 · {item.report?.sources.length ?? 0} 个来源</span>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {modal === "presets" && (
        <Modal title="预设管理" onClose={() => setModal(null)}>
          <div className="inline-form">
            <input className="field" value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} placeholder="预设名称" />
            <button className="primary-button" onClick={saveCurrentAsPreset}>保存当前任务</button>
          </div>
          <div className="modal-actions compact">
            <button className="soft-button" onClick={resetPresets}>恢复内置预设</button>
          </div>
          <div className="modal-list">
            {presets.map((preset) => (
              <div key={preset.id} className="modal-row preset-row">
                <button className="modal-row-main" onClick={() => applyPreset(preset)}>
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                </button>
                <button
                  className="soft-button danger"
                  onClick={() => deletePreset(preset.id)}
                  disabled={!preset.id.startsWith("preset-")}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal === "plan" && (
        <Modal title="执行计划" onClose={() => setModal(null)}>
          {plan ? <PlanView plan={plan} /> : <EmptyState title="暂无计划" detail="运行任务后会显示 Agent 的步骤和安全策略。" />}
        </Modal>
      )}

      {modal === "data" && (
        <Modal title="完整数据表" onClose={() => setModal(null)} wide>
          <FactTable facts={facts} emptyText="暂无数据。" />
          <div className="modal-actions">
            <button className="soft-button" onClick={downloadCsv}>导出 CSV</button>
          </div>
        </Modal>
      )}

      {modal === "context" && (
        <Modal title="补充上下文" onClose={() => setModal(null)}>
          <textarea
            className="context-field"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="例如：优先看官网；报告要适合写进简历；关注免费版限制和团队协作能力。"
          />
          <div className="modal-actions">
            <button className="primary-button" onClick={() => { setModal(null); showToast("上下文已保存。"); }}>保存上下文</button>
          </div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal title="运行设置" onClose={() => setModal(null)}>
          <div className="settings-grid">
            <Setting label="运行模式" value={runModeText[runMode]} action="切换" onClick={cycleRunMode} />
            <Setting label="浏览权限" value="只读" action="查看说明" onClick={() => setModal("help")} />
            <Setting label="演示稳定性" value="已启用种子兜底" action="知道了" onClick={() => showToast("真实浏览失败时会回退到演示数据。")} />
          </div>
        </Modal>
      )}

      {modal === "help" && (
        <Modal title="怎么使用 WebPilot" onClose={() => setModal(null)}>
          <div className="help-copy">
            <p>1. 在任务框里输入要调研的网页目标，例如“对比 Notion、ClickUp 和 Linear 的定价”。</p>
            <p>2. 可选：添加上下文，限定来源、输出格式或关注点。</p>
            <p>3. 点击运行，查看时间线、浏览器预览、抽取表和最终报告。</p>
            <p>4. 报告可以复制为 Markdown，数据可以导出 CSV，来源可以新窗口打开。</p>
            <p>安全边界：当前版本默认只读，不登录、不提交表单、不下载文件、不付款。</p>
          </div>
        </Modal>
      )}
    </main>
  );
}

function StageStep({ name, detail, active, done, warning }: { name: string; detail: string; active?: boolean; done?: boolean; warning?: boolean }) {
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
  onChange,
  showToast
}: {
  state: "waiting" | "approved" | "skipped";
  onChange: (state: "waiting" | "approved" | "skipped") => void;
  showToast: (message: string) => void;
}) {
  const stateText = state === "approved" ? "已确认" : state === "skipped" ? "已跳过" : "等待确认";
  return (
    <div className={`approval-card ${state}`}>
      <div className="approval-head">
        <strong>需要人工确认</strong>
        <span>{stateText}</span>
      </div>
      <p>WebPilot 默认阻止登录、结账、下载文件和提交表单。当前运行只读取公开网页，不会替你做高风险操作。</p>
      <div className="approval-actions">
        <button className="primary-button" onClick={() => { onChange("approved"); showToast("已确认只读安全策略。"); }}>确认</button>
        <button className="soft-button" onClick={() => { onChange("approved"); showToast("本次运行已确认。"); }}>仅本次确认</button>
        <button className="soft-button" onClick={() => { onChange("skipped"); showToast("已跳过确认卡片。"); }}>跳过步骤</button>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FactTable({ facts, emptyText }: { facts: ExtractedFact[]; emptyText: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>产品</th>
            <th>方案</th>
            <th>价格</th>
            <th>计费</th>
            <th>备注</th>
            <th>置信度</th>
          </tr>
        </thead>
        <tbody>
          {facts.length === 0 ? (
            <tr>
              <td colSpan={6}>{emptyText}</td>
            </tr>
          ) : (
            facts.map((fact, index) => (
              <tr key={`${fact.product}-${fact.plan}-${index}`}>
                <td>{fact.product}</td>
                <td>{fact.plan}</td>
                <td>{fact.price}</td>
                <td>{fact.billing}</td>
                <td>{fact.notes}</td>
                <td>{Math.round(fact.confidence * 100)}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ report }: { report: AgentReport }) {
  return (
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
            <a href={source.url} target="_blank" rel="noreferrer">{source.target}</a>
          </li>
        ))}
      </ol>
    </article>
  );
}

function PlanView({ plan }: { plan: AgentPlan }) {
  return (
    <div className="plan-view">
      <p><strong>目标：</strong>{plan.goal}</p>
      <p><strong>安全策略：</strong>{plan.riskPolicy}</p>
      <h3>目标网页</h3>
      <ul>
        {plan.targets.map((target) => (
          <li key={target.name}>{target.name} · {target.officialUrl ?? target.query}</li>
        ))}
      </ul>
      <h3>执行步骤</h3>
      <ol>
        {plan.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className={`modal-panel ${wide ? "wide" : ""}`}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Setting({ label, value, action, onClick }: { label: string; value: string; action: string; onClick: () => void }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <button className="soft-button" onClick={onClick}>{action}</button>
    </div>
  );
}

function progressFromStage(stage: string, status: string) {
  if (status === "completed") return 100;
  if (stage === "plan") return 18;
  if (stage === "run") return 42;
  if (stage === "extract") return 68;
  if (stage === "report") return 88;
  return 0;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
