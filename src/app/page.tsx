"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentPlan,
  AgentReport,
  AgentRun,
  BrowserSnapshot,
  ExtractedFact,
  RunEvent,
  RunMode,
  RunStatus,
  TimelineItem
} from "@/lib/types/agent";
import { formatDuration } from "@/lib/utils/time";

type ModalName = "history" | "presets" | "plan" | "data" | "settings" | "diagnostics" | "help" | "context" | "script" | null;
type WorkTab = "trace" | "evidence" | "data" | "report";

type Preset = {
  id: string;
  name: string;
  prompt: string;
  description: string;
};

type HealthStatus = {
  ok: boolean;
  runtime: {
    node: string;
    platform: string;
    demoMode: boolean;
    runModeDefault: string;
    timeoutMs: number;
    maxPages: number;
    browserHeadless: boolean;
  };
  llm: {
    enabled: boolean;
    configured: boolean;
    model: string;
    baseUrl: string;
  };
  browser: {
    available: boolean;
    name: string;
    executablePath?: string;
    error?: string;
  };
  store: {
    dataDir: string;
    runsPath: string;
    runCount: number;
    maxRuns: number;
    sizeBytes: number;
    latestRunAt: string | null;
  };
};

const defaultTask = "对比 Notion、ClickUp 和 Linear 的定价，整理免费版、基础套餐与团队套餐的价格、计费周期及关键限制，并生成对比报告。";

const builtInPresets: Preset[] = [
  {
    id: "pricing",
    name: "SaaS 定价对比",
    prompt: defaultTask,
    description: "最适合简历展示：计划、浏览、抽取、报告四段链路都清楚。"
  },
  {
    id: "features",
    name: "功能矩阵分析",
    prompt: "对比 Notion、ClickUp 和 Linear 的核心功能、目标用户、协作能力和自动化限制，输出结构化表格。",
    description: "强调跨页面信息归一化和横向比较。"
  },
  {
    id: "market",
    name: "市场研究报告",
    prompt: "调研适合 10 人以下团队的 AI 会议纪要工具，比较价格、集成、隐私能力和推荐场景。",
    description: "适合演示开放调研任务和报告生成。"
  },
  {
    id: "finance",
    name: "收费差异分析",
    prompt: "分析 Stripe 和 Paddle 面向 SaaS 产品的收费差异、结算方式、适用场景和风险点。",
    description: "适合展示可替换业务场景。"
  }
];

const storageKeys = {
  presets: "webpilot.presets",
  runMode: "webpilot.runMode",
  autoScroll: "webpilot.autoScroll"
};

const statusText: Record<RunStatus | "idle", string> = {
  idle: "空闲",
  planning: "规划中",
  running: "执行中",
  extracting: "抽取中",
  reporting: "生成报告",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止"
};

const sourceText: Record<string, string> = {
  browser: "真实浏览",
  fetch: "网页读取",
  seed: "演示数据",
  idle: "待命"
};

const runModes: Array<{ mode: RunMode; title: string; detail: string; icon: string }> = [
  { mode: "demo", title: "演示模式", detail: "稳定、快速，适合录屏和面试展示。", icon: "▣" },
  { mode: "smart", title: "智能模式", detail: "自动选择实时网页或演示兜底。", icon: "✦" },
  { mode: "live", title: "实时模式", detail: "优先抓取真实网页，失败后降级。", icon: "◎" }
];

const runModeText: Record<RunMode, string> = {
  smart: "智能",
  demo: "演示",
  live: "实时"
};

