import type { AgentRun, RunEvent, RunMode, TimelineItem } from "@/lib/types/agent";
import { createId } from "@/lib/utils/ids";
import { nowIso } from "@/lib/utils/time";
import { browseTarget } from "./browser-runner";
import { extractFacts } from "./extractor";
import { createPlan } from "./planner";
import { buildReport } from "./reporter";
import { saveRun } from "@/lib/store/runs";

type Emit = (event: RunEvent) => void;

export async function runAgent(
  task: string,
  emit: Emit,
  options: { runMode?: RunMode; signal?: AbortSignal } = {}
): Promise<AgentRun> {
  const runMode = options.runMode ?? "smart";
  const signal = options.signal;
  const startedAt = nowIso();
  const run: AgentRun = {
    id: createId(),
    task,
    runMode,
    status: "planning",
    activeStage: "plan",
    createdAt: startedAt,
    updatedAt: startedAt,
    timeline: [],
    snapshots: [],
    facts: []
  };

  emit({ type: "run", run });

  try {
    assertNotAborted(signal);
    const planStarted = Date.now();
    const plan = await createPlan(task);
    assertNotAborted(signal);
    run.plan = plan;
    run.status = "running";
    run.activeStage = "run";
    run.updatedAt = nowIso();
    emit({ type: "stage", stage: "plan", status: "planning" });
    emitTimeline(run, emit, {
      title: "已生成执行计划",
      detail: `规划了 ${plan.steps.length} 个步骤，准备调研 ${plan.targets.length} 个对象。运行模式：${runModeLabel(runMode)}。`,
      status: "completed",
      durationMs: Date.now() - planStarted
    });

    emit({ type: "stage", stage: "run", status: "running" });

    for (const target of plan.targets) {
      assertNotAborted(signal);
      const browseStarted = Date.now();
      emitTimeline(run, emit, {
        title: `打开 ${target.name}`,
        detail: target.officialUrl ?? target.query,
        status: "running",
        url: target.officialUrl
      });
      const snapshot = await browseTarget(target, runMode);
      assertNotAborted(signal);
      run.snapshots.push(snapshot);
      run.updatedAt = nowIso();
      emit({ type: "snapshot", snapshot });
      emitTimeline(run, emit, {
        title: `已捕获 ${target.name}`,
        detail: `${snapshot.title}（${sourceTypeText(snapshot.sourceType)}）`,
        status: "completed",
        url: snapshot.url,
        durationMs: Date.now() - browseStarted
      });

      run.status = "extracting";
      run.activeStage = "extract";
      emit({ type: "stage", stage: "extract", status: "extracting" });
      const extractStarted = Date.now();
      const facts = await extractFacts(snapshot);
      assertNotAborted(signal);
      run.facts.push(...facts);
      emit({ type: "facts", facts: run.facts });
      emitTimeline(run, emit, {
        title: `已抽取 ${target.name} 信息`,
        detail: `新增 ${facts.length} 行结构化数据到对比表。`,
        status: facts.length > 0 ? "completed" : "warning",
        url: snapshot.url,
        durationMs: Date.now() - extractStarted
      });
    }

    run.status = "reporting";
    run.activeStage = "report";
    emit({ type: "stage", stage: "report", status: "reporting" });
    assertNotAborted(signal);
    const report = buildReport(plan, run.snapshots, run.facts);
    run.report = report;
    emit({ type: "report", report });
    emitTimeline(run, emit, {
      title: "最终报告已生成",
      detail: `引用了 ${report.sources.length} 个来源，生成 ${report.takeaways.length} 条关键结论。`,
      status: "completed"
    });

    run.status = "completed";
    run.activeStage = "report";
    run.updatedAt = nowIso();
    await saveRun(run);
    emit({ type: "done", run });
    return run;
  } catch (error) {
    if (isAbortError(error)) {
      run.status = "cancelled";
      run.error = "用户停止了当前运行。";
      run.updatedAt = nowIso();
      emitTimeline(run, emit, {
        title: "运行已停止",
        detail: "用户中断了当前浏览器工作流，本地已保存停止前的执行轨迹。",
        status: "warning"
      });
      await saveRun(run);
      emit({ type: "done", run });
      return run;
    }

    const message = error instanceof Error ? error.message : "未知的 Agent 运行错误";
    run.status = "failed";
    run.error = message;
    run.updatedAt = nowIso();
    emitTimeline(run, emit, {
      title: "运行失败",
      detail: message,
      status: "failed"
    });
    await saveRun(run);
    emit({ type: "error", message, run });
    return run;
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("Run aborted", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function emitTimeline(
  run: AgentRun,
  emit: Emit,
  item: Omit<TimelineItem, "id" | "index" | "timestamp">
) {
  const timelineItem: TimelineItem = {
    id: createId("step"),
    index: run.timeline.length + 1,
    timestamp: nowIso(),
    ...item
  };
  run.timeline.push(timelineItem);
  run.updatedAt = nowIso();
  emit({ type: "timeline", item: timelineItem });
}

function sourceTypeText(sourceType: string) {
  if (sourceType === "browser") return "浏览器";
  if (sourceType === "fetch") return "网页读取";
  if (sourceType === "seed") return "演示数据";
  return sourceType;
}

function runModeLabel(runMode: RunMode) {
  if (runMode === "demo") return "演示优先";
  if (runMode === "live") return "实时优先";
  return "智能自动";
}