const workTabs: Array<{ id: WorkTab; label: string }> = [
  { id: "trace", label: "执行轨迹" },
  { id: "evidence", label: "浏览证据" },
  { id: "data", label: "抽取数据" },
  { id: "report", label: "交付报告" }
];

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
  const [runMode, setRunMode] = useState<RunMode>("demo");
  const [historyQuery, setHistoryQuery] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [selectedSnapshotUrl, setSelectedSnapshotUrl] = useState("");
  const [workTab, setWorkTab] = useState<WorkTab>("trace");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const activeStage = run?.activeStage ?? "plan";
  const status = run?.status ?? "idle";
  const completedSteps = timeline.filter((item) => item.status === "completed").length;
  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.url === selectedSnapshotUrl) ?? snapshots.at(-1),
    [selectedSnapshotUrl, snapshots]
  );
  const visibleFacts = useMemo(() => facts.slice(0, 10), [facts]);
  const avgConfidence = useMemo(() => averageConfidence(facts), [facts]);
  const evidenceQuality = useMemo(() => buildEvidenceQuality(snapshots, facts), [snapshots, facts]);
  const portfolioScript = useMemo(
    () => buildPortfolioScript({ run, report, facts, snapshots, runMode }),
    [run, report, facts, snapshots, runMode]
  );
  const runSummary = useMemo(
    () => buildRunSummary({ run, timeline, facts, snapshots, report }),
    [run, timeline, facts, snapshots, report]
  );
  const progress = progressFromStage(activeStage, status);
  const plan = run?.plan;

  const filteredHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return history;
    return history.filter((item) => item.task.toLowerCase().includes(query));
  }, [history, historyQuery]);

  useEffect(() => {
    void loadHistory();
    void loadHealth();
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
      // Local settings are optional. Bad browser storage should not block the product.
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
      // History is a convenience panel. The core run path should still work.
    }
  }

  async function loadHealth() {
    try {
      setHealthError("");
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("健康检查接口暂不可用。");
      const data = (await response.json()) as HealthStatus;
      setHealth(data);
    } catch (healthCheckError) {
      setHealthError(healthCheckError instanceof Error ? healthCheckError.message : "健康检查失败。");
    }
  }

  async function startRun(event?: FormEvent) {
    event?.preventDefault();
    if (!task.trim() || isRunning) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setError(null);
    setRun(null);
    setTimeline([]);
    setFacts([]);
    setSnapshots([]);
    setReport(null);
    setApprovalState("waiting");
    setSelectedSnapshotUrl("");
    setWorkTab("trace");
    setModal(null);

    try {
      const taskWithContext = context.trim() ? `${task.trim()}\n\n补充上下文：${context.trim()}` : task.trim();
      const response = await fetch("/api/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskWithContext, runMode }),
        signal: controller.signal
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
      if (controller.signal.aborted) {
        showToast("已停止当前运行。");
      } else {
        setError(runError instanceof Error ? runError.message : "运行失败，请稍后重试。");
      }
    } finally {
      abortRef.current = null;
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
      setSelectedSnapshotUrl(event.snapshot.url);
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
      setSelectedSnapshotUrl(event.run.snapshots.at(-1)?.url ?? "");
      setFacts(event.run.facts);
      setReport(event.run.report ?? null);
      setWorkTab("trace");
      setHistory((current) => [event.run, ...current.filter((item) => item.id !== event.run.id)].slice(0, 100));
      void loadHealth();
      showToast(event.run.status === "cancelled" ? "任务已停止，已保存当前轨迹。" : "任务已完成，报告和数据已保存。");
    }
    if (event.type === "error") {
      setError(event.message);
      if (event.run) setRun(event.run);
    }
  }

  function stopRun() {
    abortRef.current?.abort();
  }

  function newTask() {
    abortRef.current?.abort();
    setTask("");
    setContext("");
    setRun(null);
    setTimeline([]);
    setFacts([]);
    setSnapshots([]);
    setSelectedSnapshotUrl("");
    setReport(null);
    setError(null);
    setApprovalState("waiting");
    setWorkTab("trace");
    setModal(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function applyPreset(preset: Preset) {
    setTask(preset.prompt);
    setContext("");
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
      description: context.trim() ? `包含上下文：${context.trim().slice(0, 26)}...` : "从当前任务保存，可用于下次演示。"
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

  async function clearHistory() {
    if (!window.confirm("确认清空本地任务历史吗？这只会删除本机演示记录。")) return;
    const response = await fetch("/api/tasks", { method: "DELETE" });
    if (!response.ok) {
      showToast("清空历史失败，请稍后重试。");
      return;
    }
    setHistory([]);
    void loadHealth();
    showToast("本地任务历史已清空。");
  }

  function exportHistory() {
    if (history.length === 0) {
      showToast("还没有历史任务可备份。");
      return;
    }
    downloadFile(
      `webpilot-history-${fileDate()}.json`,
      JSON.stringify({ schema: "webpilot-history-v1", exportedAt: new Date().toISOString(), runs: history }, null, 2),
      "application/json;charset=utf-8"
    );
    showToast("本地历史备份已导出。");
  }

  async function importHistoryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as { runs?: AgentRun[] } | AgentRun[];
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const data = (await response.json()) as { runs?: AgentRun[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "导入失败。");
      setHistory(data.runs ?? []);
      void loadHealth();
      showToast(`已恢复 ${data.runs?.length ?? 0} 条本地历史。`);
    } catch (importError) {
      showToast(importError instanceof Error ? importError.message : "历史备份文件无法识别。");
    }
  }

  function loadRun(selectedRun: AgentRun) {
    abortRef.current?.abort();
    setRun(selectedRun);
    setTask(selectedRun.task);
    setTimeline(selectedRun.timeline);
    setSnapshots(selectedRun.snapshots);
    setSelectedSnapshotUrl(selectedRun.snapshots.at(-1)?.url ?? "");
    setFacts(selectedRun.facts);
    setReport(selectedRun.report ?? null);
    setError(selectedRun.error ?? null);
    setApprovalState("approved");
    setWorkTab(selectedRun.report ? "report" : "trace");
    setModal(null);
    showToast("已载入历史任务。");
  }

  async function copyReport() {
    if (!report) {
      showToast("还没有报告可复制。");
      return;
    }
    await copyText(report.markdown, "报告 Markdown 已复制。");
  }

  async function copyScript() {
    await copyText(portfolioScript, "简历展示脚本已复制。");
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch {
      showToast("当前浏览器不允许直接复制，可以使用导出文件。");
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

  function downloadRunPackage() {
    if (!run && timeline.length === 0 && facts.length === 0 && !report) {
      showToast("还没有可导出的运行包。");
      return;
    }
    downloadFile(
      `webpilot-run-package-${fileDate()}.json`,
      JSON.stringify(
        {
          schema: "webpilot-run-package-v1",
          exportedAt: new Date().toISOString(),
          run,
          timeline,
          snapshots,
          facts,
          report,
          evidenceQuality,
          runSummary,
          portfolioScript
        },
        null,
        2
      ),
      "application/json;charset=utf-8"
    );
    showToast("完整运行包已导出。");
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
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <main className="app-shell">
      {toast && <div className="toast">{toast}</div>}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <strong>WebPilot Agent</strong>
          <span className="divider" />
          <span>浏览器工作流 Agent</span>
          <em>本地部署</em>
        </div>
        <div className="top-actions">
          <span className="online-dot" />
          <span>Agent 在线</span>
          <button className={`mode-pill ${health?.ok ? "healthy" : "warning"}`} onClick={() => setModal("diagnostics")}>
            本机健康 {health?.browser.available === false ? "需处理" : "正常"}
          </button>
          <button className="mode-pill" onClick={() => setModal("settings")}>
            {runModeText[runMode]}模式
          </button>
          <button className="icon-button" aria-label="帮助" onClick={() => setModal("help")}>?</button>
          <button className="soft-button" onClick={() => setModal("settings")}>设置</button>
          <span className="avatar">AK</span>
        </div>
      </header>

      <input
        ref={importInputRef}
        className="hidden-file"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importHistoryFile(event)}
      />

      <aside className="sidebar">
        <button className="new-task" onClick={newTask}>+ 新建任务 <span>Ctrl K</span></button>

        <NavGroup
          title="任务"
          items={[
            ["▣", "全部任务", `${history.length}`],
            ["♙", "我创建的", ""],
            ["☆", "收藏夹", ""],
            ["✓", "已完成", `${history.filter((item) => item.status === "completed").length}`]
          ]}
        />

        <section className="side-section">
          <div className="side-heading">
            <span>模板与示例</span>
            <button onClick={() => setModal("presets")}>管理</button>
          </div>
          <div className="preset-list">
            {presets.slice(0, 4).map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)} className="preset-item">
                <span>□</span>
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="side-section">
          <div className="side-heading">
            <span>运行记录</span>
            <button onClick={() => setModal("history")}>查看</button>
          </div>
          <div className="run-stats">
            <MetricPill label="今日运行" value={`${history.length}`} />
            <MetricPill label="失败任务" value={`${history.filter((item) => item.status === "failed").length}`} />
          </div>
        </section>

        <div className="sidebar-footer">
          <button onClick={() => setModal("settings")}>⚙ 设置</button>
          <button onClick={() => setModal("help")}>? 关于</button>
          <span>v2.0 本地版</span>
        </div>
      </aside>

      <section className="workspace">
        <form className="command-card panel" onSubmit={startRun}>
          <div className="command-head">
            <div>
              <span>创建浏览器工作流任务</span>
              <strong>{context.trim() ? "已添加上下文" : "可添加约束条件"}</strong>
            </div>
            <button type="button" onClick={() => setTask(defaultTask)}>恢复默认任务</button>
          </div>

          <textarea
            ref={textareaRef}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            aria-label="浏览器工作流任务"
            maxLength={1000}
            placeholder="例如：对比 Notion、ClickUp 和 Linear 的定价，输出带来源的中文报告..."
          />

          <div className="command-footer">
            <button type="button" className="ghost-button" onClick={() => setModal("context")}>添加上下文</button>
            <button type="button" className="ghost-button" onClick={saveCurrentAsPreset}>保存为预设</button>
            <label className="read-only-toggle">
              <span />
              只读浏览，不登录
            </label>
            {isRunning ? (
              <button type="button" className="danger-button" onClick={stopRun}>停止</button>
            ) : (
              <button className="primary-button" aria-label="运行工作流" disabled={!task.trim()}>运行</button>
            )}
          </div>
        </form>

        <section className="mode-card panel">
          <div className="panel-title compact">
            <strong>运行模式</strong>
            <span>{runModeText[runMode]}</span>
          </div>
          <div className="mode-grid">
            {runModes.map((item) => (
              <button
                key={item.mode}
                className={`mode-option ${runMode === item.mode ? "active" : ""}`}
                onClick={() => setRunMode(item.mode)}
              >
                <span>{item.icon}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="stage-card panel">
          <StageStep name="规划" detail="生成浏览计划" active={activeStage === "plan"} done={completedSteps > 0} />
          <StageStep name="执行" detail="访问网页" active={activeStage === "run"} done={snapshots.length > 0} />
          <StageStep name="确认" detail="只读安全边界" active={activeStage === "approval"} warning={approvalState === "waiting"} done={approvalState !== "waiting"} />
          <StageStep name="抽取" detail="整理事实" active={activeStage === "extract"} done={facts.length > 0} />
          <StageStep name="报告" detail="引用来源" active={activeStage === "report"} done={Boolean(report)} />
          <div className="progress-strip"><span style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="workbench panel">
          <div className="work-tabs">
            {workTabs.map((tab) => (
              <button key={tab.id} className={workTab === tab.id ? "active" : ""} onClick={() => setWorkTab(tab.id)}>
                {tab.label}
              </button>
            ))}
            <span>任务状态：{statusText[status]}</span>
          </div>
          <div className={`work-grid ${workTab === "trace" ? "" : "single-tab"}`}>
            <TimelinePanel
              timeline={timeline}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
              status={status}
              plan={plan}
              onViewPlan={() => setModal("plan")}
              endRef={timelineEndRef}
              hidden={workTab !== "trace"}
            />
            <EvidencePanel
              snapshots={snapshots}
              activeSnapshot={activeSnapshot}
              setActiveSnapshot={setSelectedSnapshotUrl}
              sourceLabel={sourceText[activeSnapshot?.sourceType ?? "idle"]}
              onOpenSource={openActiveSource}
              approvalState={approvalState}
              setApprovalState={setApprovalState}
              showToast={showToast}
              hidden={workTab !== "trace" && workTab !== "evidence"}
            />
            <DataPanel facts={facts} visibleFacts={visibleFacts} avgConfidence={avgConfidence} onFullData={() => setModal("data")} onDownloadCsv={downloadCsv} hidden={workTab !== "data"} />
            <ReportPanel report={report} onCopy={copyReport} onDownload={downloadMarkdown} onOpenSource={openActiveSource} hidden={workTab !== "report"} />
          </div>
        </section>

        <section className="script-card panel">
          <div>
            <strong>简历展示脚本（如何讲这个项目）</strong>
            <p>把“为什么做、怎么跑、怎么验证、怎么导出”压缩成 4 句话，方便面试时直接讲。</p>
          </div>
          <ol>
            {portfolioScript.split("\n").slice(0, 4).map((line) => (
              <li key={line}>{line.replace(/^\d+\.\s*/, "")}</li>
            ))}
          </ol>
          <div className="script-actions">
            <button className="soft-button" onClick={copyScript}>复制脚本</button>
            <button className="soft-button" onClick={() => setModal("script")}>查看完整</button>
          </div>
        </section>
      </section>

      <aside className="delivery">
        <DataPanel facts={facts} visibleFacts={visibleFacts} avgConfidence={avgConfidence} onFullData={() => setModal("data")} onDownloadCsv={downloadCsv} />
        <ReportPanel report={report} onCopy={copyReport} onDownload={downloadMarkdown} onOpenSource={openActiveSource} />
        <QualityPanel quality={evidenceQuality} snapshots={snapshots} />
        <OperationsPanel
          summary={runSummary}
          health={health}
          healthError={healthError}
          onDiagnostics={() => setModal("diagnostics")}
          onExportRunPackage={downloadRunPackage}
          onExportHistory={exportHistory}
          onImportHistory={() => importInputRef.current?.click()}
        />
        <section className="panel export-card">
          <PanelTitle title="导出与分享" meta="本地文件" />
          <div className="export-grid">
            <button onClick={downloadMarkdown} disabled={!report}>导出 MD</button>
            <button onClick={downloadCsv} disabled={facts.length === 0}>导出 CSV</button>
            <button onClick={copyScript}>复制展示脚本</button>
          </div>
        </section>
      </aside>

      {error && <div className="error-banner">{error}</div>}

      {modal === "history" && (
        <Modal title="全部历史任务" onClose={() => setModal(null)}>
          <input className="field" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索历史任务..." />
          <div className="modal-actions compact">
            <button className="soft-button danger" onClick={() => void clearHistory()} disabled={history.length === 0}>清空历史</button>
          </div>
          <div className="modal-list">
            {filteredHistory.length === 0 ? (
              <EmptyState title="暂无历史" detail="运行一次任务后，这里会显示可回看的历史记录。" />
            ) : (
              filteredHistory.map((item) => (
                <button key={item.id} className="modal-row" onClick={() => loadRun(item)}>
                  <strong>{taskTitle(item.task)}</strong>
                  <span>{statusText[item.status]} · {item.facts.length} 行数据 · {item.report?.sources.length ?? 0} 个来源</span>
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
                <button className="soft-button danger" onClick={() => deletePreset(preset.id)} disabled={!preset.id.startsWith("preset-")}>删除</button>
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
            <LocalHealthOverview health={health} healthError={healthError} onRefresh={() => void loadHealth()} onDiagnostics={() => setModal("diagnostics")} />
            {runModes.map((item) => (
              <Setting key={item.mode} label={item.title} value={item.detail} action={runMode === item.mode ? "已选择" : "选择"} onClick={() => setRunMode(item.mode)} />
            ))}
            <Setting label="自动滚动" value={autoScroll ? "执行轨迹会自动跟随最新步骤" : "手动查看执行轨迹"} action={autoScroll ? "关闭" : "开启"} onClick={() => setAutoScroll((value) => !value)} />
            <Setting label="浏览权限" value="只读，不登录、不付款、不提交表单" action="查看说明" onClick={() => setModal("help")} />
            <div className="setting-row">
              <div>
                <strong>本地数据备份</strong>
                <span>导出或恢复任务历史，换电脑也能保留演示记录。</span>
              </div>
              <div className="setting-actions">
                <button className="soft-button" onClick={exportHistory}>导出</button>
                <button className="soft-button" onClick={() => importInputRef.current?.click()}>恢复</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {modal === "diagnostics" && (
        <Modal title="本机诊断" onClose={() => setModal(null)} wide>
          <DiagnosticsView health={health} healthError={healthError} onRefresh={() => void loadHealth()} />
        </Modal>
      )}

      {modal === "help" && (
        <Modal title="怎么使用 WebPilot" onClose={() => setModal(null)}>
          <div className="help-copy">
            <p>1. 输入网页调研任务，例如“对比 Notion、ClickUp 和 Linear 的定价”。</p>
            <p>2. 选择演示、智能或实时模式；演示模式最适合录屏和面试。</p>
            <p>3. 点击运行，观察执行轨迹、浏览证据、抽取数据和交付报告。</p>
            <p>4. 报告可以导出 Markdown，结构化数据可以导出 CSV。</p>
            <p>安全边界：当前版本默认只读，不登录、不提交表单、不下载文件、不付款。</p>
          </div>
        </Modal>
      )}

      {modal === "script" && (
        <Modal title="简历展示脚本" onClose={() => setModal(null)}>
          <div className="script-full">
            {portfolioScript.split("\n").map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={copyScript}>复制脚本</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function NavGroup({ title, items }: { title: string; items: Array<[string, string, string]> }) {
  return (
    <section className="side-section">
      <p className="section-label">{title}</p>
      <div className="nav-list">
        {items.map(([icon, label, value], index) => (
          <button key={label} className={index === 0 ? "active" : ""}>
            <span>{icon}</span>
            <strong>{label}</strong>
            {value && <em>{value}</em>}
          </button>
        ))}
      </div>
    </section>
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

function TimelinePanel({
  timeline,
  autoScroll,
  setAutoScroll,
  status,
  plan,
  onViewPlan,
  endRef,
  hidden
}: {
  timeline: TimelineItem[];
  autoScroll: boolean;
  setAutoScroll: (value: boolean | ((current: boolean) => boolean)) => void;
  status: RunStatus | "idle";
  plan?: AgentPlan;
  onViewPlan: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
  hidden?: boolean;
}) {
  return (
    <section className={`timeline-panel sub-panel ${hidden ? "tab-hidden" : ""}`}>
      <PanelTitle title="执行轨迹" meta={statusText[status]} />
      <div className="timeline">
        {timeline.length === 0 ? (
          <EmptyState title="准备就绪" detail="点击运行后，你会看到规划、浏览、抽取和生成报告的全过程。" />
        ) : (
          timeline.map((item) => <TimelineRow key={item.id} item={item} />)
        )}
        <div ref={endRef} />
      </div>
      <div className="panel-footer">
        <button className={`text-control ${autoScroll ? "selected" : ""}`} onClick={() => setAutoScroll((value) => !value)}>
          自动滚动 {autoScroll ? "开" : "关"}
        </button>
        <button className="soft-button" onClick={onViewPlan} disabled={!plan}>查看计划</button>
      </div>
    </section>
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

function EvidencePanel({
  snapshots,
  activeSnapshot,
  setActiveSnapshot,
  sourceLabel,
  onOpenSource,
  approvalState,
  setApprovalState,
  showToast,
  hidden
}: {
  snapshots: BrowserSnapshot[];
  activeSnapshot?: BrowserSnapshot;
  setActiveSnapshot: (url: string) => void;
  sourceLabel: string;
  onOpenSource: () => void;
  approvalState: "waiting" | "approved" | "skipped";
  setApprovalState: (state: "waiting" | "approved" | "skipped") => void;
  showToast: (message: string) => void;
  hidden?: boolean;
}) {
  return (
    <section className={`evidence-panel sub-panel ${hidden ? "tab-hidden" : ""}`}>
      <PanelTitle title="浏览证据" meta={sourceLabel} />
      <div className="browser-address">
        <button onClick={onOpenSource} aria-label="打开当前来源">↗</button>
        <span>{activeSnapshot?.url ?? "等待浏览器会话启动..."}</span>
        <button onClick={onOpenSource} disabled={!activeSnapshot} aria-label="新窗口打开">□</button>
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
      <div className="evidence-strip">
        {snapshots.length === 0 ? (
          <span>运行后会显示页面证据快照。</span>
        ) : (
          snapshots.map((snapshot, index) => (
            <button key={`${snapshot.url}-${index}`} className={activeSnapshot?.url === snapshot.url ? "active" : ""} onClick={() => setActiveSnapshot(snapshot.url)}>
              <strong>{snapshot.target}</strong>
              <small>{sourceText[snapshot.sourceType]}</small>
            </button>
          ))
        )}
      </div>
      <ApprovalCard state={approvalState} onChange={setApprovalState} showToast={showToast} />
    </section>
  );
}

function DataPanel({
  facts,
  visibleFacts,
  avgConfidence,
  onFullData,
  onDownloadCsv,
  hidden
}: {
  facts: ExtractedFact[];
  visibleFacts: ExtractedFact[];
  avgConfidence: string;
  onFullData: () => void;
  onDownloadCsv: () => void;
  hidden?: boolean;
}) {
  return (
    <section className={`facts-panel panel ${hidden ? "tab-hidden" : ""}`}>
      <PanelTitle title="抽取数据" meta={`${facts.length} 行`} />
      <div className="metric-row">
        <MetricCard label="来源" value={`${new Set(facts.map((fact) => fact.sourceUrl)).size || 0}`} />
        <MetricCard label="字段" value={`${facts.length * 5}`} />
        <MetricCard label="平均置信度" value={avgConfidence} />
      </div>
      <FactTable facts={visibleFacts} emptyText="还没有抽取到事实。" />
      <div className="split-actions">
        <button className="soft-button" onClick={onFullData} disabled={facts.length === 0}>完整数据表</button>
        <button className="soft-button" onClick={onDownloadCsv} disabled={facts.length === 0}>导出 CSV</button>
      </div>
    </section>
  );
}

function ReportPanel({
  report,
  onCopy,
  onDownload,
  onOpenSource,
  hidden
}: {
  report: AgentReport | null;
  onCopy: () => void;
  onDownload: () => void;
  onOpenSource: () => void;
  hidden?: boolean;
}) {
  return (
    <section className={`report-panel panel ${hidden ? "tab-hidden" : ""}`}>
      <PanelTitle title="交付报告" meta="MD" />
      {report ? <ReportView report={report} /> : <EmptyState title="报告会显示在这里" detail="WebPilot 会把抽取数据整理成可复制、可导出的 Markdown 报告。" />}
      <div className="report-actions">
        <button className="soft-button" disabled={!report} onClick={onCopy}>复制报告</button>
        <button className="soft-button" disabled={!report} onClick={onDownload}>导出 MD</button>
        <button className="soft-button" disabled={!report} onClick={onOpenSource}>打开来源 ↗</button>
      </div>
    </section>
  );
}

function QualityPanel({ quality, snapshots }: { quality: ReturnType<typeof buildEvidenceQuality>; snapshots: BrowserSnapshot[] }) {
  return (
    <section className="panel quality-panel">
      <PanelTitle title="来源质量评估" meta={quality.label} />
      <div className="quality-score">
        <strong>{quality.score}%</strong>
        <span>{quality.summary}</span>
      </div>
      <div className="quality-grid">
        <MetricPill label="官方/演示来源" value={`${quality.seedOrOfficial}/${Math.max(snapshots.length, 1)}`} />
        <MetricPill label="抓取成功率" value={`${quality.captureRate}%`} />
        <MetricPill label="数据一致性" value={quality.consistency} />
      </div>
    </section>
  );
}

function OperationsPanel({
  summary,
  health,
  healthError,
  onDiagnostics,
  onExportRunPackage,
  onExportHistory,
  onImportHistory
}: {
  summary: ReturnType<typeof buildRunSummary>;
  health: HealthStatus | null;
  healthError: string;
  onDiagnostics: () => void;
  onExportRunPackage: () => void;
  onExportHistory: () => void;
  onImportHistory: () => void;
}) {
  const healthLabel = healthError ? "异常" : health ? "正常" : "检测中";
  return (
    <section className="panel ops-card">
      <PanelTitle title="本地运维中心" meta={healthLabel} />
      <div className="ops-summary">
        <div>
          <span>本次运行</span>
          <strong>{summary.status}</strong>
          <small>{summary.nextAction}</small>
        </div>
        <div>
          <span>历史记录</span>
          <strong>{health ? `${health.store.runCount}/${health.store.maxRuns}` : "--"}</strong>
          <small>{health ? formatBytes(health.store.sizeBytes) : "等待检测"}</small>
        </div>
      </div>
      <div className="ops-grid">
        <button onClick={onExportRunPackage}>导出运行包</button>
        <button onClick={onExportHistory}>备份历史</button>
        <button onClick={onImportHistory}>恢复历史</button>
        <button onClick={onDiagnostics}>诊断详情</button>
      </div>
    </section>
  );
}

function LocalHealthOverview({
  health,
  healthError,
  onRefresh,
  onDiagnostics
}: {
  health: HealthStatus | null;
  healthError: string;
  onRefresh: () => void;
  onDiagnostics: () => void;
}) {
  const browserText = health?.browser.available ? "浏览器运行时可用" : health ? "浏览器运行时异常" : "等待检测";
  const llmText = health?.llm.enabled ? `LLM 已启用：${health.llm.model}` : health?.llm.configured ? "已配置 API，但演示模式优先" : "未配置 API，使用本地演示链路";
  return (
    <div className="health-overview">
      <div>
        <strong>本机健康</strong>
        <span>{healthError || `${browserText} · ${llmText}`}</span>
      </div>
      <div className="setting-actions">
        <button className="soft-button" onClick={onRefresh}>重新检测</button>
        <button className="soft-button" onClick={onDiagnostics}>详情</button>
      </div>
    </div>
  );
}

function DiagnosticsView({
  health,
  healthError,
  onRefresh
}: {
  health: HealthStatus | null;
  healthError: string;
  onRefresh: () => void;
}) {
  if (healthError) {
    return (
      <div className="diagnostics">
        <EmptyState title="健康检查失败" detail={healthError} />
        <div className="modal-actions">
          <button className="primary-button" onClick={onRefresh}>重新检测</button>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="diagnostics">
        <EmptyState title="正在检测本机环境" detail="WebPilot 正在读取运行时、浏览器和本地历史存储状态。" />
      </div>
    );
  }

  return (
    <div className="diagnostics">
      <div className="diagnostics-grid">
        <DiagnosticItem label="运行时" value={`${health.runtime.node} · ${health.runtime.platform}`} state="ok" />
        <DiagnosticItem label="浏览器" value={health.browser.available ? `${health.browser.name} 可用` : health.browser.error ?? "不可用"} state={health.browser.available ? "ok" : "warn"} />
        <DiagnosticItem label="模型 API" value={health.llm.enabled ? `${health.llm.model} 已启用` : health.llm.configured ? "已配置，当前演示模式不调用" : "未配置，使用本地演示链路"} state={health.llm.enabled || !health.llm.configured ? "ok" : "warn"} />
        <DiagnosticItem label="数据目录" value={health.store.dataDir} state="ok" />
        <DiagnosticItem label="历史容量" value={`${health.store.runCount}/${health.store.maxRuns} · ${formatBytes(health.store.sizeBytes)}`} state="ok" />
        <DiagnosticItem label="抓取设置" value={`${health.runtime.maxPages} 页上限 · ${health.runtime.timeoutMs}ms 超时 · ${health.runtime.browserHeadless ? "无头" : "可视"}浏览`} state="ok" />
      </div>
      <div className="help-copy">
        <p>本地版不会上传历史、报告或密钥。这里显示的是本机运行状态，用来排查“为什么实时抓取失败”“为什么没有调用模型 API”等问题。</p>
        <p>如果浏览器不可用，运行：npx playwright install chromium。没有 API key 时，演示模式仍可完整运行。</p>
      </div>
      <div className="modal-actions">
        <button className="primary-button" onClick={onRefresh}>重新检测</button>
      </div>
    </div>
  );
}

function DiagnosticItem({ label, value, state }: { label: string; value: string; state: "ok" | "warn" }) {
  return (
    <div className={`diagnostic-item ${state}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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
  const resolved = state !== "waiting";
  return (
    <div className={`approval-card ${state}`}>
      <div className="approval-head">
        <strong>需要人工确认</strong>
        <span>{stateText}</span>
      </div>
      <p>
        {resolved
          ? state === "approved"
            ? "只读安全策略已确认：本次运行不会登录、结账、下载文件或提交表单。"
            : "已跳过人工确认卡片，但 WebPilot 仍默认执行只读安全策略。"
          : "WebPilot 默认阻止登录、结账、下载文件和提交表单。当前运行只读取公开网页，不会替你做高风险操作。"}
      </p>
      {resolved ? (
        <div className="approval-resolved">安全边界已锁定</div>
      ) : (
        <div className="approval-actions">
          <button className="primary-button" onClick={() => { onChange("approved"); showToast("已确认只读安全策略。"); }}>确认</button>
          <button className="soft-button" onClick={() => { onChange("approved"); showToast("本次运行已确认。"); }}>仅本次确认</button>
          <button className="soft-button" onClick={() => { onChange("skipped"); showToast("已跳过确认卡片。"); }}>跳过步骤</button>
        </div>
      )}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pill">
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
            <tr><td colSpan={6}>{emptyText}</td></tr>
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
      <div className="takeaway-grid">
        {report.takeaways.slice(0, 4).map((takeaway) => (
          <div key={takeaway}>
            <span>•</span>
            <p>{takeaway}</p>
          </div>
        ))}
      </div>
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
  if (status === "cancelled") return 100;
  if (stage === "plan") return 18;
  if (stage === "run") return 46;
  if (stage === "extract") return 70;
  if (stage === "report") return 90;
  return 0;
}

function averageConfidence(facts: ExtractedFact[]) {
  if (facts.length === 0) return "--";
  return `${Math.round((facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length) * 100)}%`;
}

function buildEvidenceQuality(snapshots: BrowserSnapshot[], facts: ExtractedFact[]) {
  const seedOrOfficial = snapshots.filter((snapshot) => snapshot.sourceType === "seed" || snapshot.url.includes(snapshot.target.toLowerCase())).length;
  const captureRate = snapshots.length > 0 ? 100 : 0;
  const avg = facts.length > 0 ? Math.round((facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length) * 100) : 0;
  const score = Math.round((captureRate * 0.35) + (Math.min(seedOrOfficial, Math.max(snapshots.length, 1)) / Math.max(snapshots.length, 1)) * 35 + avg * 0.3);
  return {
    score,
    seedOrOfficial,
    captureRate,
    consistency: facts.length > 0 ? "结构化一致" : "待运行",
    label: score >= 80 ? "优秀" : score >= 60 ? "可用" : "待验证",
    summary: snapshots.length === 0 ? "运行后会评估来源覆盖、抓取成功率和抽取一致性。" : "来源覆盖、页面抓取和结构化抽取已形成可复核证据链。"
  };
}

function buildRunSummary({
  run,
  timeline,
  facts,
  snapshots,
  report
}: {
  run: AgentRun | null;
  timeline: TimelineItem[];
  facts: ExtractedFact[];
  snapshots: BrowserSnapshot[];
  report: AgentReport | null;
}) {
  const durationMs = timeline.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
  const browserCount = snapshots.filter((snapshot) => snapshot.sourceType === "browser").length;
  const fetchCount = snapshots.filter((snapshot) => snapshot.sourceType === "fetch").length;
  const seedCount = snapshots.filter((snapshot) => snapshot.sourceType === "seed").length;
  const avg = facts.length > 0 ? Math.round((facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length) * 100) : 0;
  const status = run ? statusText[run.status] : "待运行";
  const sourceMix = snapshots.length === 0 ? "暂无来源" : `浏览器 ${browserCount} · 读取 ${fetchCount} · 演示 ${seedCount}`;
  const nextAction = report
    ? "报告、表格和来源证据已可交付。"
    : run?.status === "failed"
      ? "建议切换演示模式或缩小任务范围后重试。"
      : run?.status === "cancelled"
        ? "可以从历史载入停止前轨迹，或重新运行。"
        : "运行后会生成可交付报告。";

  return {
    status,
    duration: durationMs > 0 ? formatDuration(durationMs) : "--",
    sourceMix,
    dataRows: facts.length,
    confidence: facts.length > 0 ? `${avg}%` : "--",
    nextAction
  };
}

function buildPortfolioScript({
  run,
  report,
  facts,
  snapshots,
  runMode
}: {
  run: AgentRun | null;
  report: AgentReport | null;
  facts: ExtractedFact[];
  snapshots: BrowserSnapshot[];
  runMode: RunMode;
}) {
  const sourceCount = report?.sources.length ?? snapshots.length;
  const factCount = facts.length;
  return [
    "1. 背景：我做的是一个本地可部署的浏览器工作流 Agent，用来解决网页调研过程不可见、结果难复核的问题。",
    `2. 核心亮点：它把自然语言任务拆成计划、只读浏览、结构化抽取、证据质量评估和 Markdown 报告导出，当前模式是${runModeText[runMode]}模式。`,
    `3. 技术实现：前端用 Next.js + React 管理流式状态，后端用 Playwright/fetch/种子数据降级链路，任务通过 SSE 实时回传。`,
    `4. 演示结果：${run?.status === "completed" ? `本次运行抽取了 ${factCount} 行数据、引用 ${sourceCount} 个来源，并生成可导出的报告。` : "运行后可以实时看到执行轨迹、浏览证据、抽取表和交付报告。"}`,
    "5. 安全边界：默认只读，不登录、不提交表单、不付款，人工确认卡片会把高风险操作挡住。"
  ].join("\n");
}

function taskTitle(task: string) {
  return task.split("\n")[0].trim().slice(0, 72) || "未命名任务";
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

function fileDate() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
